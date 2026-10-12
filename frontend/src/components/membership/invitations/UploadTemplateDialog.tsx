import { useState } from "react";
import { ImageIcon, Mail, MessageCircle, Phone, Plus, Smartphone, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalActions } from "@/components/ui/modal";
import { FormError } from "@/components/ui/card";
import { useUploadCustomTemplateMutation } from "@/queries/useInvitationQueries";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type { CustomFieldDefinitionInput, InvitationChannel } from "@/types/invitation.types";

interface UploadTemplateDialogProps {
  open: boolean;
  onClose: () => void;
}

const CHANNELS: { value: InvitationChannel; label: string; icon: typeof Mail }[] = [
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "SMS", label: "SMS", icon: Smartphone },
  { value: "VOICE_CALL", label: "Voice Call", icon: Phone },
];

const STANDARD_PLACEHOLDER_HINTS = [
  "{guest_name}",
  "{event_name}",
  "{event_date}",
  "{event_time}",
  "{venue_name}",
  "{venue_address}",
  "{host_name}",
];

function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function UploadTemplateDialog({ open, onClose }: UploadTemplateDialogProps) {
  const uploadMutation = useUploadCustomTemplateMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState<InvitationChannel>("EMAIL");
  const [bodyText, setBodyText] = useState("");
  const [customFields, setCustomFields] = useState<CustomFieldDefinitionInput[]>([]);
  const [previewImage, setPreviewImage] = useState<File | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setChannel("EMAIL");
    setBodyText("");
    setCustomFields([]);
    setPreviewImage(null);
    setBackgroundImage(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Phase 21: Voice Call templates are read aloud via Twilio's
  // text-to-speech, so body_text is just as required for them as it is
  // for WhatsApp/SMS - there's no "image-only" voice call the way an
  // Email template can rely purely on its background_image.
  const needsBodyText = channel === "WHATSAPP" || channel === "SMS" || channel === "VOICE_CALL";
  const needsEmailContent = channel === "EMAIL" && !backgroundImage && !bodyText;

  const canSubmit =
    name.trim().length > 0 &&
    (!needsBodyText || bodyText.trim().length > 0) &&
    (channel !== "EMAIL" || !needsEmailContent) &&
    customFields.every((field) => field.field_key.trim().length > 0 && field.label.trim().length > 0);

  const handleAddCustomField = () => {
    setCustomFields((fields) => [...fields, { field_key: "", label: "" }]);
  };

  const handleRemoveCustomField = (index: number) => {
    setCustomFields((fields) => fields.filter((_, i) => i !== index));
  };

  const handleCustomFieldLabelChange = (index: number, label: string) => {
    setCustomFields((fields) =>
      fields.map((field, i) =>
        i === index ? { ...field, label, field_key: slugifyKey(label) || field.field_key } : field
      )
    );
  };

  const placeholderHints = [
    ...STANDARD_PLACEHOLDER_HINTS,
    ...customFields.filter((f) => f.field_key).map((f) => `{${f.field_key}}`),
  ];

  const handleSubmit = () => {
    setErrorMessage(null);

    uploadMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        channel,
        body_text: bodyText.trim() || undefined,
        custom_fields: customFields.length > 0 ? customFields : undefined,
        preview_image: previewImage,
        background_image: backgroundImage,
      },
      {
        onSuccess: () => {
          handleClose();
        },
        onError: (error) => {
          setErrorMessage(getApiErrorMessage(error, "Couldn't upload this template."));
        },
      }
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload your own template"
      description="Adds to your template library and uses one slot immediately."
      icon={Upload}
      size="lg"
      busy={uploadMutation.isPending}
      footer={
        <ModalActions>
          <Button type="button" variant="outline" onClick={handleClose} disabled={uploadMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={uploadMutation.isPending}>
            Upload template
          </Button>
        </ModalActions>
      }
    >
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="template-name">Name</Label>
        <Input
          id="template-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rustic Wedding Invite"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="template-description">Description (optional)</Label>
        <Input
          id="template-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short note to help you tell templates apart"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--brand-navy)]">Channel</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CHANNELS.map((option) => {
            const selected = option.value === channel;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setChannel(option.value)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-xs font-medium transition-all active:scale-[0.98]",
                  selected
                    ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/5 text-[var(--brand-pink)] shadow-sm shadow-[var(--brand-pink)]/10"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                <option.icon className="h-5 w-5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {channel === "VOICE_CALL" && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-sky-50 p-3.5 ring-1 ring-sky-100">
          <Phone className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p className="text-sm text-sky-800">
            Message text below is read aloud to the guest during the call - keep it
            conversational, and avoid including links or anything that needs to be
            typed.
          </p>
        </div>
      )}

      {channel === "EMAIL" && (
        <div className="space-y-1.5">
          <Label htmlFor="background-image">Background image</Label>
          <label
            htmlFor="background-image"
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 transition-colors hover:border-[var(--brand-pink)]/50 hover:bg-[var(--brand-pink)]/[0.03]"
          >
            {backgroundImage ? (
              <>
                <ImageIcon className="h-5 w-5 shrink-0 text-[var(--brand-pink)]" />
                <span className="truncate">{backgroundImage.name}</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 shrink-0" />
                <span>Upload a background image (JPG, PNG, WEBP, up to 5MB)</span>
              </>
            )}
          </label>
          <input
            id="background-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => setBackgroundImage(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="body-text">
          {channel === "VOICE_CALL" ? "Call script" : "Message text"}{" "}
          {needsBodyText ? "" : "(optional)"}
        </Label>
        <textarea
          id="body-text"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={5}
          placeholder={
            channel === "VOICE_CALL"
              ? "Hello {guest_name}, you're invited to {event_name} on {event_date} at {event_time}. We hope to see you at {venue_name}."
              : "Dear {guest_name}, you're invited to {event_name} on {event_date} at {event_time}. Venue: {venue_name}."
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-[var(--brand-navy)] placeholder:text-slate-400 transition-colors sm:text-sm focus:border-[var(--brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40"
        />
        <p className="text-xs text-slate-400">
          Available placeholders: {placeholderHints.join(", ")}
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-[var(--brand-navy)]">
              Custom fields (optional)
            </p>
            <p className="text-xs text-slate-400">
              e.g. "Bride's Name" becomes {"{bride_name}"} in your message text above
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddCustomField}>
            <Plus className="h-3.5 w-3.5" />
            Add field
          </Button>
        </div>

        {customFields.length > 0 && (
          <div className="mt-3 space-y-2.5">
            {customFields.map((field, index) => (
              <div key={index} className="flex items-center gap-2 rounded-2xl bg-slate-50/70 p-2">
                <div className="flex-1">
                  <Input
                    value={field.label}
                    onChange={(e) => handleCustomFieldLabelChange(index, e.target.value)}
                    placeholder="e.g. Bride's Name"
                  />
                </div>
                {field.field_key && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-500">
                    {`{${field.field_key}}`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveCustomField(index)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  aria-label="Remove field"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="preview-image">Thumbnail (optional)</Label>
        <label
          htmlFor="preview-image"
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 transition-colors hover:border-[var(--brand-pink)]/50 hover:bg-[var(--brand-pink)]/[0.03]"
        >
          {previewImage ? (
            <>
              <ImageIcon className="h-5 w-5 shrink-0 text-[var(--brand-pink)]" />
              <span className="truncate">{previewImage.name}</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 shrink-0" />
              <span>Used as the thumbnail in your template gallery</span>
            </>
          )}
        </label>
        <input
          id="preview-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => setPreviewImage(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>

    {errorMessage && <div className="mt-5"><FormError message={errorMessage} /></div>}
    </Modal>
  );
}