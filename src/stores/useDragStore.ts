import { create } from "zustand";

interface DragState {
  draggedRecipeId: string | null;
  setDraggedRecipeId: (id: string | null) => void;
}

export const useDragStore = create<DragState>((set) => ({
  draggedRecipeId: null,
  setDraggedRecipeId: (id) => set({ draggedRecipeId: id }),
}));
