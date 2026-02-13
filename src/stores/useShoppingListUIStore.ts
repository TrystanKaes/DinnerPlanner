import { create } from "zustand";

interface ShoppingListUIState {
  expandedGroups: Set<string>;
  showAlreadyHave: boolean;

  toggleGroup: (group: string) => void;
  setShowAlreadyHave: (show: boolean) => void;
}

export const useShoppingListUIStore = create<ShoppingListUIState>((set) => ({
  expandedGroups: new Set(["all"]),
  showAlreadyHave: false,

  toggleGroup: (group) =>
    set((state) => {
      const next = new Set(state.expandedGroups);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return { expandedGroups: next };
    }),
  setShowAlreadyHave: (show) => set({ showAlreadyHave: show }),
}));
