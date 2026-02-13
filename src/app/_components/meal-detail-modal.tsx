"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Trash2, ExternalLink, Users, Crown } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
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
} from "~/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";

import { api, type RouterOutputs } from "~/trpc/react";
import { useWeekViewStore } from "~/stores/useWeekViewStore";
import { useUserNames } from "~/hooks/useUserNames";

type MealPlan = RouterOutputs["mealPlan"]["getWeek"][number];

const SCALE_OPTIONS = ["0.5", "1.0", "1.5", "2.0", "2.5", "3.0", "4.0"];

interface MealDetailModalProps {
  meal: MealPlan | null;
  open: boolean;
  onClose: () => void;
}

export function MealDetailModal({
  meal,
  open,
  onClose,
}: MealDetailModalProps) {
  const { user } = useUser();
  const utils = api.useUtils();
  const weekStartDate = useWeekViewStore((s) => s.weekStartDate);

  const [servingScale, setServingScale] = useState("1.0");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [supportIds, setSupportIds] = useState<string[]>([]);
  const [showDelete, setShowDelete] = useState(false);

  // Resolve all user IDs (owner + support) to display names
  const allUserIds = useMemo(() => {
    const ids: string[] = [];
    if (ownerId) ids.push(ownerId);
    ids.push(...supportIds);
    return ids;
  }, [ownerId, supportIds]);
  const userNames = useUserNames(allUserIds);
  const displayName = (id: string) => userNames[id] ?? id.slice(0, 12) + "...";

  useEffect(() => {
    if (meal) {
      setServingScale(meal.servingScale);
      setOwnerId(meal.ownerId);
      setSupportIds(meal.supportIds ?? []);
    }
  }, [meal]);

  const updateMutation = api.mealPlan.update.useMutation({
    onSuccess: () => {
      toast.success("Meal updated");
      void utils.mealPlan.getWeek.invalidate({ weekStartDate });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = api.mealPlan.delete.useMutation({
    onSuccess: () => {
      toast.success("Meal removed from calendar");
      void utils.mealPlan.getWeek.invalidate({ weekStartDate });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!meal) return null;

  const handleSave = () => {
    updateMutation.mutate({
      id: meal.id,
      servingScale,
      ownerId: ownerId,
      supportIds,
    });
  };

  const handleAssignSelf = (role: "owner" | "support") => {
    if (!user?.id) return;
    if (role === "owner") {
      setOwnerId(user.id);
    } else {
      if (!supportIds.includes(user.id)) {
        setSupportIds([...supportIds, user.id]);
      }
    }
  };

  const handleRemoveSupport = (id: string) => {
    setSupportIds(supportIds.filter((s) => s !== id));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {meal.recipe.name}
              {meal.recipe.sourceUrl && (
                <a
                  href={meal.recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Date */}
            <p className="text-sm text-muted-foreground">
              {new Date(meal.date + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>

            {/* Serving Scale */}
            <div className="space-y-2">
              <Label>Serving Scale</Label>
              <Select value={servingScale} onValueChange={(v) => { if (v !== null) setServingScale(v); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCALE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      &times;{s} ({Math.round(meal.recipe.servings * parseFloat(s))} servings)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Owner Assignment */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Crown className="h-4 w-4 text-primary" />
                  Owner
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleAssignSelf("owner")}
                >
                  Assign me
                </Button>
              </div>
              {ownerId ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                      {displayName(ownerId).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{displayName(ownerId)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs ml-auto"
                    onClick={() => setOwnerId(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-orange-500 italic">
                  No owner assigned
                </p>
              )}
            </div>

            {/* Support Team */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Support Team
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleAssignSelf("support")}
                >
                  Add me
                </Button>
              </div>
              {supportIds.length > 0 ? (
                <div className="space-y-1">
                  {supportIds.map((id) => (
                    <div key={id} className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px]">
                          {displayName(id).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{displayName(id)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs ml-auto"
                        onClick={() => handleRemoveSupport(id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No support team
                </p>
              )}
            </div>

            <Separator />

            {/* Ingredients Preview */}
            {meal.recipe.ingredients && meal.recipe.ingredients.length > 0 && (
              <div className="space-y-2">
                <Label>
                  Ingredients (x{servingScale})
                </Label>
                <ul className="text-sm space-y-0.5 text-muted-foreground">
                  {meal.recipe.ingredients.map((ing) => (
                    <li key={ing.id}>
                      {(
                        parseFloat(ing.amount) * parseFloat(servingScale)
                      ).toFixed(1)}{" "}
                      {ing.unit} {ing.ingredientName}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Meal?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {meal.recipe.name} from{" "}
              {new Date(meal.date + "T00:00:00").toLocaleDateString()}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: meal.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
