import { BaseLayout } from "@/components/layouts/base-layout";
import { Calendar } from "./components/calendar";
import { eventDates, events } from "./data";

export default function CalendarPage() {
  return (
    <BaseLayout description="Manage your schedule and events" title="Calendar">
      <div className="px-4 lg:px-6">
        <Calendar eventDates={eventDates} events={events} />
      </div>
    </BaseLayout>
  );
}
