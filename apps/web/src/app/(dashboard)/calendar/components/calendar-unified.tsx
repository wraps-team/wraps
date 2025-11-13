"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid3X3,
  List,
  MapPin,
  Menu,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import calendarsData from "../data/calendars.json";

// Import data
import eventsData from "../data/events.json";
import type { CalendarEvent } from "../types";

interface CalendarMainProps {
  eventDates?: Array<{ date: Date; count: number }>;
}

export function CalendarMain({ eventDates = [] }: CalendarMainProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "list">(
    "month"
  );
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);

  // Convert JSON events to CalendarEvent objects with proper Date objects
  const sampleEvents: CalendarEvent[] = eventsData.map((event) => ({
    ...event,
    date: new Date(event.date),
    type: event.type as "meeting" | "event" | "personal" | "task" | "reminder",
  }));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  // Extend to show full weeks (including previous/next month days)
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(calendarStart.getDate() - monthStart.getDay());

  const calendarEnd = new Date(monthEnd);
  calendarEnd.setDate(calendarEnd.getDate() + (6 - monthEnd.getDay()));

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const getEventsForDay = (date: Date) =>
    sampleEvents.filter((event) => isSameDay(event.date, date));

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate(
      direction === "prev"
        ? subMonths(currentDate, 1)
        : addMonths(currentDate, 1)
    );
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleNewCalendar = () => {
    console.log("Creating new calendar");
    // In a real app, this would open a new calendar form
  };

  const handleNewEvent = () => {
    console.log("Creating new event");
    // In a real app, this would open event form
  };

  const renderCalendarGrid = () => {
    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div className="flex-1 bg-background">
        {/* Calendar Header */}
        <div className="grid grid-cols-7 border-b">
          {weekDays.map((day) => (
            <div
              className="border-r p-4 text-center font-medium text-muted-foreground text-sm last:border-r-0"
              key={day}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid min-h-[600px] grid-cols-7">
          {calendarDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isDayToday = isToday(day);
            const isSelected = isSameDay(day, selectedDate);

            return (
              <div
                className={cn(
                  "relative min-h-[120px] cursor-pointer border-r border-b p-2 transition-colors last:border-r-0 hover:bg-muted/50",
                  !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                  isDayToday && "bg-blue-50 dark:bg-blue-900/20",
                  isSelected && "bg-blue-100 dark:bg-blue-800/30"
                )}
                key={day.toISOString()}
                onClick={() => handleDateSelect(day)}
              >
                {/* Date Number */}
                <div
                  className={cn(
                    "mb-1 font-medium text-sm",
                    isDayToday && "text-blue-600 dark:text-blue-400"
                  )}
                >
                  {format(day, "d")}
                </div>

                {/* Events */}
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      className={cn(
                        "cursor-pointer truncate rounded px-2 py-1 text-white text-xs transition-opacity hover:opacity-80",
                        event.color
                      )}
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event);
                      }}
                    >
                      {event.time} {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="px-2 text-muted-foreground text-xs">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSidebar = () => (
    <div className="h-full w-full border-r bg-background">
      <div className="border-b p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Calendar</h2>
          <Button onClick={handleNewEvent} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Event
          </Button>
        </div>

        {/* Date Picker */}
        <Calendar
          className="rounded-md border"
          mode="single"
          modifiers={{
            eventDay: eventDates.map((ed) => ed.date),
          }}
          modifiersStyles={{
            eventDay: { fontWeight: "bold" },
          }}
          onSelect={(date) => date && handleDateSelect(date)}
          selected={selectedDate}
        />
      </div>

      {/* Mini Calendars List */}
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium text-sm">My Calendars</h3>
          <Button onClick={handleNewCalendar} size="sm" variant="ghost">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {calendarsData.map((calendar) => (
            <div className="flex items-center space-x-2" key={calendar.id}>
              <div className={cn("h-3 w-3 rounded-full", calendar.color)} />
              <span className="text-sm">{calendar.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative rounded-lg border bg-background">
      <div className="flex min-h-[800px]">
        {/* Desktop Sidebar */}
        <div className="hidden w-80 flex-shrink-0 xl:block">
          {renderSidebar()}
        </div>

        {/* Main Calendar Panel */}
        <div className="min-w-0 flex-1">
          {/* Calendar Toolbar */}
          <div className="border-b bg-background px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* Mobile Menu Button */}
                <Button
                  className="xl:hidden"
                  onClick={() => setShowCalendarSheet(true)}
                  size="sm"
                  variant="ghost"
                >
                  <Menu className="h-4 w-4" />
                </Button>

                {/* Month Navigation */}
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={() => navigateMonth("prev")}
                    size="sm"
                    variant="ghost"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="min-w-[140px] text-center font-semibold text-lg">
                    {format(currentDate, "MMMM yyyy")}
                  </h2>
                  <Button
                    onClick={() => navigateMonth("next")}
                    size="sm"
                    variant="ghost"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <Button onClick={goToToday} size="sm" variant="outline">
                  Today
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <div className="hidden items-center space-x-2 sm:flex">
                  <Button className="text-xs" size="sm" variant="ghost">
                    <Search className="mr-1 h-4 w-4" />
                    Search
                  </Button>
                </div>

                {/* View Mode Toggle */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Grid3X3 className="mr-1 h-4 w-4" />
                      {viewMode === "month"
                        ? "Month"
                        : viewMode === "week"
                          ? "Week"
                          : viewMode === "day"
                            ? "Day"
                            : "List"}
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setViewMode("month")}>
                      <Grid3X3 className="mr-2 h-4 w-4" />
                      Month
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setViewMode("week")}>
                      <List className="mr-2 h-4 w-4" />
                      Week
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setViewMode("day")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      Day
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setViewMode("list")}>
                      <List className="mr-2 h-4 w-4" />
                      List
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Calendar Content */}
          {renderCalendarGrid()}
        </div>
      </div>

      {/* Mobile/Tablet Sheet */}
      <Sheet onOpenChange={setShowCalendarSheet} open={showCalendarSheet}>
        <SheetContent className="w-80 p-0" side="left">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle>Calendar</SheetTitle>
            <SheetDescription>
              Browse dates and manage your calendar events
            </SheetDescription>
          </SheetHeader>
          {renderSidebar()}
        </SheetContent>
      </Sheet>

      {/* Event Details Dialog */}
      <Dialog onOpenChange={setShowEventDialog} open={showEventDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
            <DialogDescription>Event details and information</DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center space-x-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {selectedEvent.time} • {selectedEvent.duration}
                </span>
              </div>

              {selectedEvent.location && (
                <div className="flex items-center space-x-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}

              {selectedEvent.attendees.length > 0 && (
                <div className="flex items-center space-x-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="flex space-x-1">
                    {selectedEvent.attendees.map((attendee, index) => (
                      <Avatar className="h-6 w-6" key={index}>
                        <AvatarFallback className="text-xs">
                          {attendee}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                </div>
              )}

              {selectedEvent.description && (
                <div className="text-muted-foreground text-sm">
                  {selectedEvent.description}
                </div>
              )}

              <div className="flex items-center space-x-2 pt-4">
                <Badge
                  className={cn("text-white", selectedEvent.color)}
                  variant="secondary"
                >
                  {selectedEvent.type}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
