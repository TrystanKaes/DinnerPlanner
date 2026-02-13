"use client";

import { useState } from "react";
import {
  Check,
  AlertTriangle,
  PlusCircle,
  RotateCcw,
  Download,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Separator } from "~/components/ui/separator";

import { api, type RouterOutputs } from "~/trpc/react";
import { useWeekViewStore } from "~/stores/useWeekViewStore";
import { formatWeekRange } from "~/lib/dates";

type ShoppingListItem =
  RouterOutputs["shoppingList"]["getByWeek"] extends infer T
    ? T extends { items: infer I }
      ? I extends (infer Item)[]
        ? Item
        : never
      : never
    : never;

export function ShoppingList() {
  const { weekStartDate } = useWeekViewStore();
  const utils = api.useUtils();

  const { data: shoppingList, isLoading } =
    api.shoppingList.getByWeek.useQuery({ weekStartDate });

  const [showAlreadyHave, setShowAlreadyHave] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const updateItemMutation = api.shoppingList.updateItem.useMutation({
    onSuccess: () => {
      void utils.shoppingList.getByWeek.invalidate({ weekStartDate });
    },
    onError: (e) => toast.error(e.message),
  });

  const addItemMutation = api.shoppingList.addItem.useMutation({
    onSuccess: () => {
      toast.success("Item added");
      void utils.shoppingList.getByWeek.invalidate({ weekStartDate });
      setAddItemOpen(false);
      setNewItemName("");
      setNewItemAmount("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteItemMutation = api.shoppingList.deleteItem.useMutation({
    onSuccess: () => {
      void utils.shoppingList.getByWeek.invalidate({ weekStartDate });
    },
    onError: (e) => toast.error(e.message),
  });

  const clearChecksMutation = api.shoppingList.clearChecks.useMutation({
    onSuccess: () => {
      toast.success("Checkmarks cleared");
      void utils.shoppingList.getByWeek.invalidate({ weekStartDate });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading shopping list...
      </div>
    );
  }

  if (!shoppingList) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No shopping list for this week yet.</p>
        <p className="text-sm mt-1">
          Use &quot;Generate Shopping List&quot; to create one from your planned meals.
        </p>
      </div>
    );
  }

  const items = shoppingList.items ?? [];
  const visibleItems = showAlreadyHave
    ? items
    : items.filter((item) => !item.alreadyHave);

  // Group items by store group
  const grouped = new Map<string, typeof items>();
  visibleItems.forEach((item) => {
    const group = item.storeGroup ?? "Ungrouped";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(item);
  });

  const handleToggleCheck = (item: ShoppingListItem) => {
    updateItemMutation.mutate({
      id: item.id,
      checked: !item.checked,
    });
  };

  const handleToggleAlreadyHave = (item: ShoppingListItem) => {
    updateItemMutation.mutate({
      id: item.id,
      alreadyHave: !item.alreadyHave,
    });
  };

  const handleSaveEdit = () => {
    if (editItemId) {
      updateItemMutation.mutate({
        id: editItemId,
        ingredientName: editName,
        estimatedAmount: editAmount,
      });
      setEditItemId(null);
    }
  };

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Shopping List
          </h3>
          <p className="text-sm text-muted-foreground">
            {formatWeekRange(weekStartDate)} &middot; {checkedCount}/{items.length} items checked
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={showAlreadyHave}
            onCheckedChange={setShowAlreadyHave}
            id="show-already-have"
          />
          <Label htmlFor="show-already-have" className="text-sm">
            Show &quot;already have&quot;
          </Label>
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddItemOpen(true)}
        >
          <PlusCircle className="h-4 w-4 mr-1" />
          Add Item
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            clearChecksMutation.mutate({
              shoppingListId: shoppingList.id,
            })
          }
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Clear Checks
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info("Export feature coming soon")}
        >
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      <Separator />

      {/* Item List */}
      {Array.from(grouped.entries()).map(([group, groupItems]) => (
        <div key={group} className="space-y-1">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {group}
          </h4>
          {groupItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                item.checked
                  ? "bg-muted/50 opacity-60"
                  : item.alreadyHave
                    ? "bg-secondary/10"
                    : "hover:bg-muted/30"
              }`}
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={() => handleToggleCheck(item)}
              />
              <div className="flex-1 min-w-0">
                {editItemId === item.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-7 text-sm"
                    />
                    <Input
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="h-7 text-sm w-32"
                    />
                    <Button
                      size="sm"
                      className="h-7"
                      onClick={handleSaveEdit}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          item.checked ? "line-through" : ""
                        }`}
                      >
                        {item.ingredientName}
                      </span>
                      {parseFloat(item.certainty) < 0.8 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 text-orange-600 border-orange-300"
                        >
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          AI estimate
                        </Badge>
                      )}
                      {item.alreadyHave && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0"
                        >
                          Have it
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.estimatedAmount}
                    </span>
                    {item.sourceRecipes && item.sourceRecipes.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({item.sourceRecipes.join(", ")})
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => handleToggleAlreadyHave(item)}
                  title={
                    item.alreadyHave
                      ? "Mark as needed"
                      : "Mark as already have"
                  }
                >
                  {item.alreadyHave ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditItemId(item.id);
                    setEditName(item.ingredientName);
                    setEditAmount(item.estimatedAmount);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteItemMutation.mutate({ id: item.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {visibleItems.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No items to display.
        </p>
      )}

      {/* Add Custom Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="e.g., Paper towels"
              />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                value={newItemAmount}
                onChange={(e) => setNewItemAmount(e.target.value)}
                placeholder="e.g., 2 rolls"
              />
            </div>
            <Button
              className="w-full"
              disabled={
                !newItemName || !newItemAmount || addItemMutation.isPending
              }
              onClick={() =>
                addItemMutation.mutate({
                  shoppingListId: shoppingList.id,
                  ingredientName: newItemName,
                  estimatedAmount: newItemAmount,
                })
              }
            >
              {addItemMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Add Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
