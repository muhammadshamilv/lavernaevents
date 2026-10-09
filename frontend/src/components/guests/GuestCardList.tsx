import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MailCheck,
  Pencil,
  Phone,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import GuestForm from "./GuestForm";
import CategoryManager from "./CategoryManager";
import ReminderScheduleManager from "./ReminderScheduleManager";
import PendingWhatsAppReminders from "./PendingWhatsAppReminders";
import ChannelSelector from "./ChannelSelector";
import BulkSendDialog from "./BulkSendDialog";
import { useDeleteGuestMutation, useGuests } from "@/queries/useGuestQueries";
import { useActiveFilledTemplate } from "@/queries/useInvitationQueries";
import {
  useSendInvitationMutation,
  useSendReminderMutation,
} from "@/queries/useNotificationQueries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getInitials } from "@/lib/format";
import { getApiErrorMessage } from "@/lib/apiError";
import { toastStore } from "@/stores/toast.store";
import { CHANNEL_META } from "@/lib/channels";
import { navigateWhatsAppWindow, openPendingWhatsAppWindow } from "@/lib/whatsapp";
import {
  INVITATION_STATUS_LABEL,
  RESPONSE_STATUS_BADGE_CLASS,
  RESPONSE_STATUS_LABEL,
} from "@/lib/guestDisplay";
import { cn } from "@/lib/utils";
import type { GuestsQueryParams } from "@/api/guests.api";
import type { Guest, InvitationStatus, ResponseStatus } from "@/types/guest.types";
import type { BulkSendSelection, NotificationChannel } from "@/types/notification.types";

interface GuestCardListProps {
  eventId: number;
}

