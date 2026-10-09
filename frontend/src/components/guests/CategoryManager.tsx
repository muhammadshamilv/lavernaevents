import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import {
  useCreateGuestCategoryMutation,
  useDeleteGuestCategoryMutation,
  useGuestCategories,
  useUpdateGuestCategoryMutation,
} from "@/queries/useGuestQueries";
import { cn } from "@/lib/utils";
import type { GuestCategory } from "@/types/guest.types";

interface CategoryManagerProps {
  eventId: number;
  activeCategory: number | "all" | "uncategorized";
  onSelectCategory: (value: number | "all" | "uncategorized") => void;
}

export default function CategoryManager({
  eventId,
  activeCategory,
  onSelectCategory,
}: CategoryManagerProps) {
  const { data: categories, isLoading } = useGuestCategories(eventId);
  const createMutation = useCreateGuestCategoryMutation(eventId);
  const updateMutation = useUpdateGuestCategoryMutation(eventId);
  const deleteMutation = useDeleteGuestCategoryMutation(eventId);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<GuestCategory | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;

    createMutation.mutate(
      { name },
      {
        onSuccess: () => {
          setNewName("");
          setAdding(false);
        },
        onError: (error) => {
          toastStore.show(getApiErrorMessage(error, "Could not create category."), "error");
        },
      }
    );
  };

  const startEdit = (category: GuestCategory) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const handleRename = (categoryId: number) => {
    const name = editingName.trim();
    if (!name) return;

    updateMutation.mutate(
      { categoryId, payload: { name } },
      {
        onSuccess: () => setEditingId(null),
        onError: (error) => {
          toastStore.show(getApiErrorMessage(error, "Could not rename category."), "error");
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deletingCategory) return;

    deleteMutation.mutate(deletingCategory.id, {
      onSuccess: () => {
        toastStore.show("Category deleted. Its guests are now uncategorized.");
        if (activeCategory === deletingCategory.id) {
          onSelectCategory("all");
        }
        setDeletingCategory(null);
      },
      onError: (error) => {
        toastStore.show(getApiErrorMessage(error, "Could not delete category."), "error");
        setDeletingCategory(null);
      },
    });
  };

  if (isLoading) {
    return <div className="h-9 w-full animate-pulse rounded-full bg-slate-100" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onSelectCategory("all")}
        className={cn(
          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
          activeCategory === "all"
            ? "bg-[var(--brand-navy)] text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        )}
      >
        All guests
      </button>

      {(categories ?? []).map((category) =>
        editingId === category.id ? (
          <div key={category.id} className="flex items-center gap-1">
            <Input
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(category.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              maxLength={80}
              className="h-9 w-32 rounded-full px-3 text-xs"
            />
            <button
              type="button"
              onClick={() => handleRename(category.id)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50"
              aria-label="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div
            key={category.id}
            className={cn(
              "group flex items-center gap-0.5 rounded-full py-1 pl-3.5 pr-1.5 text-xs font-semibold transition-colors",
              activeCategory === category.id
                ? "bg-[var(--brand-pink)] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            <button
              type="button"
              onClick={() => onSelectCategory(category.id)}
              aria-pressed={activeCategory === category.id}
              className="py-1"
            >
              {category.name} · {category.guest_count}
            </button>
            <button
              type="button"
              onClick={() => startEdit(category)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100",
                activeCategory === category.id ? "hover:bg-white/20" : "hover:bg-slate-300/50"
              )}
              aria-label="Rename category"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDeletingCategory(category)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100",
                activeCategory === category.id ? "hover:bg-white/20" : "hover:bg-slate-300/50"
              )}
              aria-label="Delete category"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      )}

      <button
        type="button"
        onClick={() => onSelectCategory("uncategorized")}
        className={cn(
          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
          activeCategory === "uncategorized"
            ? "bg-[var(--brand-navy)] text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        )}
      >
        Uncategorized
      </button>

      {adding ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setAdding(false);
            }}
            maxLength={80}
            className="h-9 w-36 rounded-full px-3 text-xs"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50"
            aria-label="Add"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          New category
        </Button>
      )}

      <ConfirmDialog
        open={!!deletingCategory}
        title="Delete this category?"
        description={`Guests in "${deletingCategory?.name}" will become uncategorized, not deleted.`}
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeletingCategory(null)}
      />
    </div>
  );
}
