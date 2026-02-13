"use client";

import { useState, useCallback } from "react";
import {
  PlusCircle,
  Trash2,
  GripVertical,
  Link as LinkIcon,
  Camera,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Slider } from "~/components/ui/slider";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";

const COMMON_UNITS = [
  "cups",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "grams",
  "kg",
  "whole",
  "pinch",
  "dash",
  "cloves",
  "cans",
  "ml",
  "liters",
  "slices",
  "pieces",
  "bunch",
  "stalks",
  "heads",
];

interface IngredientRow {
  id: string;
  amount: string;
  unit: string;
  ingredientName: string;
}

interface RecipeFormProps {
  initialData?: {
    id?: string;
    name: string;
    servings: number;
    complexity: number;
    tags: string[];
    sourceUrl: string | null;
    notes: string | null;
    ingredients: Array<{
      amount: string;
      unit: string;
      ingredientName: string;
    }>;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function RecipeForm({
  initialData,
  onSuccess,
  onCancel,
}: RecipeFormProps) {
  const isEditing = !!initialData?.id;

  const [name, setName] = useState(initialData?.name ?? "");
  const [servings, setServings] = useState(initialData?.servings ?? 4);
  const [complexity, setComplexity] = useState(initialData?.complexity ?? 3);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [sourceUrl, setSourceUrl] = useState(initialData?.sourceUrl ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initialData?.ingredients?.map((ing, i) => ({
      id: crypto.randomUUID(),
      amount: ing.amount,
      unit: ing.unit,
      ingredientName: ing.ingredientName,
    })) ?? [
      { id: crypto.randomUUID(), amount: "", unit: "whole", ingredientName: "" },
    ],
  );

  const utils = api.useUtils();
  const createMutation = api.recipe.create.useMutation({
    onSuccess: () => {
      toast.success("Recipe created!");
      void utils.recipe.list.invalidate();
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = api.recipe.update.useMutation({
    onSuccess: () => {
      toast.success("Recipe updated!");
      void utils.recipe.list.invalidate();
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { id: crypto.randomUUID(), amount: "", unit: "whole", ingredientName: "" },
    ]);
  };

  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  const updateIngredient = (
    id: string,
    field: keyof IngredientRow,
    value: string,
  ) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing)),
    );
  };

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Recipe name is required");
      return;
    }

    const formData = {
      name: name.trim(),
      servings,
      complexity,
      tags,
      photoUrls: [],
      sourceUrl: sourceUrl || null,
      notes: notes || null,
      ingredients: ingredients
        .filter((ing) => ing.ingredientName.trim())
        .map((ing, i) => ({
          amount: ing.amount || "1",
          unit: ing.unit || "whole",
          ingredientName: ing.ingredientName.trim(),
          sortOrder: i,
        })),
    };

    if (isEditing && initialData?.id) {
      updateMutation.mutate({ id: initialData.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Recipe Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Recipe Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Grandma's Lasagna"
          required
        />
      </div>

      {/* Servings & Complexity */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="servings">Base Servings</Label>
          <Input
            id="servings"
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(parseInt(e.target.value) || 4)}
          />
        </div>
        <div className="space-y-2">
          <Label>Complexity ({complexity}/5)</Label>
          <Slider
            value={[complexity]}
            onValueChange={(v) => { const arr = Array.isArray(v) ? v : [v]; setComplexity(arr[0] ?? 3); }}
            min={1}
            max={5}
            step={1}
            className="mt-3"
          />
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add a tag..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addTag}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => removeTag(tag)}
              >
                {tag} &times;
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Source URL */}
      <div className="space-y-2">
        <Label htmlFor="sourceUrl">Source URL</Label>
        <Input
          id="sourceUrl"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://allrecipes.com/..."
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (Markdown)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any extra notes, tips, or variations..."
          rows={3}
        />
      </div>

      {/* Ingredients */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Ingredients</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addIngredient}
          >
            <PlusCircle className="h-4 w-4 mr-1" />
            Add Row
          </Button>
        </div>

        <div className="space-y-2">
          {ingredients.map((ing) => (
            <div key={ing.id} className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
              <Input
                className="w-20"
                placeholder="Amt"
                value={ing.amount}
                onChange={(e) =>
                  updateIngredient(ing.id, "amount", e.target.value)
                }
              />
              <Select
                value={ing.unit}
                onValueChange={(v) => { if (v !== null) updateIngredient(ing.id, "unit", v); }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                placeholder="Ingredient name"
                value={ing.ingredientName}
                onChange={(e) =>
                  updateIngredient(ing.id, "ingredientName", e.target.value)
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeIngredient(ing.id)}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Recipe"}
        </Button>
      </div>
    </form>
  );
}

// ─── Import Dialogs ────────────────────────────────────────────────────────

export function ImportFromUrlDialog({
  onExtracted,
}: {
  onExtracted: (data: {
    name: string;
    servings: number;
    sourceUrl: string;
    ingredients: Array<{
      amount: string;
      unit: string;
      ingredientName: string;
    }>;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const importMutation = api.ai.importFromUrl.useMutation({
    onSuccess: (data) => {
      toast.success("Recipe extracted! Review and save.");
      onExtracted(data);
      setOpen(false);
      setUrl("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <LinkIcon className="h-4 w-4 mr-1" />
        Import from URL
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Recipe from URL</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="https://allrecipes.com/recipe/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            onClick={() => importMutation.mutate({ url })}
            disabled={!url || importMutation.isPending}
            className="w-full"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Extracting recipe...
              </>
            ) : (
              "Extract Recipe"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ImportFromImageDialog({
  onExtracted,
}: {
  onExtracted: (data: {
    name: string;
    servings: number;
    ingredients: Array<{
      amount: string;
      unit: string;
      ingredientName: string;
    }>;
  }) => void;
}) {
  const [open, setOpen] = useState(false);

  const importMutation = api.ai.importFromImage.useMutation({
    onSuccess: (data) => {
      toast.success("Recipe extracted from image! Review and save.");
      onExtracted(data);
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (base64) {
        importMutation.mutate({
          imageBase64: base64,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Camera className="h-4 w-4 mr-1" />
        Import from Photo
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Recipe from Photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a photo of a recipe card, cookbook page, or printed recipe.
          </p>
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            disabled={importMutation.isPending}
          />
          {importMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Extracting recipe from image...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
