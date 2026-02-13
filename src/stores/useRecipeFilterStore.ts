import { create } from "zustand";

type SortOption =
  | "mostRecentlyUsed"
  | "leastRecentlyUsed"
  | "mostFrequentlyUsed"
  | "mostUnderused"
  | "alphabetical"
  | "newestCreated";

interface RecipeFilterState {
  search: string;
  sort: SortOption;
  selectedTags: string[];
  complexityMin: number;
  complexityMax: number;

  setSearch: (search: string) => void;
  setSort: (sort: SortOption) => void;
  setSelectedTags: (tags: string[]) => void;
  toggleTag: (tag: string) => void;
  setComplexityRange: (min: number, max: number) => void;
  resetFilters: () => void;
}

export const useRecipeFilterStore = create<RecipeFilterState>((set) => ({
  search: "",
  sort: "newestCreated",
  selectedTags: [],
  complexityMin: 1,
  complexityMax: 5,

  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),
  setSelectedTags: (tags) => set({ selectedTags: tags }),
  toggleTag: (tag) =>
    set((state) => ({
      selectedTags: state.selectedTags.includes(tag)
        ? state.selectedTags.filter((t) => t !== tag)
        : [...state.selectedTags, tag],
    })),
  setComplexityRange: (min, max) =>
    set({ complexityMin: min, complexityMax: max }),
  resetFilters: () =>
    set({
      search: "",
      sort: "newestCreated",
      selectedTags: [],
      complexityMin: 1,
      complexityMax: 5,
    }),
}));
