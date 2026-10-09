import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "react-router-dom";
import { FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { guestSchema, type GuestFormInput, type GuestFormValues } from "@/schemas/guest.schema";
import { useCreateGuestMutation, useGuestCategories, useUpdateGuestMutation } from "@/queries/useGuestQueries";
import { getApiErrorMessage } from "@/lib/apiError";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import type { CreateGuestPayload, Guest } from "@/types/guest.types";

interface GuestFormProps {
  eventId: number;
  open: boolean;
  existingGuest?: Guest;
  defaultCategoryId?: number;
  onClose: () => void;
}

/**
 * Single responsive guest form: a centered modal on lg: and above, a
 * bottom sheet below that. The form fields, validation and submit logic
 * are identical either way - only the surrounding shell (position, entry
 * animation, close affordance placement) differs by breakpoint, decided
 * once via useIsDesktop() rather than by rendering two separate trees.
 */
export default function GuestForm({
  eventId,
  open,
  existingGuest,
  defaultCategoryId,
  onClose,
}: GuestFormProps) {
  const isDesktop = useIsDesktop();
  const isEditMode = !!existingGuest;
  const createMutation = useCreateGuestMutation(eventId);
  const updateMutation = useUpdateGuestMutation(eventId);
  const activeMutation = isEditMode ? updateMutation : createMutation;
  const { data: categories } = useGuestCategories(eventId);

  const [limitError, setLimitError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [fieldErrorsMapped, setFieldErrorsMapped] = useState(false);

  // Escape closes the form.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<GuestFormInput, unknown, GuestFormValues>({
    resolver: zodResolver(guestSchema),
    defaultValues: {
      name: existingGuest?.name ?? "",
      mobile_number: existingGuest?.mobile_number ?? "",
      email: existingGuest?.email ?? "",
      family_member_count: existingGuest?.family_member_count ?? 3,
      notes: existingGuest?.notes ?? "",
    },
  });

  const [categoryId, setCategoryId] = useState<string>("");

  // Reset the fields only when the dialog OPENS or switches to a different
  // guest. The old effect also depended on the existingGuest object itself,
  // so a background refetch (new object, same guest) wiped what the person
  // was typing, and a reset racing the first render could leave the previous
  // guest's values in an "Add" dialog. The latest guest is read through a ref.
  const guestRef = useRef(existingGuest);
  guestRef.current = existingGuest;
  const guestId = existingGuest?.id ?? null;

  useEffect(() => {
    if (!open) return;

    const guest = guestRef.current;

    reset({
      name: guest?.name ?? "",
      mobile_number: guest?.mobile_number ?? "",
      email: guest?.email ?? "",
      family_member_count: guest?.family_member_count ?? 3,
      notes: guest?.notes ?? "",
    });
    setCategoryId(
      guest?.category != null
        ? String(guest.category)
        : defaultCategoryId != null
          ? String(defaultCategoryId)
          : ""
    );
    setLimitError(null);
    setDuplicateError(null);
    setFieldErrorsMapped(false);
  }, [open, guestId, defaultCategoryId, reset]);

  const familyCount = watch("family_member_count");

  const onSubmit = (values: GuestFormValues) => {
    setLimitError(null);
    setDuplicateError(null);
    setFieldErrorsMapped(false);

    const payload: CreateGuestPayload = {
      ...values,
      category: categoryId ? Number(categoryId) : null,
    };

    const onError = (error: unknown) => {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const message = getApiErrorMessage(error, "");

        if (status === 409 && message.toLowerCase().includes("already on the guest list")) {
          setDuplicateError(message);
          return;
        }

        if (status === 402 || status === 409) {
          setLimitError(message || "You've reached your plan's guest limit.");
          return;
        }

        // Show server validation messages under the matching fields.
        const serverErrors = error.response?.data?.errors;

        if (status === 400 && serverErrors && typeof serverErrors === "object") {
          const fields = ["name", "mobile_number", "email", "family_member_count", "notes"] as const;
          let mapped = false;

          for (const field of fields) {
            const messages = serverErrors[field];

            if (messages) {
              setError(field, {
                message: Array.isArray(messages) ? String(messages[0]) : String(messages),
              });
              mapped = true;
            }
          }

          setFieldErrorsMapped(mapped);
        }
      }
    };

    if (isEditMode) {
      updateMutation.mutate(
        { guestId: existingGuest.id, payload },
        { onSuccess: onClose, onError }
      );
    } else {
      createMutation.mutate(payload, { onSuccess: onClose, onError });
    }
  };

  const formFields = (idPrefix: string) => (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}name`}>Name</Label>
        <Input id={`${idPrefix}name`} hasError={!!errors.name} {...register("name")} />
        <FormError message={errors.name?.message} />
      </div>

      <div className={cn(isDesktop ? "grid grid-cols-2 gap-4" : "space-y-4")}>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}mobile_number`}>Mobile number</Label>
          <Input
            id={`${idPrefix}mobile_number`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="9876543210"
            hasError={!!errors.mobile_number}
            {...register("mobile_number")}
          />
          <p className="text-xs text-slate-400">+91 and spaces are fine - we tidy it up.</p>
          <FormError message={errors.mobile_number?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}email`}>Email</Label>
          <Input
            id={`${idPrefix}email`}
            type="email"
            placeholder="Optional"
            hasError={!!errors.email}
            {...register("email")}
          />
          <FormError message={errors.email?.message} />
        </div>
      </div>

      <div className={cn(isDesktop ? "grid grid-cols-2 gap-4" : "space-y-4")}>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}category`}>Category</Label>
          <Select
            id={`${idPrefix}category`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Uncategorized</option>
            {(categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}family_member_count`}>Family members</Label>
          <Input
            id={`${idPrefix}family_member_count`}
            type="number"
            min={0}
            max={50}
            hasError={!!errors.family_member_count}
            {...register("family_member_count")}
          />
          {typeof familyCount === "number" && familyCount >= 40 && !errors.family_member_count && (
            <p className="text-xs text-amber-600">That's a big party - just checking this is right.</p>
          )}
          <FormError message={errors.family_member_count?.message} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}notes`}>Notes</Label>
        <textarea
          id={`${idPrefix}notes`}
          rows={2}
          className={cn(
            "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-[var(--brand-navy)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40",
            errors.notes
              ? "border-rose-300 focus:ring-rose-300/40"
              : "border-slate-200 focus:border-[var(--brand-pink)]"
          )}
          placeholder="Dietary preferences, seating notes, etc."
          {...register("notes")}
        />
        <FormError message={errors.notes?.message} />
      </div>

      {limitError && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800">{limitError}</p>
            <Link to="/pricing" className="mt-2 inline-block text-sm font-semibold text-[var(--brand-pink)]">
              View plans
            </Link>
          </div>
        </div>
      )}

      {duplicateError && <FormError message={duplicateError} />}

      {!limitError && !duplicateError && !fieldErrorsMapped && activeMutation.isError && (
        <FormError
          message={getApiErrorMessage(activeMutation.error, "Couldn't save this guest. Please try again.")}
        />
      )}
    </>
  );

  return (
    <AnimatePresence>
      {open &&
        (isDesktop ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40"
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              role="dialog"
              aria-modal="true"
              aria-label={isEditMode ? "Edit guest" : "Add a guest"}
              className="premium-card relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-8"
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-xl font-bold text-[var(--brand-navy)]">
                {isEditMode ? "Edit guest" : "Add a guest"}
              </h2>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                {formFields("")}
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={activeMutation.isPending}>
                    {isEditMode ? "Save changes" : "Add guest"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        ) : (
          <div className="fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40"
              onClick={onClose}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label={isEditMode ? "Edit guest" : "Add a guest"}
              className="mobile-safe-bottom absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white"
            >
              <div className="mobile-safe-top sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-4">
                <h2 className="text-lg font-bold text-[var(--brand-navy)]">
                  {isEditMode ? "Edit guest" : "Add a guest"}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form className="space-y-4 px-4 py-5" onSubmit={handleSubmit(onSubmit)} noValidate>
                {formFields("m_")}
                <Button type="submit" className="w-full" size="lg" isLoading={activeMutation.isPending}>
                  {isEditMode ? "Save changes" : "Add guest"}
                </Button>
              </form>
            </motion.div>
          </div>
        ))}
    </AnimatePresence>
  );
}