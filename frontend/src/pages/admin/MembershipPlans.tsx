import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import AdminDialog, { DialogActions } from "@/components/admin/AdminDialog";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import {
  useAdminMembershipPlans,
  useCreateAdminMembershipPlanMutation,
  useDeleteAdminMembershipPlanMutation,
  useUpdateAdminMembershipPlanMutation,
} from "@/queries/useAdminQueries";
import type { AdminMembershipPlan } from "@/types/admin.types";

const requiredCount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d+$/, "Enter a whole number, 0 or more");

// Empty = unlimited. Only used for the three nullable quotas.
const optionalCount = z.string().trim().regex(/^\d*$/, "Enter a whole number, 0 or more").optional();

const planSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Keep the name under 100 characters"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  description: z.string().optional(),
  price: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 499 or 499.50"),
  duration_days: requiredCount("Duration").refine((v) => Number(v) >= 1, "Must be at least 1 day"),
  event_limit: requiredCount("Event limit"),
  guest_limit: requiredCount("Guest limit"),
  storage_limit_mb: requiredCount("Storage limit"),
  total_invitations: optionalCount,
  template_limit: optionalCount,
  voice_call_limit: optionalCount,
  gallery_enabled: z.boolean(),
  qr_code_enabled: z.boolean(),
  photographer_access_enabled: z.boolean(),
  is_active: z.boolean(),
});

type PlanFormValues = z.infer<typeof planSchema>;

const nullableNumber = (value: string | undefined) => (value && value.trim() !== "" ? Number(value) : null);

function PlanFormDialog({ plan, onClose }: { plan: AdminMembershipPlan | null; onClose: () => void }) {
  const isEditing = !!plan;
  const createMutation = useCreateAdminMembershipPlanMutation();
  const updateMutation = useUpdateAdminMembershipPlanMutation();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: plan?.name ?? "",
      slug: plan?.slug ?? "",
      description: plan?.description ?? "",
      price: plan?.price ?? "",
      duration_days: plan ? String(plan.duration_days) : "30",
      event_limit: plan ? String(plan.event_limit) : "",
      guest_limit: plan ? String(plan.guest_limit) : "",
      storage_limit_mb: plan ? String(plan.storage_limit_mb) : "",
      total_invitations: plan?.total_invitations != null ? String(plan.total_invitations) : "",
      template_limit: plan?.template_limit != null ? String(plan.template_limit) : "",
      voice_call_limit: plan?.voice_call_limit != null ? String(plan.voice_call_limit) : "",
      gallery_enabled: plan?.gallery_enabled ?? true,
      qr_code_enabled: plan?.qr_code_enabled ?? true,
      photographer_access_enabled: plan?.photographer_access_enabled ?? false,
      is_active: plan?.is_active ?? true,
    },
  });

  const onSubmit = (values: PlanFormValues) => {
    const payload = {
      name: values.name,
      slug: values.slug,
      description: values.description || "",
      price: values.price,
      duration_days: Number(values.duration_days),
      event_limit: Number(values.event_limit),
      guest_limit: Number(values.guest_limit),
      storage_limit_mb: Number(values.storage_limit_mb),
      total_invitations: nullableNumber(values.total_invitations),
      template_limit: nullableNumber(values.template_limit),
      voice_call_limit: nullableNumber(values.voice_call_limit),
      gallery_enabled: values.gallery_enabled,
      qr_code_enabled: values.qr_code_enabled,
      photographer_access_enabled: values.photographer_access_enabled,
      is_active: values.is_active,
    };

    const onSuccess = () => {
      toastStore.show(isEditing ? "Plan updated." : "Plan created.");
      onClose();
    };
    const onError = (error: unknown) => {
      for (const [field, message] of Object.entries(getApiFieldErrors(error))) {
        setError(field as keyof PlanFormValues, { message });
      }
      toastStore.show(getApiErrorMessage(error, "Could not save plan."), "error");
    };

    if (isEditing) {
      updateMutation.mutate({ planId: plan.id, payload }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload, { onSuccess, onError });
    }
  };

  return (
    <AdminDialog title={isEditing ? "Edit plan" : "Add plan"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Plan name</Label>
          <Input id="name" hasError={!!errors.name} {...register("name")} />
          <FormError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input id="slug" hasError={!!errors.slug} {...register("slug")} />
          <FormError message={errors.slug?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Input id="description" {...register("description")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="price">Price (₹)</Label>
            <Input id="price" inputMode="decimal" hasError={!!errors.price} {...register("price")} />
            <FormError message={errors.price?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duration_days">Duration (days)</Label>
            <Input id="duration_days" type="number" inputMode="numeric" min={1} hasError={!!errors.duration_days} {...register("duration_days")} />
            <FormError message={errors.duration_days?.message} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="event_limit">Event limit</Label>
            <Input id="event_limit" type="number" inputMode="numeric" min={0} hasError={!!errors.event_limit} {...register("event_limit")} />
            <FormError message={errors.event_limit?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest_limit">Guest limit</Label>
            <Input id="guest_limit" type="number" inputMode="numeric" min={0} hasError={!!errors.guest_limit} {...register("guest_limit")} />
            <FormError message={errors.guest_limit?.message} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="storage_limit_mb">Storage limit (MB)</Label>
          <Input id="storage_limit_mb" type="number" inputMode="numeric" min={0} hasError={!!errors.storage_limit_mb} {...register("storage_limit_mb")} />
          <FormError message={errors.storage_limit_mb?.message} />
        </div>

        <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invitation quotas (leave empty for unlimited)</p>
          <div className="space-y-1.5">
            <Label htmlFor="total_invitations">Total invitations (shared across WhatsApp/Email/SMS)</Label>
            <Input id="total_invitations" type="number" inputMode="numeric" min={0} placeholder="Unlimited" hasError={!!errors.total_invitations} {...register("total_invitations")} />
            <FormError message={errors.total_invitations?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template_limit">Template library limit</Label>
            <Input id="template_limit" type="number" inputMode="numeric" min={0} placeholder="Unlimited" hasError={!!errors.template_limit} {...register("template_limit")} />
            <FormError message={errors.template_limit?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voice_call_limit">Voice call limit (0 disables voice calling)</Label>
            <Input id="voice_call_limit" type="number" inputMode="numeric" min={0} placeholder="Unlimited" hasError={!!errors.voice_call_limit} {...register("voice_call_limit")} />
            <FormError message={errors.voice_call_limit?.message} />
          </div>
        </div>

        <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm text-[var(--brand-navy)]">
            <input type="checkbox" className="h-4 w-4 rounded" {...register("gallery_enabled")} />
            Gallery enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--brand-navy)]">
            <input type="checkbox" className="h-4 w-4 rounded" {...register("qr_code_enabled")} />
            QR code and face search enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--brand-navy)]">
            <input type="checkbox" className="h-4 w-4 rounded" {...register("photographer_access_enabled")} />
            Photographer access enabled
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--brand-navy)]">
          <input type="checkbox" className="h-4 w-4 rounded" {...register("is_active")} />
          Active (visible on pricing page)
        </label>

        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEditing ? "Save changes" : "Create plan"}
          </Button>
        </DialogActions>
      </form>
    </AdminDialog>
  );
}