const RESPONSE_FILTER_OPTIONS: { value: ResponseStatus | ""; label: string }[] = [
  { value: "", label: "All responses" },
  { value: "PENDING", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Declined" },
  { value: "MAYBE", label: "Maybe" },
];

const INVITATION_FILTER_OPTIONS: { value: InvitationStatus | ""; label: string }[] = [
  { value: "", label: "All invitations" },
  { value: "NOT_SENT", label: "Not sent" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
];

/** Delivery state of the guest on the CURRENTLY SELECTED channel. */
function ChannelStatusTag({ guest, channel }: { guest: Guest; channel: NotificationChannel | null }) {
  const status = channel ? guest.channel_status?.[channel] : undefined;

  // No channel chosen yet: show the guest's overall status, as before.
  if (!channel) {
    return (
      <div className="flex items-center gap-1 text-xs text-slate-400">
        {guest.invitation_status === "SENT" && (
          <MailCheck className="h-3.5 w-3.5 text-[var(--brand-green)]" />
        )}
        {guest.invitation_status === "FAILED" && <XCircle className="h-3.5 w-3.5 text-rose-500" />}
        {guest.invitation_status === "NOT_SENT" && <Send className="h-3.5 w-3.5" />}
        {INVITATION_STATUS_LABEL[guest.invitation_status]}
      </div>
    );
  }

  if (status === "SENT") {
    return (
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <MailCheck className="h-3.5 w-3.5 text-[var(--brand-green)]" />
        Sent
      </div>
    );
  }

  if (status === "CALLING") {
    return (
      <div className="flex items-center gap-1 text-xs text-amber-600">
        <Clock className="h-3.5 w-3.5" />
        Calling...
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="flex items-center gap-1 text-xs text-rose-600">
        <XCircle className="h-3.5 w-3.5" />
        Failed
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs text-slate-400">
      <Send className="h-3.5 w-3.5" />
      Not sent
    </div>
  );
}

/**
 * Single responsive guest list.
 *
 * Sending flow: the organizer first picks a channel at the top.
 *  - WhatsApp: every card has a one-click Send/Resend button (no
 *    confirmation) - WhatsApp opens with the invitation ready.
 *  - Email / SMS / Voice Call: cards get tick boxes; the organizer ticks
 *    guests (or uses Select all / a whole category), then confirms once
 *    and the invitations go out in bulk with live progress.
 */
export default function GuestCardList({ eventId }: GuestCardListProps) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [responseFilter, setResponseFilter] = useState<ResponseStatus | "">("");
  const [invitationFilter, setInvitationFilter] = useState<InvitationStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all" | "uncategorized">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Sending
  const [channel, setChannel] = useState<NotificationChannel | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sendingGuestId, setSendingGuestId] = useState<number | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, responseFilter, invitationFilter, categoryFilter]);

  // A selection only makes sense for the channel and filters it was made under.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, [channel, categoryFilter, debouncedSearch, responseFilter, invitationFilter]);

  const params: GuestsQueryParams = {
    page,
    search: debouncedSearch || undefined,
    response_status: responseFilter || undefined,
    invitation_status: invitationFilter || undefined,
    category:
      typeof categoryFilter === "number"
        ? categoryFilter
        : categoryFilter === "uncategorized"
          ? "uncategorized"
          : undefined,
  };

  const { data, isLoading, isError } = useGuests(eventId, params);
  const { data: active, isLoading: activeLoading } = useActiveFilledTemplate();
  const deleteMutation = useDeleteGuestMutation(eventId);
  const sendMutation = useSendInvitationMutation(eventId);
  const sendReminderMutation = useSendReminderMutation(eventId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Guest | null>(null);
  const [remindingGuestId, setRemindingGuestId] = useState<number | null>(null);

  const guests = data?.guests ?? [];
  const pagination = data?.pagination;
  const activeFilterCount = (responseFilter ? 1 : 0) + (invitationFilter ? 1 : 0);
  const hasFilters =
    !!debouncedSearch || !!responseFilter || !!invitationFilter || categoryFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setResponseFilter("");
    setInvitationFilter("");
    setCategoryFilter("all");
  };

  // If the current page no longer exists (e.g. the last guest on it was
  // deleted) step back to the last page that does.
  useEffect(() => {
    if (pagination && pagination.total_pages > 0 && page > pagination.total_pages) {
      setPage(pagination.total_pages);
    }
  }, [pagination, page]);

  const channelMeta = channel ? CHANNEL_META[channel] : null;
  const isBulkChannel = !!channelMeta?.bulk;
  const isWhatsApp = channel === "WHATSAPP";

  const hasTemplate = !!active;
  const wrongEvent = !!active && active.event !== eventId;
  const readyToSend = hasTemplate && !wrongEvent;

  // ---- selection (bulk channels) -------------------------------------

  const isSelectable = (guest: Guest) =>
    isBulkChannel && readyToSend && (channel !== "EMAIL" || !!guest.email);

  const selectableIds = guests.filter(isSelectable).map((guest) => guest.id);
  const allPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  // "Select all N guests" can only honor the category filter - search and
  // the status filters can't be passed to the bulk endpoint, so selecting
  // beyond the visible page is disabled while they are active.
  const canSelectAllMatching =
    !debouncedSearch &&
    !responseFilter &&
    !invitationFilter &&
    categoryFilter !== "uncategorized";

  const matchingCount = pagination?.count ?? 0;
  const selectionCount = selectAllMatching ? matchingCount : selectedIds.size;

  const toggleGuest = (guestId: number) => {
    setSelectAllMatching(false);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const togglePage = () => {
    setSelectAllMatching(false);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allPageSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  };

  const buildSelection = (): BulkSendSelection => {
    if (selectAllMatching) {
      if (typeof categoryFilter === "number") return { category_ids: [categoryFilter] };
      return { select_all: true };
    }

    return { guest_ids: Array.from(selectedIds) };
  };

  const scopeLabel = typeof categoryFilter === "number" ? " in this category" : "";

  // ---- guest actions --------------------------------------------------

  const openCreate = () => {
    setEditingGuest(undefined);
    setFormOpen(true);
  };

  const openEdit = (guest: Guest) => {
    setEditingGuest(guest);
    setFormOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toastStore.show("Guest removed.");
      },
      onError: (error) => {
        setDeleteTarget(null);
        toastStore.show(getApiErrorMessage(error, "Couldn't remove this guest."), "error");
      },
    });
  };

  // WhatsApp: one click, no confirmation. The tab is opened right now (on
  // the click) and pointed at the invitation once the server has it ready.
  const handleWhatsAppSend = (guest: Guest) => {
    if (!readyToSend) return;

    const popup = openPendingWhatsAppWindow();
    setSendingGuestId(guest.id);

    sendMutation.mutate(
      { guest_id: guest.id, channel: "WHATSAPP" },
      {
        onSuccess: (log) => {
          const opened = navigateWhatsAppWindow(popup, log.wa_link);

          if (!opened) {
            toastStore.show(
              "Your browser blocked the WhatsApp window. Allow pop-ups for this site, then tap Resend.",
              "error"
            );
          }
        },
        onError: (error) => {
          popup?.close();
          toastStore.show(getApiErrorMessage(error, "Couldn't prepare this invitation."), "error");
        },
        onSettled: () => setSendingGuestId(null),
      }
    );
  };

  const handleRemind = (guest: Guest) => {
    // Remind over the selected channel if this guest already got one
    // there; otherwise the server uses the channel their invitation last
    // went out on.
    const remindChannel =
      channel && ["SENT", "CALLING"].includes(guest.channel_status?.[channel] ?? "")
        ? channel
        : undefined;

    const popup = remindChannel === "WHATSAPP" ? openPendingWhatsAppWindow() : null;

    setRemindingGuestId(guest.id);
    sendReminderMutation.mutate(
      { guest_id: guest.id, channel: remindChannel },
      {
        onSuccess: (log) => {
          if (log.channel === "WHATSAPP" && log.wa_link) {
            navigateWhatsAppWindow(popup, log.wa_link);
          } else {
            toastStore.show(`Reminder sent to ${guest.name}.`);
          }
        },
        onError: (error) => {
          popup?.close();
          toastStore.show(getApiErrorMessage(error, "Could not send reminder."), "error");
        },
        onSettled: () => setRemindingGuestId(null),
      }
    );
  };

  // A reminder only makes sense once the guest has actually been sent an
  // invitation, and only while they haven't responded yet.
  const canRemind = (guest: Guest) =>
    guest.invitation_status === "SENT" && guest.response_status === "PENDING";

  return (
    <div className="mobile-safe-bottom px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--brand-navy)] lg:text-2xl">Guests</h1>
            <p className="mt-1 text-sm text-slate-500">
              {pagination
                ? `${pagination.count} guest${pagination.count === 1 ? "" : "s"}`
                : "Manage your guest list."}
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="lg:h-11 lg:px-6 lg:text-sm">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Add guest</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        <div className="mt-4 space-y-3 lg:mt-6">
          <PendingWhatsAppReminders />
          <ReminderScheduleManager eventId={eventId} />
        </div>

        {/* Step 1: choose the channel before touching any guest */}
        <div className="mt-4 lg:mt-6">
          <ChannelSelector value={channel} onChange={setChannel} />
        </div>

        {/* Sending needs a filled template for THIS event */}
        {channel && !activeLoading && !readyToSend && (
          <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                {wrongEvent
                  ? "Your selected template is set up for a different event"
                  : "No template selected yet"}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {wrongEvent
                  ? `"${active?.template_name}" is filled in for "${active?.event_name}". Select and fill a template for this event to start sending.`
                  : "Pick a template, fill it in for this event and confirm it before sending invitations."}
              </p>
              <Link
                to="/portal/templates"
                className="mt-2 inline-block text-sm font-semibold text-[var(--brand-pink)]"
              >
                Go to Templates
              </Link>
            </div>
          </div>
        )}

        <div className="mt-4 lg:mt-6">
          <CategoryManager
            eventId={eventId}
            activeCategory={categoryFilter}
            onSelectCategory={setCategoryFilter}
          />
        </div>

        {/* Search + filters: inline row at lg:, collapsible panel below */}
        <div className="mt-4 flex items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search guests"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or mobile number"
              className="h-11 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm text-[var(--brand-navy)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-pink)]/40 focus:border-[var(--brand-pink)]"
            />
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <Select
              aria-label="Filter by response"
              value={responseFilter}
              onChange={(e) => setResponseFilter(e.target.value as ResponseStatus | "")}
              className="w-44"
            >
              {RESPONSE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by invitation status"
              value={invitationFilter}
              onChange={(e) => setInvitationFilter(e.target.value as InvitationStatus | "")}
              className="w-44"
            >
              {INVITATION_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            className={cn(
              "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors lg:hidden",
              filtersOpen || activeFilterCount > 0
                ? "border-[var(--brand-pink)] bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]"
                : "border-slate-200 text-slate-500"
            )}
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-pink)] text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="mt-3 space-y-2 rounded-2xl border border-slate-100 bg-white p-3 lg:hidden">
            <Select
              aria-label="Filter by response"
              value={responseFilter}
              onChange={(e) => setResponseFilter(e.target.value as ResponseStatus | "")}
            >
              {RESPONSE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by invitation status"
              value={invitationFilter}
              onChange={(e) => setInvitationFilter(e.target.value as InvitationStatus | "")}
            >
              {INVITATION_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Bulk channels: select-all row */}
        {isBulkChannel && readyToSend && guests.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-[var(--brand-navy)]">
              <input
                type="checkbox"
                checked={allPageSelected || selectAllMatching}
                onChange={togglePage}
                disabled={selectableIds.length === 0}
                className="h-5 w-5 accent-[var(--brand-pink)]"
              />
              Select all on this page
              {channel === "EMAIL" && (
                <span className="text-xs font-normal text-slate-400">
                  (guests without an email can't be selected)
                </span>
              )}
            </label>

            {allPageSelected &&
              !selectAllMatching &&
              canSelectAllMatching &&
              matchingCount > selectableIds.length && (
                <p className="mt-2 text-xs text-slate-500">
                  {selectableIds.length} selected on this page.{" "}
                  <button
                    type="button"
                    onClick={() => setSelectAllMatching(true)}
                    className="font-semibold text-[var(--brand-pink)]"
                  >
                    Select all {matchingCount} guests{scopeLabel}
                  </button>
                </p>
              )}

            {selectAllMatching && (
              <p className="mt-2 text-xs text-slate-500">
                All {matchingCount} guests{scopeLabel} are selected.{" "}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="font-semibold text-[var(--brand-pink)]"
                >
                  Clear selection
                </button>
              </p>
            )}
          </div>
        )}

        {isError && (
          <p className="mt-8 text-center text-sm text-rose-600 lg:mt-10">
            Couldn't load guests right now. Please refresh the page.
          </p>
        )}

        {isLoading && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="premium-card p-4 lg:p-5">
                <Skeleton className="h-11 w-11 rounded-full lg:h-12 lg:w-12" />
                <Skeleton className="mt-3 h-4 w-28 lg:mt-4" />
                <Skeleton className="mt-2 h-3 w-24" />
                <Skeleton className="mt-4 h-9 w-full rounded-full lg:mt-6" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && guests.length === 0 && (
          <div className="mt-10 flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-[var(--brand-pink)]">
              <UserPlus className="h-6 w-6" />
            </span>
            {hasFilters ? (
              <>
                <p className="mt-4 font-semibold text-[var(--brand-navy)]">
                  No guests match your filters
                </p>
                <Button className="mt-6" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <p className="mt-4 font-semibold text-[var(--brand-navy)]">No guests yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Add your first guest, or import a list from a CSV file.
                </p>
                <Button className="mt-6" onClick={openCreate}>
                  Add your first guest
                </Button>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && guests.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4">
            {guests.map((guest) => {
              const selectable = isSelectable(guest);
              const isSelected = selectAllMatching ? selectable : selectedIds.has(guest.id);
              const channelState = channel ? guest.channel_status?.[channel] : undefined;
              const alreadySent = channelState === "SENT" || channelState === "CALLING";
              const emailMissing = channel === "EMAIL" && !guest.email;

              return (
                <div
                  key={guest.id}
                  className={cn(
                    "premium-card card-hover-lift flex flex-col p-4 lg:p-5",
                    isSelected && "ring-2 ring-[var(--brand-pink)]/60"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {isBulkChannel && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGuest(guest.id)}
                          disabled={!selectable}
                          aria-label={`Select ${guest.name}`}
                          className="h-5 w-5 accent-[var(--brand-pink)] disabled:opacity-40"
                        />
                      )}
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pink)]/10 text-sm font-semibold text-[var(--brand-pink)] lg:h-12 lg:w-12">
                        {getInitials(guest.name)}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        RESPONSE_STATUS_BADGE_CLASS[guest.response_status]
                      )}
                    >
                      {RESPONSE_STATUS_LABEL[guest.response_status]}
                    </span>
                  </div>

                  <p className="mt-3 truncate font-semibold text-[var(--brand-navy)] lg:mt-4">
                    {guest.name}
                  </p>

                  {guest.category_name && (
                    <span className="mt-1 inline-block w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {guest.category_name}
                    </span>
                  )}

                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{guest.mobile_number}</span>
                    </div>
                    {guest.email && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{guest.email}</span>
                      </div>
                    )}
                    {emailMissing && (
                      <p className="text-xs text-rose-500">No email on file - can't send by email.</p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      Party of {guest.family_member_count}
                    </span>
                    <ChannelStatusTag guest={guest} channel={channel} />
                  </div>

                  {/* WhatsApp: one-click Send / Resend, no confirmation */}
                  {isWhatsApp && (
                    <Button
                      className="mt-4 w-full"
                      size="sm"
                      variant={alreadySent ? "outline" : "primary"}
                      onClick={() => handleWhatsAppSend(guest)}
                      isLoading={sendingGuestId === guest.id}
                      disabled={!readyToSend}
                    >
                      {sendingGuestId === guest.id ? null : <Send className="h-3.5 w-3.5" />}
                      {sendingGuestId === guest.id
                        ? "Sending..."
                        : alreadySent
                          ? "Resend"
                          : "Send"}
                    </Button>
                  )}

                  {!channel && (
                    <p className="mt-4 text-center text-xs text-slate-400">
                      Choose a channel above to send.
                    </p>
                  )}

                  {canRemind(guest) && (
                    <Button
                      className="mt-2 w-full"
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemind(guest)}
                      isLoading={remindingGuestId === guest.id && sendReminderMutation.isPending}
                    >
                      <AlarmClock className="h-3.5 w-3.5" />
                      Remind now
                    </Button>
                  )}

                  <div className="mt-2 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(guest)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[var(--brand-navy)]"
                      aria-label="Edit guest"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(guest)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Remove guest"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pagination && pagination.total_pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500 lg:mt-6">
            <span>
              Page {pagination.current_page} of {pagination.total_pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={!pagination.previous}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!pagination.next}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Bulk send bar: appears as soon as something is ticked */}
        {isBulkChannel && channel && selectionCount > 0 && (
          <div className="sticky bottom-[calc(5.5rem+var(--safe-area-inset-bottom))] z-30 mt-6 lg:bottom-4">
            <div className="flex items-center justify-between gap-3 rounded-full bg-[var(--brand-navy)] px-5 py-3 text-white shadow-lg">
              <span className="text-sm font-medium">
                {selectionCount} selected
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-3 text-xs font-normal text-white/70 underline"
                >
                  Clear
                </button>
              </span>
              <Button size="sm" onClick={() => setBulkOpen(true)}>
                <Send className="h-3.5 w-3.5" />
                Send via {CHANNEL_META[channel].label}
              </Button>
            </div>
          </div>
        )}
      </div>

      <GuestForm
        eventId={eventId}
        open={formOpen}
        existingGuest={editingGuest}
        defaultCategoryId={typeof categoryFilter === "number" ? categoryFilter : undefined}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove this guest?"
        description={
          deleteTarget ? `"${deleteTarget.name}" will be permanently removed from this event.` : ""
        }
        confirmLabel="Remove guest"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {channel && isBulkChannel && (
        <BulkSendDialog
          key={`${channel}-${bulkOpen ? "open" : "closed"}`}
          eventId={eventId}
          channel={channel}
          count={selectionCount}
          selection={buildSelection()}
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            clearSelection();
          }}
        />
      )}
    </div>
  );
}