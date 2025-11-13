"use client";

import { format } from "date-fns";
import { CalendarIcon, Clock, MapPin, Tag, Type, Users } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "../types";

type EventFormProps = {
  event?: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: Partial<CalendarEvent>) => void;
  onDelete?: (eventId: number) => void;
};

const eventTypes = [
  { value: "meeting", label: "Meeting", color: "bg-blue-500" },
  { value: "event", label: "Event", color: "bg-green-500" },
  { value: "personal", label: "Personal", color: "bg-pink-500" },
  { value: "task", label: "Task", color: "bg-orange-500" },
  { value: "reminder", label: "Reminder", color: "bg-purple-500" },
];

const timeSlots = [
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
  "5:30 PM",
  "6:00 PM",
  "6:30 PM",
  "7:00 PM",
  "7:30 PM",
  "8:00 PM",
  "8:30 PM",
];

const durationOptions = [
  "15 min",
  "30 min",
  "45 min",
  "1 hour",
  "1.5 hours",
  "2 hours",
  "3 hours",
  "All day",
];

export function EventForm({
  event,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: EventFormProps) {
  const [formData, setFormData] = useState({
    title: event?.title || "",
    date: event?.date || new Date(),
    time: event?.time || "9:00 AM",
    duration: event?.duration || "1 hour",
    type: event?.type || "meeting",
    location: event?.location || "",
    description: event?.description || "",
    attendees: event?.attendees || [],
    allDay: false,
    reminder: true,
  });

  const [showCalendar, setShowCalendar] = useState(false);
  const [newAttendee, setNewAttendee] = useState("");

  const handleSave = () => {
    const eventData: Partial<CalendarEvent> = {
      ...formData,
      id: event?.id,
      color:
        eventTypes.find((t) => t.value === formData.type)?.color ||
        "bg-blue-500",
    };
    onSave(eventData);
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (event?.id && onDelete) {
      onDelete(event.id);
      onOpenChange(false);
    }
  };

  const addAttendee = () => {
    if (
      newAttendee.trim() &&
      !formData.attendees.includes(newAttendee.trim())
    ) {
      setFormData((prev) => ({
        ...prev,
        attendees: [...prev.attendees, newAttendee.trim()],
      }));
      setNewAttendee("");
    }
  };

  const removeAttendee = (attendee: string) => {
    setFormData((prev) => ({
      ...prev,
      attendees: prev.attendees.filter((a) => a !== attendee),
    }));
  };

  const selectedEventType = eventTypes.find((t) => t.value === formData.type);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div
              className={cn("h-3 w-3 rounded-full", selectedEventType?.color)}
            />
            {event ? "Edit Event" : "Create New Event"}
          </DialogTitle>
          <DialogDescription>
            {event
              ? "Make changes to this event"
              : "Add a new event to your calendar"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Event Title */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2" htmlFor="title">
              <Type className="h-4 w-4" />
              Event Title
            </Label>
            <Input
              className="font-medium text-lg"
              id="title"
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Enter event title..."
              value={formData.title}
            />
          </div>

          {/* Event Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Event Type
              </Label>
              <Select
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    type: value as CalendarEvent["type"],
                  }))
                }
                value={formData.type}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn("h-3 w-3 rounded-full", type.color)}
                        />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Date
              </Label>
              <Popover onOpenChange={setShowCalendar} open={showCalendar}>
                <PopoverTrigger asChild>
                  <Button
                    className="w-full justify-start text-left font-normal"
                    variant="outline"
                  >
                    {format(formData.date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    initialFocus
                    mode="single"
                    onSelect={(date) => {
                      if (date) {
                        setFormData((prev) => ({ ...prev, date }));
                        setShowCalendar(false);
                      }
                    }}
                    selected={formData.date}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time
              </Label>
              <Select
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, time: value }))
                }
                value={formData.time}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration and All Day */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, duration: value }))
                }
                value={formData.duration}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((duration) => (
                    <SelectItem key={duration} value={duration}>
                      {duration}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Options</Label>
              <div className="flex h-10 items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.allDay}
                    id="all-day"
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, allDay: checked }))
                    }
                  />
                  <Label className="text-sm" htmlFor="all-day">
                    All day
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.reminder}
                    id="reminder"
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, reminder: checked }))
                    }
                  />
                  <Label className="text-sm" htmlFor="reminder">
                    Reminder
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2" htmlFor="location">
              <MapPin className="h-4 w-4" />
              Location
            </Label>
            <Input
              id="location"
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, location: e.target.value }))
              }
              placeholder="Add location..."
              value={formData.location}
            />
          </div>

          {/* Attendees */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Attendees
            </Label>
            <div className="flex gap-2">
              <Input
                onChange={(e) => setNewAttendee(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addAttendee()}
                placeholder="Add attendee..."
                value={newAttendee}
              />
              <Button
                className="cursor-pointer"
                onClick={addAttendee}
                variant="outline"
              >
                Add
              </Button>
            </div>
            {formData.attendees.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {formData.attendees.map((attendee, index) => (
                  <Badge
                    className="flex items-center gap-2 px-2 py-1"
                    key={index}
                    variant="secondary"
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="font-medium text-[10px]">
                        {attendee
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{attendee}</span>
                    <button
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => removeAttendee(attendee)}
                      type="button"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Add description..."
              rows={3}
              value={formData.description}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6">
            <Button className="flex-1 cursor-pointer" onClick={handleSave}>
              {event ? "Update Event" : "Create Event"}
            </Button>
            {event && onDelete && (
              <Button
                className="cursor-pointer"
                onClick={handleDelete}
                variant="destructive"
              >
                Delete
              </Button>
            )}
            <Button
              className="cursor-pointer"
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
