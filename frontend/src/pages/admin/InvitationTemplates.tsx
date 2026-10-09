import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImageIcon, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import AdminDialog, { DialogActions } from "@/components/admin/AdminDialog";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import {
  useAdminInvitationTemplates,
  useCreateAdminInvitationTemplateMutation,
  useDeleteAdminInvitationTemplateMutation,
  useUpdateAdminInvitationTemplateMutation,
} from "@/queries/useAdminQueries";
import type { AdminInvitationTemplate } from "@/types/admin.types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Keep the name under 100 characters"),
  description: z.string().max(255, "Keep the description under 255 characters").optional(),
  display_order: z.string().regex(/^\d*$/, "Enter a whole number").optional(),
  is_active: z.boolean(),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

function ImagePicker({
  label,
  file,
  currentUrl,
  error,
  onPick,
}: {
  label: string;
  file: File | null;
  currentUrl: string | null | undefined;
  error?: string;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex h-24 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500 [@media(hover:hover)]:hover:border-[var(--brand-pink)] [@media(hover:hover)]:hover:text-[var(--brand-pink)]"
      >
        {file ? (
          <span className="truncate px-2">{file.name}</span>
        ) : currentUrl ? (
          <img src={resolveMediaUrl(currentUrl) ?? undefined} alt={`Current ${label.toLowerCase()}`} className="h-full w-full object-cover" />
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload image
          </>
        )}
      </button>
      <FormError message={error} />
    </div>
  );
}

function TemplateFormDialog({ template, onClose }: { template: AdminInvitationTemplate | null; onClose: () => void }) {
  const isEditing = !!template;
  const createMutation = useCreateAdminInvitationTemplateMutation();
  const updateMutation = useUpdateAdminInvitationTemplateMutation();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [fileErrors, setFileErrors] = useState<{ preview?: string; background?: string }>({});

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template?.name ?? "",
      description: template?.description ?? "",
      display_order: template ? String(template.display_order) : "0",
      is_active: template?.is_active ?? true,
    },
  });

  const pick = (kind: "preview" | "background", file: File | null) => {
    if (file && file.size > MAX_IMAGE_BYTES) {
      setFileErrors((prev) => ({ ...prev, [kind]: "Image must be 10 MB or smaller" }));
      return;
    }
    setFileErrors((prev) => ({ ...prev, [kind]: undefined }));
    if (kind === "preview") setPreviewFile(file);
    else setBackgroundFile(file);
  };

  const onSubmit = (values: TemplateFormValues) => {
    const payload = {
      name: values.name,
      description: values.description || "",
      display_order: values.display_order ? Number(values.display_order) : 0,
      is_active: values.is_active,
      ...(previewFile ? { preview_image: previewFile } : {}),
      ...(backgroundFile ? { background_image: backgroundFile } : {}),
    };

    const onSuccess = () => {
      toastStore.show(isEditing ? "Template updated." : "Template created.");
      onClose();
    };
    const onError = (error: unknown) => {
      for (const [field, message] of Object.entries(getApiFieldErrors(error))) {
        setError(field as keyof TemplateFormValues, { message });
      }
      toastStore.show(getApiErrorMessage(error, "Could not save template."), "error");
    };

    if (isEditing) {
      updateMutation.mutate({ templateId: template.id, payload }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload, { onSuccess, onError });
    }
  };

  return (
    <AdminDialog title={isEditing ? "Edit template" : "Add template"} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Template name</Label>
          <Input id="name" hasError={!!errors.name} {...register("name")} />
          <FormError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Input id="description" placeholder="e.g. Elegant floral wedding invite" hasError={!!errors.description} {...register("description")} />
          <FormError message={errors.description?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="display_order">Display order</Label>
          <Input id="display_order" type="number" inputMode="numeric" min={0} hasError={!!errors.display_order} {...register("display_order")} />
          <FormError message={errors.display_order?.message} />
        </div>

        <ImagePicker label="Preview image" file={previewFile} currentUrl={template?.preview_image} error={fileErrors.preview} onPick={(f) => pick("preview", f)} />
        <ImagePicker label="Background image" file={backgroundFile} currentUrl={template?.background_image} error={fileErrors.background} onPick={(f) => pick("background", f)} />

        <label className="flex items-center gap-2 text-sm text-[var(--brand-navy)]">
          <input type="checkbox" className="h-4 w-4 rounded" {...register("is_active")} />
          Active (available to organizers)
        </label>

        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEditing ? "Save changes" : "Create template"}
          </Button>
        </DialogActions>
      </form>
    </AdminDialog>
  );
}

export default function InvitationTemplates() {
  const { data: templates, isLoading, isError } = useAdminInvitationTemplates();
  const deleteMutation = useDeleteAdminInvitationTemplateMutation();

  const [formTemplate, setFormTemplate] = useState<AdminInvitationTemplate | "new" | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<AdminInvitationTemplate | null>(null);

  const handleDelete = () => {
    if (!deletingTemplate) return;
    deleteMutation.mutate(deletingTemplate.id, {
      onSuccess: () => {
        toastStore.show("Template deleted.");
        setDeletingTemplate(null);
      },
      onError: (error) => {
        toastStore.show(
          getApiErrorMessage(error, "Could not delete template. If it is used by events, set it to Inactive instead."),
          "error"
        );
        setDeletingTemplate(null);
      },
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Invitation Templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Platform templates every organizer can choose from. Organizers' own custom designs are not listed here.
          </p>
        </div>
        <Button onClick={() => setFormTemplate("new")}>
          <Plus className="h-4 w-4" />
          Add template
        </Button>
      </div>

      {isError ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          We couldn't load templates right now. Please refresh the page.
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-3xl" />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="overflow-hidden">
              <div className="flex h-36 items-center justify-center bg-slate-100">
                {template.preview_image ? (
                  <img src={resolveMediaUrl(template.preview_image) ?? undefined} alt={template.name} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-slate-300" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-[var(--brand-navy)]">{template.name}</h3>
                    {template.description && <p className="truncate text-xs text-slate-400">{template.description}</p>}
                  </div>
                  {template.is_active ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Inactive</span>
                  )}
                </div>
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setFormTemplate(template)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeletingTemplate(template)} aria-label="Delete template">
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-slate-500">No templates yet. Click "Add template" to create one.</Card>
      )}

      {formTemplate && <TemplateFormDialog template={formTemplate === "new" ? null : formTemplate} onClose={() => setFormTemplate(null)} />}

      <ConfirmDialog
        open={!!deletingTemplate}
        title="Delete this template?"
        description={`"${deletingTemplate?.name}" will no longer be available to organizers. Templates already used by events can't be deleted - set them to Inactive instead.`}
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeletingTemplate(null)}
      />
    </div>
  );
}
