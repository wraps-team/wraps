"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calendars } from "./calendars";
import { DatePicker } from "./date-picker";

type CalendarSidebarProps = {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  onNewCalendar?: () => void;
  onNewEvent?: () => void;
  events?: Array<{ date: Date; count: number }>;
  className?: string;
};

export function CalendarSidebar({
  selectedDate,
  onDateSelect,
  onNewCalendar,
  onNewEvent,
  events = [],
  className,
}: CalendarSidebarProps) {
  return (
    <div
      className={`flex h-full flex-col rounded-lg bg-background ${className}`}
    >
      {/* Add New Event Button */}
      <div className="border-b p-6">
        <Button className="w-full cursor-pointer" onClick={onNewEvent}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Event
        </Button>
      </div>

      {/* Date Picker */}
      <DatePicker
        events={events}
        onDateSelect={onDateSelect}
        selectedDate={selectedDate}
      />

      <Separator />

      {/* Calendars */}
      <div className="flex-1 p-4">
        <Calendars
          onCalendarDelete={(calendarId) => {
            console.log(`Delete calendar: ${calendarId}`);
          }}
          onCalendarEdit={(calendarId) => {
            console.log(`Edit calendar: ${calendarId}`);
          }}
          onCalendarToggle={(calendarId, visible) => {
            console.log(`Calendar ${calendarId} visibility: ${visible}`);
          }}
          onNewCalendar={onNewCalendar}
        />
      </div>

      {/* Footer */}
      <div className="border-t p-4">
        <Button
          className="w-full cursor-pointer justify-start"
          onClick={onNewCalendar}
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Calendar
        </Button>
      </div>
    </div>
  );
}
