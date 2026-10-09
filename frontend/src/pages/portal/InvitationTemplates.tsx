import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Clock, ImageIcon, LayoutTemplate, Palette, Pencil, Plus, Search, Sparkles, Trash2, Type, X } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useActiveFilledTemplate,
  useActiveTemplatePreview,
  useDeleteCustomTemplateMutation,
  useDeselectActiveTemplateMutation,
  useEventStandardDefaults,
  useFillActiveTemplateMutation,
  useInvitationTemplates,
  useTemplateUsage,
} from "@/queries/useInvitationQueries";
import { useEvents } from "@/queries/useEventQueries";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { useInvitationFonts } from "@/lib/invitationFonts";
import { formatTimeRange } from "@/lib/eventDisplay";
import {
  FONT_STYLE_OPTIONS,
  STANDARD_FIELD_LABELS,
  STYLE_VALUE_KEYS,
  TEXT_COLOR_PRESETS,
} from "@/types/invitation.types";
import type {
  ActiveFilledTemplate,
  ActiveTemplatePreview,
  InvitationTemplate,
} from "@/types/invitation.types";
import UploadTemplateDialog from "@/components/membership/invitations/UploadTemplateDialog";

type FillStep = "pick-event" | "fill-fields";

const prettifyKey = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Escape closes the dialog and the page behind it stops scrolling. */
function useDialogBehaviour(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);
}

