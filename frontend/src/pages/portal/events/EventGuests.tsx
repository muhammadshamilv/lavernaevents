import { useParams } from "react-router-dom";
import { SearchX, Users } from "lucide-react";
import { useEvent } from "@/queries/useEventQueries";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink, PageHeader, StateCard } from "@/components/portal/PortalUI";
import GuestImportExport from "@/components/guests/GuestImportExport";
import GuestCardList from "@/components/guests/GuestCardList";

export default function EventGuests() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? Number(id) : undefined;

  const { data: event, isLoading, isError } = useEvent(eventId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-7 w-56" />
      </div>
    );
  }

  if (isError || !event || !eventId) {
    return (
      <StateCard
        icon={SearchX}
        title="Event not found"
        message="This event couldn't be found, or you don't have access to it."
        to="/portal/events"
        actionLabel="Back to events"
      />
    );
  }

  return (
    <div>
      <div className="px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <BackLink to={`/portal/events/${eventId}`}>{event.name}</BackLink>

          <PageHeader
            className="mt-3"
            eyebrow="Guests"
            icon={Users}
            title="Guest management"
            description="Add guests, import a list and track every RSVP."
            actions={<GuestImportExport eventId={eventId} />}
          />
        </div>
      </div>

      <GuestCardList eventId={eventId} />
    </div>
  );
}