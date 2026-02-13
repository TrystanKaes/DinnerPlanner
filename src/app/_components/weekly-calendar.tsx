"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  AlertTriangle,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Skeleton } from "~/components/ui/skeleton";

import { api, type RouterOutputs } from "~/trpc/react";
import { useWeekViewStore } from "~/stores/useWeekViewStore";
import {
  getWeekDates,
  formatDayShort,
  formatWeekRange,
  formatDateString,
  isToday,
} from "~/lib/dates";

type MealPlan = RouterOutputs["mealPlan"]["getWeek"][number];

// ─── Droppable Day Cell ─────────────────────────────────────────────────────

function DayCell({
  date,
  meal,
  onClickMeal,
}: {
  date: Date;
  meal: MealPlan | undefined;
  onClickMeal: (meal: MealPlan) => void;
}) {
  const dateStr = formatDateString(date);
  const { isOver, setNodeRef } = useDroppable({
    id: `day-${dateStr}`,
    data: { date: dateStr },
  });

  const today = isToday(dateStr);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col border rounded-lg p-2 min-h-[120px] transition-colors ${
        isOver
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : today
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-xs font-medium ${
            today ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {formatDayShort(date)}
        </span>
        {today && (
          <Badge
            variant="default"
            className="text-[10px] px-1.5 py-0 h-4"
          >
            Today
          </Badge>
        )}
      </div>

      {meal ? (
        <button
          className="flex-1 text-left space-y-1.5 group cursor-pointer"
          onClick={() => onClickMeal(meal)}
        >
          <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
            {meal.recipe.name}
          </p>
          {parseFloat(meal.servingScale) !== 1 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              &times;{meal.servingScale}
            </Badge>
          )}
          <div className="flex items-center gap-1 mt-1">
            {meal.ownerId ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<Avatar className="h-5 w-5" />}>
                    <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                      {meal.ownerId.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </TooltipTrigger>
                  <TooltipContent>Owner</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    No owner assigned for this meal
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {meal.supportIds && meal.supportIds.length > 0 && (
              <div className="flex -space-x-1">
                {meal.supportIds.slice(0, 3).map((id) => (
                  <Avatar key={id} className="h-4 w-4 border border-card">
                    <AvatarFallback className="text-[8px]">
                      {id.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {meal.supportIds.length > 3 && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    +{meal.supportIds.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground/50">
          <UtensilsCrossed className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

// ─── Weekly Calendar ────────────────────────────────────────────────────────

export function WeeklyCalendar({
  onClickMeal,
}: {
  onClickMeal: (meal: MealPlan) => void;
}) {
  const { weekStartDate, goToNextWeek, goToPreviousWeek, goToCurrentWeek } =
    useWeekViewStore();

  const { data: meals, isLoading } = api.mealPlan.getWeek.useQuery({
    weekStartDate,
  });

  const weekDates = getWeekDates(weekStartDate);

  const mealsByDate = new Map<string, MealPlan>();
  meals?.forEach((m) => mealsByDate.set(m.date, m));

  return (
    <div className="space-y-3">
      {/* Week Nav Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {formatWeekRange(weekStartDate)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={goToCurrentWeek}>
            <CalendarDays className="h-4 w-4 mr-1" />
            Today
          </Button>
        </div>
      </div>

      {/* Day Grid */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {weekDates.map((date) => {
            const dateStr = formatDateString(date);
            return (
              <DayCell
                key={dateStr}
                date={date}
                meal={mealsByDate.get(dateStr)}
                onClickMeal={onClickMeal}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
