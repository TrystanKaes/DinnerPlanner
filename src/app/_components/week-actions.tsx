"use client";

import { useState } from "react";
import {
  Trash2,
  Copy,
  Save,
  BookOpen,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { api } from "~/trpc/react";
import { useWeekViewStore } from "~/stores/useWeekViewStore";
import { formatWeekRange } from "~/lib/dates";

export function WeekActions() {
  const { weekStartDate } = useWeekViewStore();
  const utils = api.useUtils();

  // ─── Clear Week ─────────────────────────────────────────────────────────

  const clearWeekMutation = api.mealPlan.clearWeek.useMutation({
    onSuccess: () => {
      toast.success("Week cleared");
      void utils.mealPlan.getWeek.invalidate({ weekStartDate });
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Copy Week ──────────────────────────────────────────────────────────

  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceDate, setCopySourceDate] = useState("");

  const copyWeekMutation = api.mealPlan.copyWeek.useMutation({
    onSuccess: () => {
      toast.success("Week copied successfully");
      void utils.mealPlan.getWeek.invalidate({ weekStartDate });
      setCopyOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Save Template ─────────────────────────────────────────────────────

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const createTemplateMutation = api.weekTemplate.create.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      void utils.weekTemplate.list.invalidate();
      setSaveTemplateOpen(false);
      setTemplateName("");
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Load Template ─────────────────────────────────────────────────────

  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const { data: templates } = api.weekTemplate.list.useQuery();

  const loadTemplateMutation = api.weekTemplate.load.useMutation({
    onSuccess: () => {
      toast.success("Template loaded");
      void utils.mealPlan.getWeek.invalidate({ weekStartDate });
      setLoadTemplateOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Shopping List ──────────────────────────────────────────────────────

  const generateShoppingListMutation =
    api.shoppingList.generate.useMutation({
      onSuccess: () => {
        toast.success("Shopping list generated!");
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="flex flex-wrap gap-2">
      {/* Clear Week */}
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
          <Trash2 className="h-4 w-4 mr-1" />
          Clear Week
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Week?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all meals from {formatWeekRange(weekStartDate)}.
              Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearWeekMutation.mutate({ weekStartDate })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy Week */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Copy className="h-4 w-4 mr-1" />
          Copy Week
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Week</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copy meals from a source week to{" "}
              {formatWeekRange(weekStartDate)}.
            </p>
            <div className="space-y-2">
              <Label>Source week start date (Sunday)</Label>
              <Input
                type="date"
                value={copySourceDate}
                onChange={(e) => setCopySourceDate(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={!copySourceDate || copyWeekMutation.isPending}
              onClick={() =>
                copyWeekMutation.mutate({
                  sourceWeekStart: copySourceDate,
                  targetWeekStart: weekStartDate,
                })
              }
            >
              {copyWeekMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Copy Meals
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Template */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Save className="h-4 w-4 mr-1" />
          Save as Template
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Save the current week&apos;s recipes and serving scales as a
              reusable template (role assignments are NOT saved).
            </p>
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Our Favorite Week"
              />
            </div>
            <Button
              className="w-full"
              disabled={!templateName || createTemplateMutation.isPending}
              onClick={() =>
                createTemplateMutation.mutate({
                  name: templateName,
                  weekStartDate,
                })
              }
            >
              {createTemplateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Save Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Template */}
      <Dialog open={loadTemplateOpen} onOpenChange={setLoadTemplateOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <BookOpen className="h-4 w-4 mr-1" />
          Load Template
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Replace the current week&apos;s meals with a saved template.
            </p>
            {templates && templates.length > 0 ? (
              <>
                <Select
                  value={selectedTemplateId}
                  onValueChange={(v) => { if (v !== null) setSelectedTemplateId(v); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.meals.length} meals)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  disabled={
                    !selectedTemplateId || loadTemplateMutation.isPending
                  }
                  onClick={() =>
                    loadTemplateMutation.mutate({
                      templateId: selectedTemplateId,
                      targetWeekStart: weekStartDate,
                    })
                  }
                >
                  {loadTemplateMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Load Template
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No templates saved yet. Use &quot;Save as Template&quot; to
                create one.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Shopping List */}
      <Button
        size="sm"
        onClick={() =>
          generateShoppingListMutation.mutate({ weekStartDate })
        }
        disabled={generateShoppingListMutation.isPending}
      >
        {generateShoppingListMutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <ShoppingCart className="h-4 w-4 mr-1" />
        )}
        Generate Shopping List
      </Button>
    </div>
  );
}
