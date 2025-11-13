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
  MoreHorizontal,
  Search,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
// Import data
import eventsData from "../data/events.json";
import type { CalendarEvent } from "../types";

type CalendarMainProps = {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  onMenuClick?: () => void;
  events?: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
};

export function CalendarMain({
  selectedDate,
  onDateSelect,
  onMenuClick,
  events,
  onEventClick,
}: CalendarMainProps) {
  // Convert JSON events to CalendarEvent objects with proper Date objects, fallback to imported data
  const sampleEvents: CalendarEvent[] =
    events ||
    eventsData.map((event) => ({
      ...event,
      date: new Date(event.date),
      type: event.type as
        | "meeting"
        | "event"
        | "personal"
        | "task"
        | "reminder",
    }));

  const [currentDate, setCurrentDate] = useState(selectedDate || new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "list">(
    "month"
  );
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );

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
    if (onEventClick) {
      onEventClick(event);
    } else {
      setSelectedEvent(event);
      setShowEventDialog(true);
    }
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

        {/* Calendar Body */}
        <div className="grid flex-1 grid-cols-7">
          {calendarDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isDayToday = isToday(day);
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <div
                className={cn(
                  "min-h-[120px] cursor-pointer border-r border-b p-2 transition-colors last:border-r-0",
                  isCurrentMonth
                    ? "bg-background hover:bg-accent/50"
                    : "bg-muted/30 text-muted-foreground",
                  isSelected && "ring-2 ring-primary ring-inset",
                  isDayToday && "bg-accent/20"
                )}
                key={day.toISOString()}
                onClick={() => onDateSelect?.(day)}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "font-medium text-sm",
                      isDayToday &&
                        "flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayEvents.length > 2 && (
                    <span className="text-muted-foreground text-xs">
                      +{dayEvents.length - 2}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map((event) => (
                    <div
                      className={cn(
                        "cursor-pointer truncate rounded-sm p-1 text-white text-xs",
                        event.color
                      )}
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event);
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span className="truncate">{event.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderListView = () => {
    const upcomingEvents = sampleEvents
      .filter((event) => event.date >= new Date())
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return (
      <div className="flex-1 p-6">
        <div className="space-y-4">
          {upcomingEvents.map((event) => (
            <Card
              className="cursor-pointer transition-shadow hover:shadow-md"
              key={event.id}
              onClick={() => handleEventClick(event)}
            >
              <CardContent className="px-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn("mt-1.5 h-3 w-3 rounded-full", event.color)}
                    />
                    <div className="flex-1">
                      <h3 className="font-medium">{event.title}</h3>
                      <div className="mt-2 flex items-center gap-4 text-muted-foreground text-sm">
                        <div className="flex flex-wrap items-center gap-1">
                          <CalendarIcon className="h-4 w-4" />
                          {format(event.date, "MMM d, yyyy")}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {event.time}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {event.location}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="-space-x-2 flex">
                      {event.attendees.slice(0, 3).map((attendee, index) => (
                        <Avatar
                          className="border-2 border-background"
                          key={index}
                        >
                          <AvatarFallback className="text-xs">
                            {attendee}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <Button
                      className="cursor-pointer"
                      size="sm"
                      variant="ghost"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col flex-wrap gap-4 border-b p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {/* Mobile Menu Button */}
          <Button
            className="cursor-pointer xl:hidden"
            onClick={onMenuClick}
            size="sm"
            variant="outline"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            <Button
              className="cursor-pointer"
              onClick={() => navigateMonth("prev")}
              size="sm"
              variant="outline"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              className="cursor-pointer"
              onClick={() => navigateMonth("next")}
              size="sm"
              variant="outline"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              className="cursor-pointer"
              onClick={goToToday}
              size="sm"
              variant="outline"
            >
              Today
            </Button>
          </div>

          <h1 className="font-semibold text-2xl">
            {format(currentDate, "MMMM yyyy")}
          </h1>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {/* Search */}
          <div className="relative">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
            <Input className="w-64 pl-10" placeholder="Search events..." />
          </div>

          {/* View Mode Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="cursor-pointer" variant="outline">
                {viewMode === "month" && <Grid3X3 className="mr-2 h-4 w-4" />}
                {viewMode === "list" && <List className="mr-2 h-4 w-4" />}
                {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setViewMode("month")}
              >
                <Grid3X3 className="mr-2 h-4 w-4" />
                Month
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setViewMode("list")}
              >
                <List className="mr-2 h-4 w-4" />
                List
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Calendar Content */}
      {viewMode === "month" ? renderCalendarGrid() : renderListView()}

      {/* Event Detail Dialog */}
      <Dialog onOpenChange={setShowEventDialog} open={showEventDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title || "Event Details"}</DialogTitle>
            <DialogDescription>
              View and manage this calendar event
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span>{format(selectedEvent.date, "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {selectedEvent.time} ({selectedEvent.duration})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{selectedEvent.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <span>Attendees:</span>
                  <div className="-space-x-2 flex">
                    {selectedEvent.attendees.map(
                      (attendee: string, index: number) => (
                        <Avatar
                          className="h-6 w-6 border-2 border-background"
                          key={index}
                        >
                          <AvatarFallback className="text-xs">
                            {attendee}
                          </AvatarFallback>
                        </Avatar>
                      )
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className={cn("text-white", selectedEvent.color)}
                  variant="secondary"
                >
                  {selectedEvent.type}
                </Badge>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    setShowEventDialog(false);
                  }}
                  variant="outline"
                >
                  Edit
                </Button>
                <Button
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    setShowEventDialog(false);
                  }}
                  variant="destructive"
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
