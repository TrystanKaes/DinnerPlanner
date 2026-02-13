"use client";

import { useState, useCallback } from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { UserButton } from "@clerk/nextjs";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

import { WeeklyCalendar } from "./weekly-calendar";
import { RecipeGrid } from "./recipe-grid";
import { WeekActions } from "./week-actions";
import { MealDetailModal } from "./meal-detail-modal";
import { ShoppingList } from "./shopping-list";

import { api, type RouterOutputs } from "~/trpc/react";
import { useWeekViewStore } from "~/stores/useWeekViewStore";
import { useDragStore } from "~/stores/useDragStore";

type MealPlan = RouterOutputs["mealPlan"]["getWeek"][number];

export function HomePage() {
  const weekStartDate = useWeekViewStore((s) => s.weekStartDate);
  const { setDraggedRecipeId } = useDragStore();
  const utils = api.useUtils();

  const [selectedMeal, setSelectedMeal] = useState<MealPlan | null>(null);
  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [draggedName, setDraggedName] = useState<string | null>(null);

  const createMealMutation = api.mealPlan.create.useMutation({
    onSuccess: () => {
      toast.success("Recipe added to calendar");
      void utils.mealPlan.getWeek.invalidate({ weekStartDate });
    },
    onError: (e) => toast.error(e.message),
  });

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      if (active.data.current) {
        setDraggedRecipeId(active.data.current.recipeId as string);
        setDraggedName(active.data.current.recipeName as string);
      }
    },
    [setDraggedRecipeId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setDraggedRecipeId(null);
      setDraggedName(null);

      if (!over) return;

      const recipeId = active.data.current?.recipeId as string | undefined;
      const date = over.data.current?.date as string | undefined;

      if (recipeId && date) {
        createMealMutation.mutate({
          date,
          recipeId,
          servingScale: "1.0",
        });
      }
    },
    [createMealMutation, setDraggedRecipeId],
  );

  const handleClickMeal = useCallback((meal: MealPlan) => {
    setSelectedMeal(meal);
    setMealModalOpen(true);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight font-serif">
                Family Dinner Planner
              </h1>
              <Badge variant="outline" className="hidden sm:inline-flex">
                Beta
              </Badge>
            </div>
            <UserButton />
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-6 space-y-6">
          {/* Week Calendar Section */}
          <section className="space-y-3">
            <WeeklyCalendar onClickMeal={handleClickMeal} />
            <WeekActions />
          </section>

          <Separator />

          {/* Bottom Section — Recipes & Shopping List */}
          <Tabs defaultValue="recipes" className="w-full">
            <TabsList>
              <TabsTrigger value="recipes">Recipes</TabsTrigger>
              <TabsTrigger value="shopping">Shopping List</TabsTrigger>
            </TabsList>
            <TabsContent value="recipes" className="mt-4">
              <RecipeGrid />
            </TabsContent>
            <TabsContent value="shopping" className="mt-4">
              <ShoppingList />
            </TabsContent>
          </Tabs>
        </main>

        {/* Meal Detail Modal */}
        <MealDetailModal
          meal={selectedMeal}
          open={mealModalOpen}
          onClose={() => {
            setMealModalOpen(false);
            setSelectedMeal(null);
          }}
        />

        {/* Drag Overlay */}
        <DragOverlay>
          {draggedName && (
            <Card className="shadow-lg opacity-90 w-48">
              <CardContent className="p-2">
                <p className="text-sm font-semibold truncate">{draggedName}</p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
