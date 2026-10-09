import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { AlertTriangle, ImagePlus, X } from "lucide-react";
import { Card, FormError } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  createEventSchema,
  editEventSchema,
  localToday,
  type EventFormValues,
} from "@/schemas/event.schema";
import { useCreateEventMutation, useUpdateEventMutation } from "@/queries/useEventQueries";
import {
  EVENT_COVER_MAX_MB,
  EVENT_COVER_TYPES,
  EVENT_STATUS_OPTIONS,
  EVENT_STATUS_TRANSITIONS,
  EVENT_TYPE_OPTIONS,
} from "@/types/event.types";
import type { CreateEventPayload, Event } from "@/types/event.types";
import { resolveMediaUrl } from "@/lib/media";
import { getApiErrorMessage } from "@/lib/apiError";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

interface EventFormProps {
  existingEvent?: Event;
}

const FORM_FIELDS: ReadonlyArray<keyof EventFormValues> = [
  "name",
  "event_type",
  "custom_event_type_label",
  "host_name",
  "description",
  "event_date",
  "event_time",
  "event_end_time",
  "venue_name",
  "address",
  "google_maps_link",
  "status",
];

/**
 * Single responsive event create/edit form. IMPORTANT: only ONE <form>
 * tree is ever mounted at a time, chosen by useIsDesktop() at the top of
 * render (not by CSS hidden/lg:hidden on two simultaneously-mounted
 * forms). Two mounted forms sharing one useForm() instance both calling
 * register("field") for the same field name breaks react-hook-form's
 * internal ref tracking. Do not reintroduce a dual-mount pattern here.
 */
