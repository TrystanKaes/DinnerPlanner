import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  ingredients,
  mealPlans,
  recipes,
  shoppingListItems,
  shoppingLists,
} from "~/server/db/schema";
import { env } from "~/env";

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

function getWeekRange(weekStartDate: string) {
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    start: start.toISOString().split("T")[0]!,
    end: end.toISOString().split("T")[0]!,
  };
}

export const shoppingListRouter = createTRPCRouter({
  generate: protectedProcedure
    .input(z.object({ weekStartDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { start, end } = getWeekRange(input.weekStartDate);

      // Get all meals for the week with recipes and ingredients
      const meals = await ctx.db.query.mealPlans.findMany({
        where: and(gte(mealPlans.date, start), lte(mealPlans.date, end)),
        with: {
          recipe: {
            with: {
              ingredients: true,
            },
          },
        },
      });

      if (meals.length === 0) {
        throw new Error("No meals planned for this week");
      }

      // Build ingredient list scaled by serving multiplier
      const allIngredients = meals.flatMap((meal) => {
        const scale = parseFloat(meal.servingScale);
        return meal.recipe.ingredients.map((ing) => ({
          recipeName: meal.recipe.name,
          amount: parseFloat(ing.amount) * scale,
          unit: ing.unit,
          ingredientName: ing.ingredientName,
        }));
      });

      // Send to Claude Haiku for consolidation
      let consolidatedItems: Array<{
        ingredientName: string;
        estimatedAmount: string;
        sourceRecipes: string[];
        consolidationCertainty: number;
      }> = [];

      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-20250414",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `You are a shopping list consolidation assistant. Given the following list of ingredients needed for multiple recipes this week, consolidate similar ingredients, combine quantities across different units intelligently, and return flexible estimated ranges.

INGREDIENTS:
${JSON.stringify(allIngredients, null, 2)}

Return a JSON array (and ONLY the JSON array, no markdown code fences) where each item has:
- "ingredientName": the consolidated ingredient name
- "estimatedAmount": a flexible range string (e.g., "3-4 onions", "2 cups", "1 lb")
- "sourceRecipes": array of recipe names that need this ingredient
- "consolidationCertainty": 0-1 score (1.0 = exact, lower = estimated)

Key rules:
- Combine "1 cup diced onions" + "2 whole onions" → "~3-4 onions" with certainty 0.7
- Keep different forms separate if they truly differ (e.g., crushed vs whole tomatoes)
- Round quantities to practical shopping amounts
- Use common measurement units shoppers understand`,
            },
          ],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          consolidatedItems = JSON.parse(textBlock.text) as typeof consolidatedItems;
        }
      } catch (error) {
        // Fallback: if AI fails, just group by ingredient name
        const grouped = new Map<
          string,
          { amounts: string[]; recipes: Set<string> }
        >();

        allIngredients.forEach((ing) => {
          const key = ing.ingredientName.toLowerCase();
          if (!grouped.has(key)) {
            grouped.set(key, { amounts: [], recipes: new Set() });
          }
          const g = grouped.get(key)!;
          g.amounts.push(`${ing.amount} ${ing.unit}`);
          g.recipes.add(ing.recipeName);
        });

        consolidatedItems = Array.from(grouped.entries()).map(
          ([name, data]) => ({
            ingredientName: name,
            estimatedAmount: data.amounts.join(" + "),
            sourceRecipes: Array.from(data.recipes),
            consolidationCertainty: 0.5,
          }),
        );
      }

      // Delete existing shopping list for this week
      const existing = await ctx.db
        .select()
        .from(shoppingLists)
        .where(eq(shoppingLists.weekStartDate, start));

      if (existing[0]) {
        await ctx.db
          .delete(shoppingListItems)
          .where(eq(shoppingListItems.shoppingListId, existing[0].id));
        await ctx.db
          .delete(shoppingLists)
          .where(eq(shoppingLists.id, existing[0].id));
      }

      // Create new shopping list
      const [list] = await ctx.db
        .insert(shoppingLists)
        .values({
          weekStartDate: start,
        })
        .returning();

      if (list && consolidatedItems.length > 0) {
        await ctx.db.insert(shoppingListItems).values(
          consolidatedItems.map((item) => ({
            shoppingListId: list.id,
            ingredientName: item.ingredientName,
            estimatedAmount: item.estimatedAmount,
            sourceRecipes: item.sourceRecipes,
            certainty: item.consolidationCertainty.toString(),
          })),
        );
      }

      return list;
    }),

  getByWeek: protectedProcedure
    .input(z.object({ weekStartDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const { start } = getWeekRange(input.weekStartDate);

      return ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.weekStartDate, start),
        with: {
          items: true,
        },
      });
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        ingredientName: z.string().optional(),
        estimatedAmount: z.string().optional(),
        storeGroup: z.string().nullable().optional(),
        alreadyHave: z.boolean().optional(),
        checked: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const setValues: Record<string, unknown> = { manuallyEdited: true };

      if (updates.ingredientName !== undefined)
        setValues.ingredientName = updates.ingredientName;
      if (updates.estimatedAmount !== undefined)
        setValues.estimatedAmount = updates.estimatedAmount;
      if (updates.storeGroup !== undefined)
        setValues.storeGroup = updates.storeGroup;
      if (updates.alreadyHave !== undefined)
        setValues.alreadyHave = updates.alreadyHave;
      if (updates.checked !== undefined) setValues.checked = updates.checked;
      if (updates.notes !== undefined) setValues.notes = updates.notes;

      const [item] = await ctx.db
        .update(shoppingListItems)
        .set(setValues)
        .where(eq(shoppingListItems.id, id))
        .returning();

      return item;
    }),

  addItem: protectedProcedure
    .input(
      z.object({
        shoppingListId: z.string().uuid(),
        ingredientName: z.string().min(1),
        estimatedAmount: z.string().min(1),
        storeGroup: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .insert(shoppingListItems)
        .values({
          shoppingListId: input.shoppingListId,
          ingredientName: input.ingredientName,
          estimatedAmount: input.estimatedAmount,
          storeGroup: input.storeGroup ?? null,
          manuallyEdited: true,
        })
        .returning();

      return item;
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(shoppingListItems)
        .where(eq(shoppingListItems.id, input.id));
      return { success: true };
    }),

  clearChecks: protectedProcedure
    .input(z.object({ shoppingListId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(shoppingListItems)
        .set({ checked: false })
        .where(eq(shoppingListItems.shoppingListId, input.shoppingListId));
      return { success: true };
    }),
});
