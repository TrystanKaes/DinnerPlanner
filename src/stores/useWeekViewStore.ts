import { create } from "zustand";
import { getSunday, formatDateString } from "~/lib/dates";

interface WeekViewState {
  weekStartDate: string; // YYYY-MM-DD (always a Sunday)
  goToNextWeek: () => void;
  goToPreviousWeek: () => void;
  goToCurrentWeek: () => void;
  setWeekStartDate: (date: string) => void;
}

export const useWeekViewStore = create<WeekViewState>((set) => ({
  weekStartDate: formatDateString(getSunday(new Date())),

  goToNextWeek: () =>
    set((state) => {
      const current = new Date(state.weekStartDate + "T00:00:00");
      current.setDate(current.getDate() + 7);
      return { weekStartDate: formatDateString(current) };
    }),

  goToPreviousWeek: () =>
    set((state) => {
      const current = new Date(state.weekStartDate + "T00:00:00");
      current.setDate(current.getDate() - 7);
      return { weekStartDate: formatDateString(current) };
    }),

  goToCurrentWeek: () =>
    set({ weekStartDate: formatDateString(getSunday(new Date())) }),

  setWeekStartDate: (date: string) => set({ weekStartDate: date }),
}));
