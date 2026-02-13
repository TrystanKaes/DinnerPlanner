import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { mealPlans } from "~/server/db/schema";
import { getWeekRange, formatDateStr } from "~/server/utils/dates";

export const mealPlanRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        date: z.string(), // YYYY-MM-DD
        recipeId: z.string().uuid(),
        servingScale: z.string().default("1.0"),
        ownerId: z.string().nullable().optional(),
        supportIds: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Upsert — if a meal already exists for this date, update it
      const existing = await ctx.db
        .select()
        .from(mealPlans)
        .where(eq(mealPlans.date, input.date));

      if (existing.length > 0) {
        const [updated] = await ctx.db
          .update(mealPlans)
          .set({
            recipeId: input.recipeId,
            servingScale: input.servingScale,
            ownerId: input.ownerId ?? null,
            supportIds: input.supportIds,
          })
          .where(eq(mealPlans.date, input.date))
          .returning();
        return updated;
      }

      const [mealPlan] = await ctx.db
        .insert(mealPlans)
        .values({
          date: input.date,
          recipeId: input.recipeId,
          servingScale: input.servingScale,
          ownerId: input.ownerId ?? null,
          supportIds: input.supportIds,
        })
        .returning();

      return mealPlan;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        servingScale: z.string().optional(),
        ownerId: z.string().nullable().optional(),
        supportIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const setValues: Record<string, unknown> = {};

      if (updates.servingScale !== undefined)
        setValues.servingScale = updates.servingScale;
      if (updates.ownerId !== undefined) setValues.ownerId = updates.ownerId;
      if (updates.supportIds !== undefined)
        setValues.supportIds = updates.supportIds;

      const [mealPlan] = await ctx.db
        .update(mealPlans)
        .set(setValues)
        .where(eq(mealPlans.id, id))
        .returning();

      return mealPlan;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(mealPlans).where(eq(mealPlans.id, input.id));
      return { success: true };
    }),

  getWeek: protectedProcedure
    .input(z.object({ weekStartDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const { start, end } = getWeekRange(input.weekStartDate);

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

      return meals;
    }),

  copyWeek: protectedProcedure
    .input(
      z.object({
        sourceWeekStart: z.string(),
        targetWeekStart: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { start: sourceStart, end: sourceEnd } = getWeekRange(
        input.sourceWeekStart,
      );
      const { start: targetStart } = getWeekRange(input.targetWeekStart);

      // Get source meals
      const sourceMeals = await ctx.db
        .select()
        .from(mealPlans)
        .where(
          and(gte(mealPlans.date, sourceStart), lte(mealPlans.date, sourceEnd)),
        );

      // Clear target week
      const { start: tStart, end: tEnd } = getWeekRange(input.targetWeekStart);
      await ctx.db
        .delete(mealPlans)
        .where(and(gte(mealPlans.date, tStart), lte(mealPlans.date, tEnd)));

      // Copy meals with date offset
      const sourceStartDate = new Date(sourceStart + "T00:00:00");
      const targetStartDate = new Date(targetStart + "T00:00:00");

      if (sourceMeals.length > 0) {
        await ctx.db.insert(mealPlans).values(
          sourceMeals.map((meal) => {
            const mealDate = new Date(meal.date + "T00:00:00");
            const dayOffset = Math.round(
              (mealDate.getTime() - sourceStartDate.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            const newDate = new Date(targetStartDate);
            newDate.setDate(newDate.getDate() + dayOffset);

            return {
              date: formatDateStr(newDate),
              recipeId: meal.recipeId,
              servingScale: meal.servingScale,
              ownerId: meal.ownerId,
              supportIds: meal.supportIds ?? [],
            };
          }),
        );
      }

      return { success: true };
    }),

  clearWeek: protectedProcedure
    .input(z.object({ weekStartDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { start, end } = getWeekRange(input.weekStartDate);

      await ctx.db
        .delete(mealPlans)
        .where(and(gte(mealPlans.date, start), lte(mealPlans.date, end)));

      return { success: true };
    }),
});
