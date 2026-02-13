import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { env } from "~/env";

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

const extractedRecipeSchema = z.object({
  name: z.string().default(""),
  servings: z.number().default(4),
  ingredients: z
    .array(
      z.object({
        amount: z.string().default("1"),
        unit: z.string().default("whole"),
        ingredientName: z.string().default(""),
      }),
    )
    .default([]),
});

export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;

// ─── Shared ingredient extraction prompt ────────────────────────────────────

const INGREDIENT_FORMAT_INSTRUCTIONS = `Return a JSON object (and ONLY the JSON object, no markdown code fences) with:
- "name": the recipe name (string)
- "servings": number of servings (number)
- "ingredients": array of ALL ingredients, each with:
  - "amount": numeric quantity as string (e.g., "1.5", "0.25"). Use "1" if no quantity is specified.
  - "unit": measurement unit (cups, tbsp, tsp, oz, lb, grams, whole, pinch, cloves, cans, etc.). Use "whole" if no unit is specified.
  - "ingredientName": a SHORT, concise grocery-list name for the ingredient

Rules for "ingredientName":
- Use the name you'd write on a grocery list — just the item you'd buy at the store.
- Strip preparation instructions (chopped, minced, grated, divided, etc.)
- Strip serving notes (for garnish, for serving, optional, etc.)
- Strip verbose qualifiers (freshly grated, recipe homemade, store-bought, etc.)
- DO keep meaningful descriptors that affect what you buy (fresh, dried, Italian, sweet, lean, etc.)
- Examples:
  - "Freshly grated Parmesan cheese (for serving)" → "Parmesan cheese"
  - "1 recipe homemade basil pesto" → "Basil pesto"
  - "Fresh basil leaves (for garnish)" → "Fresh basil"
  - "chopped fresh parsley, divided" → "Fresh parsley"
  - "sweet Italian sausage" → "Sweet Italian sausage"
  - "garlic, crushed" → "Garlic"
  - "Sea salt and freshly ground black pepper" → "Salt and black pepper"

Important: Include EVERY ingredient from the recipe. Do not summarize or skip any.`;

// ─── HTML Processing Utilities ──────────────────────────────────────────────

/** Check if a JSON-LD @type value matches "Recipe" (can be string or array). */
function isRecipeType(type: unknown): boolean {
  if (type === "Recipe") return true;
  if (Array.isArray(type)) return type.includes("Recipe");
  return false;
}

/**
 * Try to extract schema.org/Recipe JSON-LD structured data from the page.
 */
function extractJsonLdRecipe(html: string): Record<string, unknown> | null {
  const ldJsonRegex =
    /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = ldJsonRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]!) as unknown;
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const obj = item as Record<string, unknown>;

        if (isRecipeType(obj["@type"])) return obj;

        if (Array.isArray(obj["@graph"])) {
          for (const node of obj["@graph"] as Record<string, unknown>[]) {
            if (isRecipeType(node["@type"])) return node;
          }
        }
      }
    } catch {
      // Invalid JSON in this block, skip
    }
  }

  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code as string)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code as string, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Strip HTML to clean text content for AI processing.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/**
 * Parse the AI response text into an ExtractedRecipe.
 */
function parseAiResponse(text: string): ExtractedRecipe {
  let jsonText = text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  const parsed = JSON.parse(jsonText) as ExtractedRecipe;
  return extractedRecipeSchema.parse(parsed);
}

// ─── tRPC Router ────────────────────────────────────────────────────────────

export const aiRouter = createTRPCRouter({
  importFromUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      // Fetch the page content
      let pageContent: string;
      try {
        const response = await fetch(input.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        pageContent = await response.text();
      } catch (error) {
        throw new Error(
          `Failed to fetch URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // ── Strategy 1: JSON-LD found → feed structured ingredient list to AI ──
      const jsonLd = extractJsonLdRecipe(pageContent);
      if (jsonLd) {
        const recipeName = decodeHtmlEntities((jsonLd.name as string) ?? "");
        const rawIngredients = (jsonLd.recipeIngredient as string[]) ?? [];
        const recipeYield = jsonLd.recipeYield;

        if (recipeName && rawIngredients.length > 0) {
          console.log(
            `[AI Import URL] Found JSON-LD with ${rawIngredients.length} ingredients, sending to AI for cleanup`,
          );

          try {
            const response = await anthropic.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4096,
              messages: [
                {
                  role: "user",
                  content: `I have structured recipe data that needs ingredient names cleaned up for a grocery list.

Recipe: "${recipeName}"
Servings: ${typeof recipeYield === "number" ? recipeYield : typeof recipeYield === "string" ? recipeYield : Array.isArray(recipeYield) ? recipeYield[0] : "4"}
Raw ingredients:
${rawIngredients.map((ing, i) => `${i + 1}. ${decodeHtmlEntities(ing)}`).join("\n")}

${INGREDIENT_FORMAT_INSTRUCTIONS}`,
                },
              ],
            });

            const textBlock = response.content.find((b) => b.type === "text");
            if (textBlock && textBlock.type === "text") {
              const result = parseAiResponse(textBlock.text);
              return { ...result, sourceUrl: input.url };
            }
          } catch (error) {
            console.error("[AI Import URL] JSON-LD cleanup error:", error);
            // Fall through to full-page AI extraction
          }
        }
      }

      // ── Strategy 2: No JSON-LD → strip HTML to text → send to AI ──
      console.log("[AI Import URL] No usable JSON-LD, falling back to full AI extraction");
      const cleanText = htmlToText(pageContent);
      const trimmed =
        cleanText.length > 15000
          ? cleanText.substring(0, 15000)
          : cleanText;

      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `You are extracting a recipe from a webpage. Below is the cleaned text content of the page. Extract ALL ingredients listed in the recipe — do not skip any.

${INGREDIENT_FORMAT_INSTRUCTIONS}

PAGE TEXT:
${trimmed}`,
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          const result = parseAiResponse(textBlock.text);
          return { ...result, sourceUrl: input.url };
        }
      } catch (error) {
        console.error("[AI Import URL] Error:", error);
        throw new Error(
          `Recipe extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      return {
        name: "",
        servings: 4,
        ingredients: [],
        sourceUrl: input.url,
      };
    }),

  importFromImage: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string(),
        mimeType: z
          .enum(["image/jpeg", "image/png", "image/gif", "image/webp"])
          .default("image/jpeg"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: input.mimeType,
                    data: input.imageBase64,
                  },
                },
                {
                  type: "text",
                  text: `Extract the recipe from this image. It may be a handwritten recipe card, a cookbook page, or a printed recipe.

${INGREDIENT_FORMAT_INSTRUCTIONS}

If servings are not visible, default to 4.
Include EVERY ingredient you can read. Do not skip any.`,
                },
              ],
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          return parseAiResponse(textBlock.text);
        }
      } catch (error) {
        console.error("[AI Import Image] Error:", error);
        throw new Error(
          `Recipe extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      return {
        name: "",
        servings: 4,
        ingredients: [],
      };
    }),
});
