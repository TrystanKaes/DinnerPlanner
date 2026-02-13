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
              "Mozilla/5.0 (compatible; DinnerPlanner/1.0; +http://localhost)",
          },
        });
        pageContent = await response.text();
      } catch {
        throw new Error("Failed to fetch URL. Please check the link.");
      }

      // Trim content to avoid token limits
      const trimmed =
        pageContent.length > 30000
          ? pageContent.substring(0, 30000)
          : pageContent;

      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-20250414",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `Extract the recipe from this webpage content. Return a JSON object (and ONLY the JSON object, no markdown code fences) with:
- "name": recipe name (string)
- "servings": number of servings (number)
- "ingredients": array of objects, each with:
  - "amount": numeric quantity as a string (e.g., "1.5")
  - "unit": measurement unit (cups, tbsp, tsp, oz, lb, grams, kg, whole, pinch, dash, cloves, cans, etc.)
  - "ingredientName": the ingredient name

If you cannot extract a field, use reasonable defaults. Handle both structured data (JSON-LD schema.org/Recipe) and unstructured page content.

WEBPAGE CONTENT:
${trimmed}`,
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          const parsed = JSON.parse(textBlock.text) as ExtractedRecipe;
          return {
            ...extractedRecipeSchema.parse(parsed),
            sourceUrl: input.url,
          };
        }
      } catch {
        // Fall through to empty result
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
          model: "claude-haiku-4-20250414",
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
                  text: `Extract the recipe from this image. It may be a handwritten recipe card, a cookbook page, or a printed recipe. Return a JSON object (and ONLY the JSON object, no markdown code fences) with:
- "name": recipe name (string)
- "servings": number of servings (number, default 4 if not visible)
- "ingredients": array of objects, each with:
  - "amount": numeric quantity as a string (e.g., "1.5")
  - "unit": measurement unit (cups, tbsp, tsp, oz, lb, grams, kg, whole, pinch, dash, cloves, cans, etc.)
  - "ingredientName": the ingredient name

If you cannot read a field, use reasonable defaults.`,
                },
              ],
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          const parsed = JSON.parse(textBlock.text) as ExtractedRecipe;
          return extractedRecipeSchema.parse(parsed);
        }
      } catch {
        // Fall through to empty result
      }

      return {
        name: "",
        servings: 4,
        ingredients: [],
      };
    }),
});
