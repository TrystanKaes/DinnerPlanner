import { recipeRouter } from "~/server/api/routers/recipe";
import { mealPlanRouter } from "~/server/api/routers/mealPlan";
import { weekTemplateRouter } from "~/server/api/routers/weekTemplate";
import { shoppingListRouter } from "~/server/api/routers/shoppingList";
import { aiRouter } from "~/server/api/routers/ai";
import { userRouter } from "~/server/api/routers/user";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  recipe: recipeRouter,
  mealPlan: mealPlanRouter,
  weekTemplate: weekTemplateRouter,
  shoppingList: shoppingListRouter,
  ai: aiRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
