import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, isNull, sql, count, max } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { ingredients, mealPlans, recipes } from "~/server/db/schema";
import { formatDateStr } from "~/server/utils/dates";

const ingredientSchema = z.object({
  amount: z.string(),
  unit: z.string(),
  ingredientName: z.string(),
  sortOrder: z.number(),
});

export const recipeRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        servings: z.number().int().positive().default(4),
        complexity: z.number().int().min(1).max(5).default(3),
        tags: z.array(z.string()).default([]),
        photoUrls: z.array(z.string()).default([]),
        sourceUrl: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        ingredients: z.array(ingredientSchema).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { ingredients: ingredientList, ...recipeData } = input;

      const [recipe] = await ctx.db
        .insert(recipes)
        .values({
          ...recipeData,
          sourceUrl: recipeData.sourceUrl ?? null,
          notes: recipeData.notes ?? null,
          createdBy: ctx.userId,
        })
        .returning();

      if (ingredientList.length > 0 && recipe) {
        await ctx.db.insert(ingredients).values(
          ingredientList.map((ing) => ({
            recipeId: recipe.id,
            amount: ing.amount,
            unit: ing.unit,
            ingredientName: ing.ingredientName,
            sortOrder: ing.sortOrder,
          })),
        );
      }

      return recipe;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1),
        servings: z.number().int().positive(),
        complexity: z.number().int().min(1).max(5),
        tags: z.array(z.string()).default([]),
        photoUrls: z.array(z.string()).default([]),
        sourceUrl: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        ingredients: z.array(ingredientSchema).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ingredients: ingredientList, ...recipeData } = input;

      const [recipe] = await ctx.db
        .update(recipes)
        .set({
          ...recipeData,
          sourceUrl: recipeData.sourceUrl ?? null,
          notes: recipeData.notes ?? null,
        })
        .where(eq(recipes.id, id))
        .returning();

      // Replace all ingredients
      await ctx.db.delete(ingredients).where(eq(ingredients.recipeId, id));

      if (ingredientList.length > 0) {
        await ctx.db.insert(ingredients).values(
          ingredientList.map((ing) => ({
            recipeId: id,
            amount: ing.amount,
            unit: ing.unit,
            ingredientName: ing.ingredientName,
            sortOrder: ing.sortOrder,
          })),
        );
      }

      return recipe;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check if recipe is in any upcoming meal plans
      const today = formatDateStr(new Date());
      const upcomingMeals = await ctx.db
        .select()
        .from(mealPlans)
        .where(
          and(
            eq(mealPlans.recipeId, input.id),
            gte(mealPlans.date, today),
          ),
        );

      if (upcomingMeals.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Cannot delete — this recipe is assigned to upcoming meals. Remove it from meal plans first.",
        });
      }

      // Soft delete
      const [recipe] = await ctx.db
        .update(recipes)
        .set({ deletedAt: new Date() })
        .where(eq(recipes.id, input.id))
        .returning();

      return recipe;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const recipe = await ctx.db.query.recipes.findFirst({
        where: and(eq(recipes.id, input.id), isNull(recipes.deletedAt)),
        with: {
          ingredients: {
            orderBy: [asc(ingredients.sortOrder)],
          },
        },
      });

      return recipe ?? null;
    }),

  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        tags: z.array(z.string()).optional(),
        complexityMin: z.number().int().min(1).max(5).optional(),
        complexityMax: z.number().int().min(1).max(5).optional(),
        sort: z
          .enum([
            "mostRecentlyUsed",
            "leastRecentlyUsed",
            "mostFrequentlyUsed",
            "mostUnderused",
            "alphabetical",
            "newestCreated",
          ])
          .default("newestCreated"),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [isNull(recipes.deletedAt)];

      if (input.search) {
        conditions.push(ilike(recipes.name, `%${input.search}%`));
      }

      if (input.complexityMin) {
        conditions.push(gte(recipes.complexity, input.complexityMin));
      }

      if (input.complexityMax) {
        conditions.push(
          sql`${recipes.complexity} <= ${input.complexityMax}`,
        );
      }

      // Tag filtering at the DB level using array overlap
      if (input.tags && input.tags.length > 0) {
        conditions.push(
          sql`${recipes.tags} && ARRAY[${sql.join(
            input.tags.map((tag) => sql`${tag}`),
            sql`, `,
          )}]::text[]`,
        );
      }

      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      // For usage-based sorts, we need to join with meal_plans
      const needsUsageData = [
        "mostRecentlyUsed",
        "leastRecentlyUsed",
        "mostFrequentlyUsed",
        "mostUnderused",
      ].includes(input.sort);

      if (needsUsageData) {
        // Query with usage aggregation from meal_plans
        const usageSubquery = ctx.db
          .select({
            recipeId: mealPlans.recipeId,
            lastUsed: max(mealPlans.date).as("last_used"),
            useCount: count(mealPlans.id).as("use_count"),
          })
          .from(mealPlans)
          .groupBy(mealPlans.recipeId)
          .as("usage");

        let orderByClause;
        switch (input.sort) {
          case "mostRecentlyUsed":
            orderByClause = sql`${usageSubquery.lastUsed} DESC NULLS LAST`;
            break;
          case "leastRecentlyUsed":
            orderByClause = sql`${usageSubquery.lastUsed} ASC NULLS FIRST`;
            break;
          case "mostFrequentlyUsed":
            orderByClause = sql`${usageSubquery.useCount} DESC NULLS LAST`;
            break;
          case "mostUnderused":
            orderByClause = sql`${usageSubquery.useCount} ASC NULLS FIRST`;
            break;
          default:
            orderByClause = sql`${recipes.createdAt} DESC`;
        }

        const rows = await ctx.db
          .select({ id: recipes.id })
          .from(recipes)
          .leftJoin(usageSubquery, eq(recipes.id, usageSubquery.recipeId))
          .where(where)
          .orderBy(orderByClause)
          .limit(input.limit)
          .offset(input.cursor);

        const recipeIds = rows.map((r) => r.id);

        if (recipeIds.length === 0) {
          return { items: [], nextCursor: undefined };
        }

        // Fetch full recipe data for the sorted IDs
        const items = await ctx.db.query.recipes.findMany({
          where: sql`${recipes.id} IN (${sql.join(
            recipeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          with: {
            ingredients: {
              orderBy: [asc(ingredients.sortOrder)],
            },
          },
        });

        // Preserve the sort order from the aggregated query
        const idOrder = new Map(recipeIds.map((id, i) => [id, i]));
        items.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

        return {
          items,
          nextCursor:
            rows.length === input.limit
              ? input.cursor + input.limit
              : undefined,
        };
      }

      // Simple sorts (no usage data needed)
      let orderBy;
      switch (input.sort) {
        case "alphabetical":
          orderBy = [asc(recipes.name)];
          break;
        case "newestCreated":
        default:
          orderBy = [desc(recipes.createdAt)];
          break;
      }

      const items = await ctx.db.query.recipes.findMany({
        where,
        orderBy,
        limit: input.limit,
        offset: input.cursor,
        with: {
          ingredients: {
            orderBy: [asc(ingredients.sortOrder)],
          },
        },
      });

      return {
        items,
        nextCursor:
          items.length === input.limit
            ? input.cursor + input.limit
            : undefined,
      };
    }),

  // Get all unique tags for filter dropdowns
  allTags: protectedProcedure.query(async ({ ctx }) => {
    const allRecipes = await ctx.db
      .select({ tags: recipes.tags })
      .from(recipes)
      .where(isNull(recipes.deletedAt));

    const tagSet = new Set<string>();
    allRecipes.forEach((r) => {
      r.tags?.forEach((tag) => {
        if (tag) tagSet.add(tag);
      });
    });

    return Array.from(tagSet).sort();
  }),
});
