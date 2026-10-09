import { useState } from "react";
import { Download, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvitationReport } from "@/queries/useInvitationQueries";
import { downloadInvitationReportPdf } from "@/api/invitations.api";
import { toastStore } from "@/stores/toast.store";
import { getApiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type {
  CategoryReportBreakdown,
  InvitationChannel,
  RsvpSummary,
  SendSummary,
} from "@/types/invitation.types";

const CHANNEL_LABEL: Record<InvitationChannel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  SMS: "SMS",
  VOICE_CALL: "Voice Call",
};

const RESPONSE_LABEL: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  MAYBE: "Maybe",
};

const RESPONSE_BADGE_CLASS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  ACCEPTED: "badge-success",
  REJECTED: "bg-rose-100 text-rose-700",
  MAYBE: "badge-gold",
};

function SendSummaryTable({ summary }: { summary: SendSummary }) {
  return (
    <table className="w-full min-w-[300px] text-left text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-4">Channel</th>
          <th className="py-2 pr-4">Sent</th>
          <th className="py-2 pr-4">Failed</th>
          <th className="py-2">Reminders Sent</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(Object.keys(summary) as InvitationChannel[]).map((channel) => (
          <tr key={channel}>
            <td className="py-2 pr-4 font-medium text-[var(--brand-navy)]">
              {CHANNEL_LABEL[channel]}
            </td>
            <td className="py-2 pr-4 text-slate-600">{summary[channel].sent}</td>
            <td className="py-2 pr-4 text-slate-600">{summary[channel].failed}</td>
            <td className="py-2 text-slate-600">{summary[channel].reminders_sent}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RsvpSummaryTable({ summary }: { summary: RsvpSummary }) {
  return (
    <table className="w-full min-w-[260px] text-left text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-4">Response</th>
          <th className="py-2 pr-4">Guests</th>
          <th className="py-2">Headcount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(Object.keys(summary) as (keyof RsvpSummary)[]).map((responseStatus) => (
          <tr key={responseStatus}>
            <td className="py-2 pr-4">
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                  RESPONSE_BADGE_CLASS[responseStatus]
                )}
              >
                {RESPONSE_LABEL[responseStatus]}
              </span>
            </td>
            <td className="py-2 pr-4 text-slate-600">{summary[responseStatus].guests}</td>
            <td className="py-2 text-slate-600">{summary[responseStatus].headcount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CategoryCard({ category }: { category: CategoryReportBreakdown }) {
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-semibold text-[var(--brand-navy)]">{category.category_name}</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sends
          </p>
          <div className="mt-2 overflow-x-auto">
            <SendSummaryTable summary={category.send_summary} />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            RSVPs
          </p>
          <div className="mt-2 overflow-x-auto">
            <RsvpSummaryTable summary={category.rsvp_summary} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function InvitationReportTab({ eventId }: { eventId: number }) {
  const { data: report, isLoading, isError } = useInvitationReport(eventId);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const objectUrl = await downloadInvitationReportPdf(eventId);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${report?.event_name ?? "event"}-invitation-report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoking straight away can cancel the download in Safari / some
      // mobile browsers; give the browser a moment to start it.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (error) {
      toastStore.show(getApiErrorMessage(error, "Couldn't download the report."), "error");
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !report) {
    return (
      <p className="mt-6 text-center text-sm text-rose-600">
        Couldn't load the report right now. Please refresh the page.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Users className="h-4 w-4" />
          {report.total_guests} guest{report.total_guests === 1 ? "" : "s"} &middot; expected
          headcount {report.total_expected_headcount}
        </div>
        <Button size="sm" variant="outline" onClick={handleDownloadPdf} isLoading={downloading}>
          <Download className="h-3.5 w-3.5" />
          Download PDF
        </Button>
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="font-semibold text-[var(--brand-navy)]">Send Summary</h3>
        <div className="mt-3 overflow-x-auto">
          <SendSummaryTable summary={report.send_summary} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="font-semibold text-[var(--brand-navy)]">RSVP Summary</h3>
        <div className="mt-3 overflow-x-auto">
          <RsvpSummaryTable summary={report.rsvp_summary} />
        </div>
      </Card>

      {report.category_breakdown.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Breakdown by Category
          </h3>
          {report.category_breakdown.map((category) => (
            <CategoryCard key={category.category_id ?? "uncategorized"} category={category} />
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <h3 className="font-semibold text-[var(--brand-navy)]">Guest Detail Log</h3>
        </div>

        {report.guest_details.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            No guests have been added to this event yet.
          </p>
        ) : (
          <>
            {/* Phones: one card per guest - a 6-column table is unreadable at 360px. */}
            <ul className="divide-y divide-slate-100 sm:hidden">
              {report.guest_details.map((row) => (
                <li key={row.guest_id} className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words font-medium text-[var(--brand-navy)]">
                      {row.guest_name}
                    </p>
                    <span
                      className={cn(
                        "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        RESPONSE_BADGE_CLASS[row.response_status]
                      )}
                    >
                      {RESPONSE_LABEL[row.response_status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {row.category_name ?? "Uncategorized"} &middot; Invitation{" "}
                    {row.invitation_status.replace(/_/g, " ").toLowerCase()}
                  </p>
                  <p className="text-xs text-slate-500">
                    Channels:{" "}
                    {row.channels_used.length > 0
                      ? row.channels_used.map((c) => CHANNEL_LABEL[c]).join(", ")
                      : "-"}{" "}
                    &middot; Reminders: {row.reminders_sent}
                  </p>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th scope="col" className="px-4 py-3 sm:px-6">Guest</th>
                    <th scope="col" className="px-4 py-3 sm:px-6">Category</th>
                    <th scope="col" className="px-4 py-3 sm:px-6">Invitation</th>
                    <th scope="col" className="px-4 py-3 sm:px-6">Response</th>
                    <th scope="col" className="px-4 py-3 sm:px-6">Channels</th>
                    <th scope="col" className="px-4 py-3 sm:px-6">Reminders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.guest_details.map((row) => (
                    <tr key={row.guest_id} className="[@media(hover:hover)]:hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-[var(--brand-navy)] sm:px-6">
                        {row.guest_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 sm:px-6">
                        {row.category_name ?? "Uncategorized"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 sm:px-6">
                        {row.invitation_status.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                            RESPONSE_BADGE_CLASS[row.response_status]
                          )}
                        >
                          {RESPONSE_LABEL[row.response_status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 sm:px-6">
                        {row.channels_used.length > 0
                          ? row.channels_used.map((c) => CHANNEL_LABEL[c]).join(", ")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 sm:px-6">{row.reminders_sent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}