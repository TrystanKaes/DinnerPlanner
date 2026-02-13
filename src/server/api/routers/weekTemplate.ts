import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  mealPlans,
  weekTemplateMeals,
  weekTemplates,
} from "~/server/db/schema";

function getWeekRange(weekStartDate: string) {
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    start: start.toISOString().split("T")[0]!,
    end: end.toISOString().split("T")[0]!,
  };
}

export const weekTemplateRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        weekStartDate: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { start, end } = getWeekRange(input.weekStartDate);

      // Get current week's meals
      const meals = await ctx.db
        .select()
        .from(mealPlans)
        .where(and(gte(mealPlans.date, start), lte(mealPlans.date, end)));

      // Create template
      const [template] = await ctx.db
        .insert(weekTemplates)
        .values({
          name: input.name,
          createdBy: ctx.userId,
        })
        .returning();

      if (meals.length > 0 && template) {
        const weekStart = new Date(start + "T00:00:00");
        await ctx.db.insert(weekTemplateMeals).values(
          meals.map((meal) => {
            const mealDate = new Date(meal.date + "T00:00:00");
            const dayOfWeek = Math.round(
              (mealDate.getTime() - weekStart.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            return {
              templateId: template.id,
              dayOfWeek,
              recipeId: meal.recipeId,
              servingScale: meal.servingScale,
            };
          }),
        );
      }

      return template;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.weekTemplates.findMany({
      with: {
        meals: {
          with: {
            recipe: true,
          },
        },
      },
      orderBy: (weekTemplates, { desc }) => [desc(weekTemplates.createdAt)],
    });
  }),

  load: protectedProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
        targetWeekStart: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.query.weekTemplates.findFirst({
        where: eq(weekTemplates.id, input.templateId),
        with: { meals: true },
      });

      if (!template) throw new Error("Template not found");

      const { start, end } = getWeekRange(input.targetWeekStart);

      // Clear target week
      await ctx.db
        .delete(mealPlans)
        .where(and(gte(mealPlans.date, start), lte(mealPlans.date, end)));

      // Apply template
      const weekStart = new Date(start + "T00:00:00");

      if (template.meals.length > 0) {
        await ctx.db.insert(mealPlans).values(
          template.meals.map((meal) => {
            const targetDate = new Date(weekStart);
            targetDate.setDate(targetDate.getDate() + meal.dayOfWeek);
            return {
              date: targetDate.toISOString().split("T")[0]!,
              recipeId: meal.recipeId,
              servingScale: meal.servingScale,
            };
          }),
        );
      }

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(weekTemplates)
        .where(eq(weekTemplates.id, input.id));
      return { success: true };
    }),
});