export default function EventForm({ existingEvent }: EventFormProps) {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const isEditMode = !!existingEvent;
  const coverInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateEventMutation();
  const updateMutation = useUpdateEventMutation();
  const activeMutation = isEditMode ? updateMutation : createMutation;

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    resolveMediaUrl(existingEvent?.cover_image)
  );
  const [limitError, setLimitError] = useState<string | null>(null);
  const [fieldErrorsMapped, setFieldErrorsMapped] = useState(false);

  // Free blob: previews when replaced / on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(isEditMode ? editEventSchema : createEventSchema),
    defaultValues: existingEvent
      ? {
          name: existingEvent.name,
          event_type: existingEvent.event_type,
          custom_event_type_label: existingEvent.custom_event_type_label,
          host_name: existingEvent.host_name,
          description: existingEvent.description,
          event_date: existingEvent.event_date,
          event_time: existingEvent.event_time.slice(0, 5),
          event_end_time: existingEvent.event_end_time?.slice(0, 5) ?? "",
          venue_name: existingEvent.venue_name,
          address: existingEvent.address,
          google_maps_link: existingEvent.google_maps_link,
          status: existingEvent.status,
        }
      : {
          name: "",
          event_type: "WEDDING",
          custom_event_type_label: "",
          host_name: "",
          description: "",
          event_date: "",
          event_time: "",
          event_end_time: "",
          venue_name: "",
          address: "",
          google_maps_link: "",
          status: "DRAFT",
        },
  });

  const eventType = watch("event_type");

  // New events may only start as Draft or Published; existing ones follow the
  // same transitions the server enforces.
  const statusOptions = EVENT_STATUS_OPTIONS.filter((option) =>
    isEditMode
      ? option.value === existingEvent.status ||
        EVENT_STATUS_TRANSITIONS[existingEvent.status].includes(option.value)
      : option.value === "DRAFT" || option.value === "PUBLISHED"
  );

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later
    if (!file) return;

    if (!EVENT_COVER_TYPES.includes(file.type)) {
      setCoverError("Cover image must be a JPG, PNG or WebP file.");
      return;
    }

    if (file.size > EVENT_COVER_MAX_MB * 1024 * 1024) {
      setCoverError(`Cover image must be ${EVENT_COVER_MAX_MB} MB or smaller.`);
      return;
    }

    setCoverError(null);
    setCoverFile(file);
    setRemoveCover(false);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveCover = () => {
    setCoverError(null);
    setCoverFile(null);
    setRemoveCover(true);
    setPreviewUrl(null);
  };

  const onSubmit = (values: EventFormValues) => {
    setLimitError(null);
    setFieldErrorsMapped(false);

    const payload: CreateEventPayload = {
      ...values,
      // "" is not a valid time - send null so the server clears it.
      event_end_time: values.event_end_time ? values.event_end_time : null,
      // File = upload, null = remove, undefined = leave as is.
      cover_image: coverFile ?? (removeCover ? null : undefined),
    };

    const onError = (error: unknown) => {
      if (!isAxiosError(error)) return;

      const statusCode = error.response?.status ?? 0;

      if ([402, 409].includes(statusCode)) {
        setLimitError(getApiErrorMessage(error, "You've reached your plan's event limit."));
        return;
      }

      // Show server-side validation messages under the matching fields.
      const serverErrors = error.response?.data?.errors;

      if (statusCode === 400 && serverErrors && typeof serverErrors === "object") {
        let mapped = false;

        for (const [field, messages] of Object.entries(serverErrors)) {
          if (FORM_FIELDS.includes(field as keyof EventFormValues)) {
            const message = Array.isArray(messages) ? String(messages[0]) : String(messages);
            setError(field as keyof EventFormValues, { message });
            mapped = true;
          } else if (field === "cover_image") {
            const message = Array.isArray(messages) ? String(messages[0]) : String(messages);
            setCoverError(message);
            mapped = true;
          }
        }

        setFieldErrorsMapped(mapped);
      }
    };

    if (isEditMode) {
      updateMutation.mutate(
        { id: existingEvent.id, payload },
        { onSuccess: (event) => navigate(`/portal/events/${event.id}`), onError }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: (event) => navigate(`/portal/events/${event.id}`),
        onError,
      });
    }
  };

  const textareaClass = (hasError: boolean) =>
    cn(
      "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-[var(--brand-navy)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40",
      hasError
        ? "border-rose-300 focus:ring-rose-300/40"
        : "border-slate-200 focus:border-[var(--brand-pink)]"
    );

  const coverField = (previewSize: "sm" | "lg", twoCol: boolean) => (
    <div className={cn("space-y-1.5", twoCol && "col-span-2")}>
      <Label htmlFor="cover_image">Cover image</Label>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50",
            previewSize === "lg" ? "h-20 w-32" : "h-16 w-24"
          )}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Cover preview" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className={cn("text-slate-300", previewSize === "lg" ? "h-6 w-6" : "h-5 w-5")} />
          )}
        </div>
        <label
          htmlFor="cover_image"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
        >
          {previewUrl ? "Change image" : "Upload image"}
        </label>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemoveCover}
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <X className="h-4 w-4" />
            Remove
          </button>
        )}
        <input
          ref={coverInputRef}
          id="cover_image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleCoverChange}
        />
      </div>
      <p className="text-xs text-slate-400">JPG, PNG or WebP, up to {EVENT_COVER_MAX_MB} MB.</p>
      <FormError message={coverError ?? undefined} />
    </div>
  );

  const statusBlock = (
    <>
      {limitError && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800">{limitError}</p>
            <Link to="/pricing" className="mt-2 inline-block text-sm font-semibold text-[var(--brand-pink)]">
              View plans
            </Link>
          </div>
        </div>
      )}
      {!limitError && !fieldErrorsMapped && activeMutation.isError && (
        <FormError
          message={getApiErrorMessage(activeMutation.error, "Couldn't save this event. Please try again.")}
        />
      )}
      {fieldErrorsMapped && (
        <FormError message="Please fix the highlighted fields and try again." />
      )}
    </>
  );

  // Renders the field set once, parameterized by breakpoint - only ONE of
  // these calls happens per render (see the isDesktop branch below), so
  // register("field") is only ever called once per field name at a time.
  const fields = (twoCol: boolean) => (
    <>
      <div className={twoCol ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
        <Label htmlFor="name">Event name</Label>
        <Input
          id="name"
          placeholder="Anjali & Rohan's Wedding"
          hasError={!!errors.name}
          {...register("name")}
        />
        <FormError message={errors.name?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event_type">Event type</Label>
        <Select id="event_type" hasError={!!errors.event_type} {...register("event_type")}>
          {EVENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <FormError message={errors.event_type?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select id="status" hasError={!!errors.status} {...register("status")}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <FormError message={errors.status?.message} />
      </div>

      {eventType === "CUSTOM" && (
        <div className={twoCol ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
          <Label htmlFor="custom_event_type_label">Custom event type label</Label>
          <Input
            id="custom_event_type_label"
            placeholder="e.g. Baby Shower"
            hasError={!!errors.custom_event_type_label}
            {...register("custom_event_type_label")}
          />
          <FormError message={errors.custom_event_type_label?.message} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="host_name">Host name</Label>
        <Input
          id="host_name"
          placeholder="Defaults to your name if left blank"
          hasError={!!errors.host_name}
          {...register("host_name")}
        />
        <FormError message={errors.host_name?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="venue_name">Venue name</Label>
        <Input
          id="venue_name"
          placeholder="The Grand Meridian"
          hasError={!!errors.venue_name}
          {...register("venue_name")}
        />
        <FormError message={errors.venue_name?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event_date">Event date</Label>
        <Input
          id="event_date"
          type="date"
          min={isEditMode ? undefined : localToday()}
          hasError={!!errors.event_date}
          {...register("event_date")}
        />
        <FormError message={errors.event_date?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event_time">Start time</Label>
        <Input
          id="event_time"
          type="time"
          hasError={!!errors.event_time}
          {...register("event_time")}
        />
        <FormError message={errors.event_time?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="event_end_time">End time (optional)</Label>
        <Input
          id="event_end_time"
          type="time"
          hasError={!!errors.event_end_time}
          {...register("event_end_time")}
        />
        <p className="text-xs text-slate-400">
          Guests will see the time as a range, e.g. 7:00 PM - 10:00 PM.
        </p>
        <FormError message={errors.event_end_time?.message} />
      </div>

      <div className={twoCol ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
        <Label htmlFor="google_maps_link">Google Maps link</Label>
        <Input
          id="google_maps_link"
          type="url"
          inputMode="url"
          placeholder="https://maps.google.com/..."
          hasError={!!errors.google_maps_link}
          {...register("google_maps_link")}
        />
        <FormError message={errors.google_maps_link?.message} />
      </div>

      <div className={twoCol ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
        <Label htmlFor="address">Address</Label>
        <textarea
          id="address"
          rows={2}
          className={textareaClass(!!errors.address)}
          placeholder="Street, city, state"
          {...register("address")}
        />
        <FormError message={errors.address?.message} />
      </div>

      <div className={twoCol ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={3}
          className={textareaClass(!!errors.description)}
          placeholder="Tell guests a little about this event"
          {...register("description")}
        />
        <FormError message={errors.description?.message} />
      </div>

      {coverField(twoCol ? "lg" : "sm", twoCol)}
    </>
  );

  return (
    <div className="mobile-safe-bottom mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <h1 className="text-xl font-bold text-[var(--brand-navy)] lg:text-2xl">
        {isEditMode ? "Edit event" : "Create a new event"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {isEditMode
          ? "Update the details below and save your changes."
          : "Fill in the details for your event. You can edit these later."}
      </p>

      {isDesktop ? (
        <Card className="mt-8 p-8">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid grid-cols-2 gap-5">{fields(true)}</div>

            {statusBlock}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
                disabled={activeMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={activeMutation.isPending}>
                {isEditMode ? "Save changes" : "Create event"}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {fields(false)}

          {statusBlock}

          <Button type="submit" className="w-full" size="lg" isLoading={activeMutation.isPending}>
            {isEditMode ? "Save changes" : "Create event"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => navigate(-1)}
            disabled={activeMutation.isPending}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}