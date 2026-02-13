import { create } from "zustand";

/**
 * Get the Sunday (start of week) for a given date.
 */
function getSunday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

interface WeekViewState {
  weekStartDate: string; // YYYY-MM-DD (always a Sunday)
  goToNextWeek: () => void;
  goToPreviousWeek: () => void;
  goToCurrentWeek: () => void;
  setWeekStartDate: (date: string) => void;
}

export const useWeekViewStore = create<WeekViewState>((set) => ({
  weekStartDate: formatDate(getSunday(new Date())),

  goToNextWeek: () =>
    set((state) => {
      const current = new Date(state.weekStartDate + "T00:00:00");
      current.setDate(current.getDate() + 7);
      return { weekStartDate: formatDate(current) };
    }),

  goToPreviousWeek: () =>
    set((state) => {
      const current = new Date(state.weekStartDate + "T00:00:00");
      current.setDate(current.getDate() - 7);
      return { weekStartDate: formatDate(current) };
    }),

  goToCurrentWeek: () =>
    set({ weekStartDate: formatDate(getSunday(new Date())) }),

  setWeekStartDate: (date: string) => set({ weekStartDate: date }),
}));
