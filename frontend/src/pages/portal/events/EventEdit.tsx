import { useParams } from "react-router-dom";
import { useEvent } from "@/queries/useEventQueries";
import EventForm from "@/components/events/EventForm";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SearchX } from "lucide-react";
import { StateCard } from "@/components/portal/PortalUI";

export default function EventEdit() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? Number(id) : undefined;

  const { data: event, isLoading, isError } = useEvent(eventId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Card className="p-6 sm:p-8" aria-busy="true">
          <Skeleton className="h-6 w-48" />
          <div className="mt-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      </div>
    );
  }

  if (isError || !event) {
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

  return <EventForm existingEvent={event} />;
}