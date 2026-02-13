"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  PlusCircle,
  GripVertical,
  Star,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Slider } from "~/components/ui/slider";

import { api, type RouterOutputs } from "~/trpc/react";
import { useRecipeFilterStore } from "~/stores/useRecipeFilterStore";
import {
  RecipeForm,
  ImportFromUrlDialog,
  ImportFromImageDialog,
} from "./recipe-form";

type Recipe = RouterOutputs["recipe"]["list"]["items"][number];

// ─── Draggable Recipe Card ─────────────────────────────────────────────────

function DraggableRecipeCard({
  recipe,
  onEdit,
  onDelete,
}: {
  recipe: Recipe;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `recipe-${recipe.id}`,
      data: { recipeId: recipe.id, recipeName: recipe.name },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="group relative cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onEdit()}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...listeners}
            {...attributes}
            className="mt-1 shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{recipe.name}</h3>
            <div className="flex items-center gap-1 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 ${
                    i < recipe.complexity
                      ? "fill-primary text-primary"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
              <span className="text-xs text-muted-foreground ml-1">
                {recipe.servings} servings
              </span>
            </div>
            {recipe.tags && recipe.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {recipe.tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
                {recipe.tags.length > 3 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    +{recipe.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Recipe Grid ────────────────────────────────────────────────────────────

export function RecipeGrid() {
  const {
    search,
    sort,
    selectedTags,
    complexityMin,
    complexityMax,
    setSearch,
    setSort,
    toggleTag,
    setComplexityRange,
  } = useRecipeFilterStore();

  // Debounce search input — only trigger API query after 300ms of no typing
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [showFilters, setShowFilters] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [deleteRecipeId, setDeleteRecipeId] = useState<string | null>(null);
  const [importData, setImportData] = useState<{
    name: string;
    servings: number;
    sourceUrl?: string;
    ingredients: Array<{
      amount: string;
      unit: string;
      ingredientName: string;
    }>;
  } | null>(null);

  const utils = api.useUtils();
  const { data, isLoading } = api.recipe.list.useQuery({
    search: debouncedSearch || undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    complexityMin: complexityMin > 1 ? complexityMin : undefined,
    complexityMax: complexityMax < 5 ? complexityMax : undefined,
    sort: sort as "newestCreated",
    limit: 50,
  });

  const { data: allTags } = api.recipe.allTags.useQuery();

  const deleteMutation = api.recipe.delete.useMutation({
    onSuccess: () => {
      toast.success("Recipe deleted");
      void utils.recipe.list.invalidate();
      setDeleteRecipeId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newestCreated">Newest</SelectItem>
            <SelectItem value="alphabetical">A–Z</SelectItem>
            <SelectItem value="mostRecentlyUsed">Recently Used</SelectItem>
            <SelectItem value="leastRecentlyUsed">Least Recent</SelectItem>
            <SelectItem value="mostFrequentlyUsed">Most Frequent</SelectItem>
            <SelectItem value="mostUnderused">Underused</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <ImportFromUrlDialog
          onExtracted={(data) => {
            setImportData(data);
            setCreateOpen(true);
          }}
        />
        <ImportFromImageDialog
          onExtracted={(data) => {
            setImportData(data);
            setCreateOpen(true);
          }}
        />
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-1" />
          Add Recipe
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border rounded-lg bg-card space-y-3">
          <div>
            <p className="text-sm font-medium mb-2">Complexity Range</p>
            <Slider
              value={[complexityMin, complexityMax]}
              onValueChange={(v) => {
                const arr = Array.isArray(v) ? v : [v];
                setComplexityRange(arr[0] ?? 1, arr[1] ?? 5);
              }}
              min={1}
              max={5}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{complexityMin}</span>
              <span>{complexityMax}</span>
            </div>
          </div>
          {allTags && allTags.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Tags</p>
              <div className="flex flex-wrap gap-1">
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={
                      selectedTags.includes(tag) ? "default" : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recipe Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">No recipes yet</p>
          <p className="text-sm mt-1">
            Add your first recipe, import from a link, or snap a photo of a
            recipe card.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {data?.items.map((recipe) => (
            <DraggableRecipeCard
              key={recipe.id}
              recipe={recipe}
              onEdit={() => setEditRecipe(recipe)}
              onDelete={() => setDeleteRecipeId(recipe.id)}
            />
          ))}
        </div>
      )}

      {/* Create Recipe Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setImportData(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {importData ? "Review Imported Recipe" : "New Recipe"}
            </DialogTitle>
          </DialogHeader>
          <RecipeForm
            initialData={
              importData
                ? {
                    name: importData.name,
                    servings: importData.servings,
                    complexity: 3,
                    tags: [],
                    sourceUrl: importData.sourceUrl ?? null,
                    notes: null,
                    ingredients: importData.ingredients,
                  }
                : undefined
            }
            onSuccess={() => {
              setCreateOpen(false);
              setImportData(null);
            }}
            onCancel={() => {
              setCreateOpen(false);
              setImportData(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Recipe Dialog */}
      <Dialog
        open={!!editRecipe}
        onOpenChange={(open) => !open && setEditRecipe(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Recipe</DialogTitle>
          </DialogHeader>
          {editRecipe && (
            <RecipeForm
              initialData={{
                id: editRecipe.id,
                name: editRecipe.name,
                servings: editRecipe.servings,
                complexity: editRecipe.complexity,
                tags: editRecipe.tags ?? [],
                sourceUrl: editRecipe.sourceUrl,
                notes: editRecipe.notes,
                ingredients: editRecipe.ingredients.map((ing) => ({
                  amount: ing.amount,
                  unit: ing.unit,
                  ingredientName: ing.ingredientName,
                })),
              }}
              onSuccess={() => setEditRecipe(null)}
              onCancel={() => setEditRecipe(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteRecipeId}
        onOpenChange={(open) => !open && setDeleteRecipeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the recipe. If it&apos;s assigned to upcoming
              meals, you&apos;ll need to remove it from meal plans first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteRecipeId) {
                  deleteMutation.mutate({ id: deleteRecipeId });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
