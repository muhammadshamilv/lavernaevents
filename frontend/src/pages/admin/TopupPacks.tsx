import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Power } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import AdminDialog, { DialogActions } from "@/components/admin/AdminDialog";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import {
  useAdminTopupPacks,
  useCreateAdminTopupPackMutation,
  useDeactivateAdminTopupPackMutation,
  useUpdateAdminTopupPackMutation,
} from "@/queries/useAdminQueries";
import type { AdminTopupPack } from "@/types/admin.types";

const packSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Keep the name under 100 characters"),
  kind: z.enum(["INVITATIONS", "VOICE_CALLS"]),
  quantity: z
    .string()
    .regex(/^\d+$/, "Enter a whole number")
    .refine((value) => Number(value) >= 1, "Must be at least 1"),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 499 or 499.50")
    .refine((value) => Number(value) > 0, "Must be more than 0"),
  is_active: z.boolean(),
  display_order: z.string().regex(/^\d*$/, "Enter a whole number").optional(),
});

type PackFormValues = z.infer<typeof packSchema>;

function PackFormDialog({ pack, onClose }: { pack: AdminTopupPack | null; onClose: () => void }) {
  const isEditing = !!pack;
  const createMutation = useCreateAdminTopupPackMutation();
  const updateMutation = useUpdateAdminTopupPackMutation();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<PackFormValues>({
    resolver: zodResolver(packSchema),
    defaultValues: {
      name: pack?.name ?? "",
      kind: pack?.kind ?? "INVITATIONS",
      quantity: pack ? String(pack.quantity) : "",
      price: pack?.price ?? "",
      is_active: pack?.is_active ?? true,
      display_order: pack ? String(pack.display_order) : "0",
    },
  });

  const onSubmit = (values: PackFormValues) => {
    const payload = {
      name: values.name,
      kind: values.kind,
      quantity: Number(values.quantity),
      price: values.price,
      is_active: values.is_active,
      display_order: values.display_order ? Number(values.display_order) : 0,
    };

    const onSuccess = () => {
      toastStore.show(isEditing ? "Pack updated." : "Pack created.");
      onClose();
    };
    const onError = (error: unknown) => {
      for (const [field, message] of Object.entries(getApiFieldErrors(error))) {
        setError(field as keyof PackFormValues, { message });
      }
      toastStore.show(getApiErrorMessage(error, "Could not save pack."), "error");
    };

    if (isEditing) {
      updateMutation.mutate({ packId: pack.id, payload }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload, { onSuccess, onError });
    }
  };

  return (
    <AdminDialog title={isEditing ? "Edit topup pack" : "Add topup pack"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Pack name</Label>
          <Input id="name" placeholder="e.g. 50 Invitations" hasError={!!errors.name} {...register("name")} />
          <FormError message={errors.name?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="kind">Kind</Label>
          <Select id="kind" {...register("kind")}>
            <option value="INVITATIONS">Invitations</option>
            <option value="VOICE_CALLS">Voice Calls</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" inputMode="numeric" min={1} hasError={!!errors.quantity} {...register("quantity")} />
            <FormError message={errors.quantity?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">Price (₹)</Label>
            <Input id="price" inputMode="decimal" hasError={!!errors.price} {...register("price")} />
            <FormError message={errors.price?.message} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="display_order">Display order</Label>
          <Input id="display_order" type="number" inputMode="numeric" min={0} hasError={!!errors.display_order} {...register("display_order")} />
          <FormError message={errors.display_order?.message} />
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--brand-navy)]">
          <input type="checkbox" className="h-4 w-4 rounded" {...register("is_active")} />
          Active (visible to organizers)
        </label>

        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEditing ? "Save changes" : "Create pack"}
          </Button>
        </DialogActions>
      </form>
    </AdminDialog>
  );
}

export default function TopupPacks() {
  const { data: packs, isLoading, isError } = useAdminTopupPacks();
  const deactivateMutation = useDeactivateAdminTopupPackMutation();

  const [formPack, setFormPack] = useState<AdminTopupPack | "new" | null>(null);
  const [deactivatingPack, setDeactivatingPack] = useState<AdminTopupPack | null>(null);

  const handleDeactivate = () => {
    if (!deactivatingPack) return;
    deactivateMutation.mutate(deactivatingPack.id, {
      onSuccess: () => {
        toastStore.show("Pack deactivated.");
        setDeactivatingPack(null);
      },
      onError: (error) => {
        toastStore.show(getApiErrorMessage(error, "Could not deactivate pack."), "error");
        setDeactivatingPack(null);
      },
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Topup Packs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fixed packs organizers can buy to raise their own invitation or voice-call quota.
          </p>
        </div>
        <Button onClick={() => setFormPack("new")}>
          <Plus className="h-4 w-4" />
          Add pack
        </Button>
      </div>

      {isError ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          We couldn't load topup packs right now. Please refresh the page.
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-3xl" />
          ))}
        </div>
      ) : packs && packs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => (
            <Card key={pack.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-[var(--brand-navy)]">{pack.name}</h3>
                  <p className="text-xs text-slate-400">{pack.kind === "INVITATIONS" ? "Invitations" : "Voice Calls"}</p>
                </div>
                {pack.is_active ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Inactive</span>
                )}
              </div>

              <p className="mt-3 text-2xl font-bold text-[var(--brand-navy)]">₹{pack.price}</p>
              <p className="text-sm text-slate-500">
                {pack.quantity.toLocaleString()} {pack.kind === "INVITATIONS" ? "invitations" : "voice calls"}
              </p>

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setFormPack(pack)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                {pack.is_active && (
                  <Button variant="outline" size="sm" onClick={() => setDeactivatingPack(pack)} aria-label="Deactivate pack">
                    <Power className="h-3.5 w-3.5 text-rose-600" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-slate-500">No topup packs yet. Click "Add pack" to create one.</Card>
      )}

      {formPack && <PackFormDialog pack={formPack === "new" ? null : formPack} onClose={() => setFormPack(null)} />}

      <ConfirmDialog
        open={!!deactivatingPack}
        title="Deactivate this pack?"
        description={`"${deactivatingPack?.name}" will no longer be shown to organizers. Existing purchases are unaffected.`}
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivateMutation.isPending}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivatingPack(null)}
      />
    </div>
  );
}