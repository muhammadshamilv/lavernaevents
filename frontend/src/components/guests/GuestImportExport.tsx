import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Contact, Download, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportGuestsCsv } from "@/api/guests.api";
import { useImportGuestsCsvMutation } from "@/queries/useGuestQueries";
import { getApiErrorMessage } from "@/lib/apiError";
import GuestContactImport from "./GuestContactImport";
import type { CSVImportResult } from "@/types/guest.types";

interface GuestImportExportProps {
  eventId: number;
}

export default function GuestImportExport({ eventId }: GuestImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportGuestsCsvMutation(eventId);

  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showContactImport, setShowContactImport] = useState(false);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleSampleDownload = () => {
    const sample =
      "name,mobile_number,email,category,family_member_count,notes\n" +
      "Anjali Sharma,9876543210,anjali@example.com,Family,4,Vegetarian\n" +
      "Rohan Mehta,9123456780,,Friends,2,\n";
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "guest-list-sample.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportResult(null);
    setImportError(null);

    if (file.size > 2 * 1024 * 1024) {
      setImportError("That file is too large. The CSV must be 2 MB or smaller.");
      return;
    }

    importMutation.mutate({ file }, {
      onSuccess: (result) => setImportResult(result),
      onError: (error) =>
        setImportError(getApiErrorMessage(error, "Couldn't import this file.")),
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      await exportGuestsCsv(eventId);
    } catch (error) {
      setExportError(getApiErrorMessage(error, "Couldn't export guests right now."));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowContactImport((prev) => !prev)}
        >
          <Contact className="h-4 w-4" />
          Import from Contacts
        </Button>
        <Button variant="outline" size="sm" onClick={handleImportClick} isLoading={importMutation.isPending}>
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} isLoading={isExporting}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleSampleDownload}>
          <FileText className="h-4 w-4" />
          Sample CSV
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose a CSV file of guests to import"
          tabIndex={-1}
          className="sr-only"
          onChange={handleFileChange}
        />
      </div>

      {showContactImport && (
        <div className="mt-3">
          <GuestContactImport eventId={eventId} />
        </div>
      )}

      <p className="mt-2 text-xs text-slate-400">
        CSV columns: name, mobile_number (required), email, category, family_member_count, notes.
        Up to 1000 rows, 2 MB.
      </p>

      {exportError && <p className="mt-2 text-sm text-rose-600">{exportError}</p>}
      {importError && <p className="mt-2 text-sm text-rose-600">{importError}</p>}

      {importResult && (
        <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4">
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
    </div>
  );
}