function Pill({ children }: { children: string }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{children}</span>;
}

export default function MembershipPlans() {
  const { data: plans, isLoading, isError } = useAdminMembershipPlans();
  const deleteMutation = useDeleteAdminMembershipPlanMutation();

  const [formPlan, setFormPlan] = useState<AdminMembershipPlan | "new" | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<AdminMembershipPlan | null>(null);

  const handleDelete = () => {
    if (!deletingPlan) return;
    deleteMutation.mutate(deletingPlan.id, {
      onSuccess: () => {
        toastStore.show("Plan deleted.");
        setDeletingPlan(null);
      },
      onError: (error) => {
        toastStore.show(getApiErrorMessage(error, "Could not delete plan. If it has subscribers, set it to Inactive instead."), "error");
        setDeletingPlan(null);
      },
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Membership Plans</h1>
          <p className="mt-1 text-sm text-slate-500">Create and manage subscription plans.</p>
        </div>
        <Button onClick={() => setFormPlan("new")}>
          <Plus className="h-4 w-4" />
          Add plan
        </Button>
      </div>

      {isError ? (
        <Card className="p-8 text-center text-sm text-slate-500">We couldn't load plans right now. Please refresh the page.</Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-3xl" />
          ))}
        </div>
      ) : plans && plans.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-[var(--brand-navy)]">{plan.name}</h3>
                  <p className="truncate text-xs text-slate-400">{plan.slug}</p>
                </div>
                {plan.is_active ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Inactive</span>
                )}
              </div>

              <p className="mt-3 text-2xl font-bold text-[var(--brand-navy)]">
                ₹{plan.price}
                <span className="text-sm font-medium text-slate-400"> / {plan.duration_days} days</span>
              </p>

              {plan.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{plan.description}</p>}

              <div className="mt-3 flex-1 space-y-1 text-sm text-slate-500">
                <p>Events: {plan.event_limit}</p>
                <p>Guests: {plan.guest_limit}</p>
                <p>Storage: {plan.storage_limit_mb} MB</p>
                <p>Invitations: {plan.total_invitations ?? "Unlimited"}</p>
                <p>Templates: {plan.template_limit ?? "Unlimited"}</p>
                <p>Voice calls: {plan.voice_call_limit ?? "Unlimited"}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {plan.gallery_enabled && <Pill>Gallery</Pill>}
                {plan.qr_code_enabled && <Pill>QR Code</Pill>}
                {plan.photographer_access_enabled && <Pill>Photographer Access</Pill>}
              </div>

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setFormPlan(plan)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeletingPlan(plan)} aria-label="Delete plan">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-slate-500">No plans yet. Click "Add plan" to create one.</Card>
      )}

      {formPlan && <PlanFormDialog plan={formPlan === "new" ? null : formPlan} onClose={() => setFormPlan(null)} />}

      <ConfirmDialog
        open={!!deletingPlan}
        title="Delete this plan?"
        description={`"${deletingPlan?.name}" will be removed. A plan that has ever had subscribers can't be deleted - set it to Inactive instead to hide it from the pricing page.`}
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeletingPlan(null)}
      />
    </div>
  );
}