export default function InvitationTemplates() {
  const { data: templates, isLoading, isError } = useInvitationTemplates();
  const { data: activeTemplate, isLoading: activeLoading } = useActiveFilledTemplate();
  const { data: usage } = useTemplateUsage();
  const deselectMutation = useDeselectActiveTemplateMutation();
  const deleteMutation = useDeleteCustomTemplateMutation();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [fillingTemplate, setFillingTemplate] = useState<InvitationTemplate | null>(null);
  const [removingTemplate, setRemovingTemplate] = useState<InvitationTemplate | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const limitReached =
    !!usage && usage.template_limit !== null && usage.template_count >= usage.template_limit;

  const handleRemove = () => {
    if (!removingTemplate) return;
    setRemoveError(null);

    deleteMutation.mutate(removingTemplate.id, {
      onSuccess: () => setRemovingTemplate(null),
      onError: (error) => setRemoveError(getApiErrorMessage(error, "Couldn't remove this template.")),
    });
  };

  const activeTemplateDefinition =
    templates?.find((template) => template.id === activeTemplate?.template) ?? null;

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-pink)]">
              Invitations
            </p>
            <h1 className="mt-2 text-xl font-bold text-[var(--brand-navy)] sm:text-2xl lg:text-3xl">
              Templates
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Select a template and fill it in once for an event. Then go to the Guests page,
              choose how to send (WhatsApp, Email, SMS or Voice Call) and send.
            </p>
            {usage && (
              <p className={cn("mt-2 text-xs", limitReached ? "text-amber-700" : "text-slate-400")}>
                {usage.template_limit === null
                  ? `${usage.template_count} template${usage.template_count === 1 ? "" : "s"} in your library`
                  : `${usage.template_count} of ${usage.template_limit} template slots used`}
                {limitReached && " · remove one of your uploads or upgrade to add more"}
              </p>
            )}
          </div>
          <Button className="w-full sm:w-auto" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            Upload template
          </Button>
        </div>

        {/* The selected template, shown separately with the organizer's
            text drawn on it exactly as guests will receive it. */}
        {!activeLoading && activeTemplate && (
          <ActiveTemplatePanel
            template={activeTemplateDefinition}
            onEdit={() => activeTemplateDefinition && setFillingTemplate(activeTemplateDefinition)}
            onDeselect={() => deselectMutation.mutate()}
            isDeselecting={deselectMutation.isPending}
          />
        )}

        {isError && (
          <p className="mt-10 text-center text-sm text-rose-600">
            Couldn't load templates right now. Please refresh the page.
          </p>
        )}

        {isLoading && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="overflow-hidden">
                <Skeleton className="aspect-[3/4] w-full rounded-none" />
                <div className="p-5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-full" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !isError && templates && templates.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-8 flex flex-col items-center px-6 py-12 text-center sm:mt-10 sm:py-16"
          >
            <Card className="w-full max-w-md overflow-hidden p-0">
              <div
                className="flex items-center justify-center py-10"
                style={{ background: "var(--gradient-brand-soft)" }}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--brand-pink)] soft-shadow">
                  <LayoutTemplate className="h-7 w-7" />
                </span>
              </div>
              <div className="p-8 pt-6">
                <h2 className="text-lg font-bold text-[var(--brand-navy)]">
                  No invitation templates yet
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Upgrade to a plan with invitation templates, or upload your own to start
                  designing beautiful invites for your guests.
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <Link
                    to="/pricing"
                    className={buttonVariants({ variant: "outline", className: "flex-1" })}
                  >
                    <Sparkles className="h-4 w-4" />
                    View plans
                  </Link>
                  <Button className="flex-1" onClick={() => setUploadOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Upload template
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {!isLoading && !isError && templates && templates.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {templates.map((template) => {
              const previewUrl = resolveMediaUrl(template.preview_image);
              const isActive = activeTemplate?.template === template.id;

              return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35 }}
                >
                  <Card
                    className={cn(
                      "card-hover-lift overflow-hidden",
                      isActive && "ring-2 ring-[var(--brand-pink)]"
                    )}
                  >
                    <div className="relative flex aspect-[3/4] w-full items-center justify-center bg-slate-100">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={template.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-slate-300" />
                      )}
                      {template.is_custom && (
                        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-navy)] shadow-sm">
                          Your upload
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-[var(--brand-pink)] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                          <Check className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </div>
                    <div className="p-4 sm:p-5">
                      <p className="font-semibold text-[var(--brand-navy)]">{template.name}</p>
                      {template.description && (
                        <p className="mt-1.5 text-sm text-slate-500">{template.description}</p>
                      )}
                      {!template.in_library && (
                        <p className="mt-1 text-xs text-slate-400">New · uses a slot</p>
                      )}
                      <Button
                        variant={isActive ? "outline" : "primary"}
                        className="mt-3.5 w-full"
                        onClick={() => setFillingTemplate(template)}
                      >
                        {isActive ? "Edit filled details" : "Select & fill"}
                      </Button>
                      {template.is_custom && (
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveError(null);
                            setRemovingTemplate(template);
                          }}
                          className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove my upload
                        </button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <UploadTemplateDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />

      {removingTemplate && (
        <RemoveTemplateDialog
          template={removingTemplate}
          isActive={activeTemplate?.template === removingTemplate.id}
          isRemoving={deleteMutation.isPending}
          errorMessage={removeError}
          onConfirm={handleRemove}
          onClose={() => setRemovingTemplate(null)}
        />
      )}

      {fillingTemplate && (
        <FillTemplateDialog
          template={fillingTemplate}
          initial={
            activeTemplate && activeTemplate.template === fillingTemplate.id
              ? activeTemplate
              : undefined
          }
          onClose={() => setFillingTemplate(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Remove one of the organizer's own uploads
// ---------------------------------------------------------------------

function RemoveTemplateDialog({
  template,
  isActive,
  isRemoving,
  errorMessage,
  onConfirm,
  onClose,
}: {
  template: InvitationTemplate;
  isActive: boolean;
  isRemoving: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useDialogBehaviour(onClose);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-template-title"
        className="premium-card relative w-full max-w-md rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-b-[inherit] sm:p-6"
      >
        <h2 id="remove-template-title" className="text-lg font-bold text-[var(--brand-navy)]">
          Remove "{template.name}"?
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          This frees up a template slot.
          {isActive && " It is your active template, so it will be deselected too."} Invitations
          you already sent are not affected.
        </p>

        {errorMessage && <FormError message={errorMessage} />}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isRemoving}>
            Keep it
          </Button>
          <Button
            className="flex-1 !bg-rose-600 hover:!bg-rose-700"
            onClick={onConfirm}
            isLoading={isRemoving}
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// The filled invitation, as guests will see it
// ---------------------------------------------------------------------

function PreviewCard({
  preview,
  isLoading,
  fallbackUrl,
}: {
  preview: ActiveTemplatePreview | null | undefined;
  isLoading: boolean;
  fallbackUrl: string | null;
}) {
  if (isLoading) {
    return <Skeleton className="aspect-[3/4] w-full rounded-2xl" />;
  }

  if (preview?.image) {
    return (
      <img
        src={preview.image}
        alt="Your filled invitation"
        className="w-full rounded-2xl object-contain shadow-sm"
      />
    );
  }

  if (preview?.text) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p className="whitespace-pre-line text-sm text-slate-600">{preview.text}</p>
      </div>
    );
  }

  if (fallbackUrl) {
    return <img src={fallbackUrl} alt="Template" className="w-full rounded-2xl object-cover" />;
  }

  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-slate-100">
      <ImageIcon className="h-8 w-8 text-slate-300" />
    </div>
  );
}

// ---------------------------------------------------------------------
// Active template panel - the selected template, filled in
// ---------------------------------------------------------------------

function ActiveTemplatePanel({
  template,
  onEdit,
  onDeselect,
  isDeselecting,
}: {
  template: InvitationTemplate | null;
  onEdit: () => void;
  onDeselect: () => void;
  isDeselecting: boolean;
}) {
  const { data: active } = useActiveFilledTemplate();
  const { data: preview, isLoading: previewLoading } = useActiveTemplatePreview(active?.updated_at);

  if (!active) return null;

  const labelForCustom = (key: string) =>
    template?.custom_fields.find((field) => field.field_key === key)?.label ?? prettifyKey(key);

  const detailRows: Array<[string, string]> = [
    ...Object.entries(active.standard_values)
      .filter(([key]) => !STYLE_VALUE_KEYS.includes(key))
      .map(
        ([key, value]) => [STANDARD_FIELD_LABELS[key] ?? prettifyKey(key), value] as [string, string]
      ),
    ...Object.entries(active.custom_values).map(
      ([key, value]) => [labelForCustom(key), value] as [string, string]
    ),
  ].filter(([, value]) => !!value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-6"
    >
      <Card className="overflow-hidden border-2 border-[var(--brand-pink)]/30 bg-[var(--brand-pink)]/[0.03]">
        <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,280px)_1fr] sm:p-6">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Your invitation, as guests will see it
            </p>
            <PreviewCard
              preview={preview}
              isLoading={previewLoading}
              fallbackUrl={resolveMediaUrl(active.template_preview_image)}
            />
          </div>

          <div className="flex flex-col">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--brand-pink)]">
              <Check className="h-3.5 w-3.5" />
              Currently active
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--brand-navy)]">
              {active.template_name}
            </p>
            <p className="text-sm text-slate-500">
              Set up for <span className="font-medium">{active.event_name}</span>
            </p>

            {detailRows.length > 0 && (
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {detailRows.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="font-medium text-[var(--brand-navy)]">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <p className="mt-4 text-sm text-slate-500">
              Next: open the Guests page, choose WhatsApp, Email, SMS or Voice Call, and send.
            </p>

            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button variant="outline" onClick={onEdit} disabled={!template}>
                <Pencil className="h-4 w-4" />
                Edit details
              </Button>
              <Button variant="outline" onClick={onDeselect} isLoading={isDeselecting}>
                <X className="h-4 w-4" />
                Deselect
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// Fill dialog - select event, then fill standard + custom fields, then confirm
// ---------------------------------------------------------------------

function FillTemplateDialog({
  template,
  initial,
  onClose,
}: {
  template: InvitationTemplate;
  /** The organizer's existing fill of THIS template, when editing it. */
  initial?: ActiveFilledTemplate;
  onClose: () => void;
}) {
  useInvitationFonts();

  const [eventSearch, setEventSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(eventSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [eventSearch]);

  const { data: eventsPage, isLoading: eventsLoading } = useEvents({
    page: 1,
    search: debouncedSearch,
  });

  // Editing an existing fill skips straight to the form with its values.
  const [step, setStep] = useState<FillStep>(initial ? "fill-fields" : "pick-event");
  const [eventId, setEventId] = useState<number | null>(initial ? initial.event : null);
  const [standardValues, setStandardValues] = useState<Record<string, string>>(
    initial ? initial.standard_values : {}
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>(
    initial ? initial.custom_values : {}
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedActive, setConfirmedActive] = useState<ActiveFilledTemplate | null>(null);

  const { data: defaults, isLoading: defaultsLoading } = useEventStandardDefaults(eventId);
  const fillMutation = useFillActiveTemplateMutation();

  const events = eventsPage?.events ?? [];

  const setStandard = (key: string, value: string) =>
    setStandardValues((values) => ({ ...values, [key]: value }));

  const fontStyle = standardValues.font_style || "elegant";
  const textColor = standardValues.text_color ?? "";

  // "7:00 PM - 10:00 PM" built from the From / To inputs, falling back to
  // the plain event time text.
  const timeText = standardValues.time_from
    ? formatTimeRange(standardValues.time_from, standardValues.time_to || null)
    : standardValues.event_time ?? "";

  // Event defaults pre-fill a fresh form. They must NOT overwrite the
  // organizer's saved values while they are editing an existing fill.
  useEffect(() => {
    if (!defaults) return;
    if (initial && eventId === initial.event) return;
    setStandardValues(
      Object.fromEntries(
        Object.entries(defaults).filter(([, value]) => value !== undefined)
      ) as Record<string, string>
    );
  }, [defaults, eventId, initial]);

  useDialogBehaviour(onClose);

  const handlePickEvent = (id: number) => {
    setEventId(id);
    setStep("fill-fields");
  };

  const missingCustomField = template.custom_fields.some(
    (field) => !(customValues[field.field_key] ?? "").trim()
  );

  const canConfirm = !missingCustomField;

  const handleConfirm = () => {
    if (!eventId) return;
    setErrorMessage(null);

    fillMutation.mutate(
      {
        template_id: template.id,
        event_id: eventId,
        standard_values: standardValues,
        custom_values: customValues,
      },
      {
        onSuccess: (active) => {
          setConfirmedActive(active);
        },
        onError: (error) => {
          setErrorMessage(getApiErrorMessage(error, "Couldn't fill in this template."));
        },
      }
    );
  };

  const confirmed = confirmedActive !== null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Fill in ${template.name}`}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "premium-card relative max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-b-[inherit] sm:p-8",
          !confirmed && step === "fill-fields" ? "max-w-4xl" : "max-w-lg"
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--brand-navy)]">
              {confirmed ? "Template confirmed" : `Fill in "${template.name}"`}
            </h2>
            {!confirmed && (
              <p className="mt-1 text-sm text-slate-500">
                {step === "pick-event"
                  ? "Which event is this invitation for?"
                  : "Review and edit the details, then confirm."}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {confirmedActive && (
          <ConfirmedStep active={confirmedActive} onClose={onClose} />
        )}

        {!confirmed && step === "pick-event" && (
          <div className="mt-6">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Search your events"
                aria-label="Search your events"
                className="pl-9"
              />
            </div>

            {eventsLoading && <p className="text-sm text-slate-400">Loading your events...</p>}

            {!eventsLoading && events.length === 0 && debouncedSearch && (
              <p className="text-sm text-slate-500">No events match "{debouncedSearch}".</p>
            )}

            {!eventsLoading && events.length === 0 && !debouncedSearch && (
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  You don't have any events yet. Create one first.
                </p>
                <Link
                  to="/portal/events/new"
                  className="mt-2 inline-block text-sm font-semibold text-[var(--brand-pink)]"
                >
                  Create an event
                </Link>
              </div>
            )}

            {!eventsLoading && events.length > 0 && (
              <div className="space-y-2">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => handlePickEvent(event.id)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3.5 text-left hover:border-[var(--brand-pink)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--brand-navy)]">{event.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {event.venue_name || "No venue set"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{event.event_date}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!confirmed && step === "fill-fields" && (
          <div className="mt-6">
            {defaultsLoading && !initial && (
              <p className="text-sm text-slate-400">Loading event details...</p>
            )}

            {(!defaultsLoading || !!initial) && (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* ---------------- form column ---------------- */}
                <div className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-[var(--brand-navy)]">
                      Event details (auto-filled, editable)
                    </p>
                    {Object.keys(STANDARD_FIELD_LABELS)
                      .filter((key) => key !== "event_time")
                      .map((key) => (
                        <div key={key} className="space-y-1.5">
                          <Label htmlFor={`standard-${key}`}>{STANDARD_FIELD_LABELS[key]}</Label>
                          <Input
                            id={`standard-${key}`}
                            value={standardValues[key] ?? ""}
                            onChange={(e) => setStandard(key, e.target.value)}
                          />
                        </div>
                      ))}
                  </div>

                  {/* Time: From - To */}
                  <div className="space-y-3 rounded-2xl border border-slate-100 p-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-[var(--brand-navy)]">
                      <Clock className="h-4 w-4 text-[var(--brand-pink)]" />
                      Event time
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="standard-time_from">From</Label>
                        <Input
                          id="standard-time_from"
                          type="time"
                          value={standardValues.time_from ?? ""}
                          onChange={(e) => setStandard("time_from", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="standard-time_to">To</Label>
                        <Input
                          id="standard-time_to"
                          type="time"
                          value={standardValues.time_to ?? ""}
                          onChange={(e) => setStandard("time_to", e.target.value)}
                        />
                      </div>
                    </div>
                    {timeText && (
                      <p className="text-xs text-slate-500">
                        Guests will see: <span className="font-semibold">{timeText}</span>
                      </p>
                    )}
                  </div>

                  {/* Font style */}
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-[var(--brand-navy)]">
                      <Type className="h-4 w-4 text-[var(--brand-pink)]" />
                      Font style
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {FONT_STYLE_OPTIONS.map((option) => {
                        const isSelected = fontStyle === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setStandard("font_style", option.value)}
                            aria-pressed={isSelected}
                            className={cn(
                              "rounded-2xl border px-3 py-3 text-center transition-colors",
                              isSelected
                                ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/5"
                                : "border-slate-200 hover:border-slate-300"
                            )}
                          >
                            <span
                              className="block text-2xl leading-none text-[var(--brand-navy)]"
                              style={{ fontFamily: option.family }}
                            >
                              Aa Wedding
                            </span>
                            <span className="mt-1.5 block text-xs text-slate-500">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Font colour */}
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-[var(--brand-navy)]">
                      <Palette className="h-4 w-4 text-[var(--brand-pink)]" />
                      Font colour
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setStandard("text_color", "")}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          !textColor
                            ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/5 text-[var(--brand-pink)]"
                            : "border-slate-200 text-slate-500 hover:border-slate-300"
                        )}
                      >
                        Auto
                      </button>

                      {TEXT_COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          title={preset.label}
                          aria-label={preset.label}
                          onClick={() => setStandard("text_color", preset.value)}
                          className={cn(
                            "h-9 w-9 rounded-full border-2 transition-transform [@media(hover:hover)]:hover:scale-110",
                            textColor.toLowerCase() === preset.value.toLowerCase()
                              ? "border-[var(--brand-pink)] ring-2 ring-[var(--brand-pink)]/30"
                              : "border-slate-200"
                          )}
                          style={{ backgroundColor: preset.value }}
                        />
                      ))}

                      <label
                        className="relative flex h-9 cursor-pointer items-center gap-2 rounded-full border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-500 hover:border-slate-400"
                        title="Pick any colour"
                      >
                        <span
                          className="h-4 w-4 rounded-full border border-slate-200"
                          style={{ backgroundColor: textColor || "#ffffff" }}
                        />
                        Custom
                        <input
                          type="color"
                          value={textColor || "#2b2b2b"}
                          onChange={(e) => setStandard("text_color", e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Pick a custom font colour"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-400">
                      Pick whatever reads best on this template's background. "Auto" chooses dark or
                      light for you.
                    </p>
                  </div>

                  {template.custom_fields.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-[var(--brand-navy)]">
                        This template's own fields
                      </p>
                      {template.custom_fields.map((field) => (
                        <div key={field.id} className="space-y-1.5">
                          <Label htmlFor={`custom-${field.field_key}`}>{field.label}</Label>
                          <Input
                            id={`custom-${field.field_key}`}
                            value={customValues[field.field_key] ?? ""}
                            onChange={(e) =>
                              setCustomValues((values) => ({
                                ...values,
                                [field.field_key]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {errorMessage && <FormError message={errorMessage} />}

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("pick-event")}>
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleConfirm}
                      disabled={!canConfirm}
                      isLoading={fillMutation.isPending}
                    >
                      Confirm
                    </Button>
                  </div>
                </div>

                {/* ---------------- live preview column ---------------- */}
                <div className="lg:sticky lg:top-0 lg:self-start">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Live preview
                  </p>
                  <LiveCardPreview
                    template={template}
                    standardValues={standardValues}
                    customValues={customValues}
                    timeText={timeText}
                    fontStyle={fontStyle}
                    textColor={textColor}
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    "Guest Name" is a sample. When you send, each guest's own name is written at the
                    top of their card automatically ("Hi Rahul,", "Hi Aisha,"...).
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ConfirmedStep({
  active,
  onClose,
}: {
  active: ActiveFilledTemplate;
  onClose: () => void;
}) {
  const { data: preview, isLoading } = useActiveTemplatePreview(active.updated_at);

  return (
    <div className="mt-6">
      <div className="rounded-2xl bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
          <Check className="h-4 w-4" />
          This is now your active template.
        </p>
        <p className="mt-1 text-sm text-emerald-700">
          Go to the Guests page, choose how to send, and send this invitation.
        </p>
      </div>

      <div className="mt-4 max-h-80 overflow-y-auto rounded-2xl">
        <PreviewCard
          preview={preview}
          isLoading={isLoading}
          fallbackUrl={resolveMediaUrl(active.template_preview_image)}
        />
      </div>

      <Button className="mt-5 w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Live card preview (browser approximation of the server-drawn card)
// ---------------------------------------------------------------------

function LiveCardPreview({
  template,
  standardValues,
  customValues,
  timeText,
  fontStyle,
  textColor,
}: {
  template: InvitationTemplate;
  standardValues: Record<string, string>;
  customValues: Record<string, string>;
  timeText: string;
  fontStyle: string;
  textColor: string;
}) {
  const family =
    FONT_STYLE_OPTIONS.find((option) => option.value === fontStyle)?.family ??
    FONT_STYLE_OPTIONS[0].family;
  const isScript = fontStyle === "script" || fontStyle === "playful";
  const titleFamily = family;
  const bodyFamily = isScript || fontStyle === "modern" ? "'Montserrat', sans-serif" : family;

  const color = textColor || "#2B2B2B";
  const background = resolveMediaUrl(template.preview_image);

  const detailBlocks: Array<[string, string]> = [
    ["Date", standardValues.event_date ?? ""],
    ["Time", timeText],
    ["Venue", standardValues.venue_name ?? ""],
    ...template.custom_fields.map(
      (field) => [field.label, customValues[field.field_key] ?? ""] as [string, string]
    ),
  ];

  return (
    <div
      className="relative mx-auto aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded-2xl bg-slate-100 shadow-md ring-1 ring-slate-200"
      style={{ containerType: "inline-size" }}
    >
      {background ? (
        <img src={background} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: "var(--gradient-brand-soft)" }} />
      )}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-[12%] text-center"
        style={{ color, textShadow: "0 1px 6px rgba(0,0,0,0.18)" }}
      >
        {template.body_text ? (
          <p
            className="whitespace-pre-line"
            style={{ fontFamily: bodyFamily, fontSize: "4.2cqw", lineHeight: 1.5 }}
          >
            {renderLivePreview(template.body_text, standardValues, customValues)}
          </p>
        ) : (
          <>
            <p
              style={{ fontFamily: bodyFamily, fontSize: "4.2cqw", fontWeight: 600 }}
            >
              Hi Guest Name,
            </p>
            <p
              className="mt-[2%] font-semibold uppercase"
              style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "2.4cqw", letterSpacing: "0.3em" }}
            >
              You are invited
            </p>
            <p
              className="mt-[3%] leading-tight"
              style={{
                fontFamily: titleFamily,
                fontSize: isScript ? "10.5cqw" : "8cqw",
                fontWeight: isScript ? 400 : 700,
              }}
            >
              {standardValues.event_name || "Your event name"}
            </p>
            <span
              className="my-[5%] block h-[2px] w-[18%]"
              style={{ backgroundColor: color }}
            />
            <div className="space-y-[3.5%]">
              {detailBlocks
                .filter(([, value]) => !!value)
                .map(([label, value]) => (
                  <div key={label}>
                    <p
                      className="font-semibold uppercase"
                      style={{
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: "2.2cqw",
                        letterSpacing: "0.25em",
                      }}
                    >
                      {label}
                    </p>
                    <p
                      style={{ fontFamily: bodyFamily, fontSize: "4.2cqw", fontWeight: 600 }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Client-side approximation of the server's render, for a live preview
// while typing - guest_name stays literal since there's no single guest
// yet (this is filled once, for all guests).
function renderLivePreview(
  bodyText: string,
  standardValues: Record<string, string>,
  customValues: Record<string, string>
): string {
  const context: Record<string, string> = {
    guest_name: "{guest_name}",
    ...standardValues,
    ...customValues,
  };

  return bodyText.replace(/\{(\w+)\}/g, (match, key) =>
    key in context ? context[key] : match
  );
}
