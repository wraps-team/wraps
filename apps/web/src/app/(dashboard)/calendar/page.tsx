import { Calendar } from "./components/calendar";
import { eventDates, events } from "./data";

export default function CalendarPage() {
  return (
    <div className="px-4 lg:px-6">
      <Calendar eventDates={eventDates} events={events} />
    </div>
  );
}
