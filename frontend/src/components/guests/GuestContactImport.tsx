import { useState } from "react";
import { AlertCircle, CheckCircle2, Contact, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ContactImportReviewTable, { type RowErrors } from "./ContactImportReviewTable";
import { useGuestCategories } from "@/queries/useGuestQueries";
import { useImportGuestsFromContactsMutation } from "@/queries/useGuestQueries";
import { getApiErrorMessage } from "@/lib/apiError";
import { isValidGuestMobile, normalizeGuestMobile } from "@/lib/phone";
import type { ContactImportRow, ContactImportResult } from "@/types/guest.types";

interface GuestContactImportProps {
  eventId: number;
}

function makeLocalId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Lets the organizer pick contacts from their phone (Contact Picker API,
 * Chrome/Edge on Android only) and review/edit them in a table before
 * bulk-importing. Browsers without the API (desktop, iOS Safari, Firefox)
 * only see the "Add contact manually" fallback - there is no way to
 * detect support except checking for navigator.contacts at runtime.
 */
export default function GuestContactImport({ eventId }: GuestContactImportProps) {
  const [rows, setRows] = useState<ContactImportRow[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ContactImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data: categories = [] } = useGuestCategories(eventId);
  const importMutation = useImportGuestsFromContactsMutation(eventId);

  const isContactPickerSupported =
    typeof navigator !== "undefined" && "contacts" in navigator && navigator.contacts;

  const handlePickContacts = async () => {
    setPickError(null);

    if (!navigator.contacts) {
      setPickError("Your browser doesn't support picking contacts directly. Add guests manually below.");
      return;
    }

    try {
      const picked = await navigator.contacts.select(["name", "tel", "email"], {
        multiple: true,
      });

      const newRows: ContactImportRow[] = picked.map((contact) => ({
        localId: makeLocalId(),
        name: contact.name?.[0]?.trim() ?? "",
        mobile_number: normalizeGuestMobile(contact.tel?.[0] ?? ""),
        email: contact.email?.[0]?.trim() ?? "",
        category: null,
        family_member_count: 3,
      }));

      setRows((prev) => [...prev, ...newRows]);
    } catch (error) {
      // User cancelled the picker, or permission was denied - both land here.
      // Only show an error for the latter; a cancel is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setPickError(getApiErrorMessage(error, "Couldn't open your contacts."));
    }
  };

  const handleAddManualRow = () => {
    setRows((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        name: "",
        mobile_number: "",
        email: "",
        category: null,
        family_member_count: 3,
      },
    ]);
  };

  const handleRowChange = (
    localId: string,
    field: keyof ContactImportRow,
    value: string | number | null
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveRow = (localId: string) => {
    setRows((prev) => prev.filter((row) => row.localId !== localId));
  };

  const handleSubmit = () => {
    setImportError(null);
    setImportResult(null);

    const guests = rows.map((row) => ({
      name: row.name.trim(),
      mobile_number: normalizeGuestMobile(row.mobile_number),
      email: row.email.trim() || undefined,
      category: row.category,
      family_member_count: row.family_member_count,
    }));

    importMutation.mutate(
      { guests },
      {
        onSuccess: (result) => {
          setImportResult(result);
          setRows([]);
        },
        onError: (error) => {
          setImportError(getApiErrorMessage(error, "Couldn't import these contacts."));
        },
      }
    );
  };

  // Per-row problems, shown right on the offending field.
  const rowErrors: Record<string, RowErrors> = {};
  const seenNumbers = new Set<string>();

  for (const row of rows) {
    const errors: RowErrors = {};
    const number = normalizeGuestMobile(row.mobile_number);

    if (!row.name.trim()) errors.name = "Name is required.";

    if (!isValidGuestMobile(number)) {
      errors.mobile = "Enter a valid number (10-15 digits).";
    } else if (seenNumbers.has(number)) {
      errors.mobile = "This number appears twice.";
    } else {
      seenNumbers.add(number);
    }

    if (errors.name || errors.mobile) rowErrors[row.localId] = errors;
  }

  const hasInvalidRow = Object.keys(rowErrors).length > 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--brand-navy)]">
            Import from contacts
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Pick contacts from your phone, review them, then add them all at once.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isContactPickerSupported && (
            <Button variant="outline" size="sm" onClick={handlePickContacts}>
              <Contact className="h-4 w-4" />
              Pick contacts
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleAddManualRow}>
            <Plus className="h-4 w-4" />
            Add manually
          </Button>
        </div>
      </div>

      {!isContactPickerSupported && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          Picking contacts directly is only supported on Chrome/Edge for Android. Use
          "Add manually" to type in guests here instead.
        </p>
      )}

      {pickError && <p className="mt-3 text-sm text-rose-600">{pickError}</p>}

      {rows.length > 0 && (
        <div className="mt-4 space-y-4">
          <ContactImportReviewTable
            rows={rows}
            rowErrors={rowErrors}
            categories={categories}
            onChange={handleRowChange}
            onRemove={handleRemoveRow}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {rows.length} contact{rows.length === 1 ? "" : "s"} ready to review
            </p>
            <Button
              onClick={handleSubmit}
              isLoading={importMutation.isPending}
              disabled={hasInvalidRow}
            >
              Add {rows.length} guest{rows.length === 1 ? "" : "s"}
            </Button>
          </div>

          {hasInvalidRow && (
            <p className="text-xs text-amber-600">
              Fix the highlighted rows (a name and a unique 10-15 digit mobile number) before importing.
            </p>
          )}
        </div>
      )}

      {importError && <p className="mt-3 text-sm text-rose-600">{importError}</p>}

      {importResult && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-[var(--brand-navy)]">
                  {importResult.created_count} added
                </span>
                {importResult.skipped_count > 0 && `, ${importResult.skipped_count} skipped`}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {importResult.skipped_rows.length > 0 && (
            <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto border-t border-slate-100 pt-3">
              {importResult.skipped_rows.map((row, index) => (
                <li key={index} className="flex items-start gap-2 text-xs text-slate-500">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  Row {row.row}: {row.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}