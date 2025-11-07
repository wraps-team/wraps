"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CalendarEvent } from "../types";
import { useCalendar } from "../use-calendar";
import { CalendarMain } from "./calendar-main";
import { CalendarSidebar } from "./calendar-sidebar";
import { EventForm } from "./event-form";

interface CalendarProps {
  events: CalendarEvent[];
  eventDates: Array<{ date: Date; count: number }>;
}

export function Calendar({ events, eventDates }: CalendarProps) {
  const calendar = useCalendar(events);

  return (
    <>
      <div className="relative rounded-lg border bg-background">
        <div className="flex min-h-[800px]">
          {/* Desktop Sidebar - Hidden on mobile/tablet, shown on extra large screens */}
          <div className="hidden w-80 shrink-0 border-r xl:block">
            <CalendarSidebar
              className="h-full"
              events={eventDates}
              onDateSelect={calendar.handleDateSelect}
              onNewCalendar={calendar.handleNewCalendar}
              onNewEvent={calendar.handleNewEvent}
              selectedDate={calendar.selectedDate}
            />
          </div>

          {/* Main Calendar Panel */}
          <div className="min-w-0 flex-1">
            <CalendarMain
              events={calendar.events}
              onDateSelect={calendar.handleDateSelect}
              onEventClick={calendar.handleEditEvent}
              onMenuClick={() => calendar.setShowCalendarSheet(true)}
              selectedDate={calendar.selectedDate}
            />
          </div>
        </div>

        {/* Mobile/Tablet Sheet - Positioned relative to calendar container */}
        <Sheet
          onOpenChange={calendar.setShowCalendarSheet}
          open={calendar.showCalendarSheet}
        >
          <SheetContent
            className="w-80 p-0"
            side="left"
            style={{ position: "absolute" }}
          >
            <SheetHeader className="p-4 pb-2">
              <SheetTitle>Calendar</SheetTitle>
              <SheetDescription>
                Browse dates and manage your calendar events
              </SheetDescription>
            </SheetHeader>
            <CalendarSidebar
              className="h-full"
              events={eventDates}
              onDateSelect={calendar.handleDateSelect}
              onNewCalendar={calendar.handleNewCalendar}
              onNewEvent={calendar.handleNewEvent}
              selectedDate={calendar.selectedDate}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Event Form Dialog */}
      <EventForm
        event={calendar.editingEvent}
        onDelete={calendar.handleDeleteEvent}
        onOpenChange={calendar.setShowEventForm}
        onSave={calendar.handleSaveEvent}
        open={calendar.showEventForm}
      />
    </>
  );
}
