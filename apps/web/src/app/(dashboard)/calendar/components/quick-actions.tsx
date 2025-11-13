"use client";

import {
  Bell,
  Clock,
  Download,
  Plus,
  Settings,
  Share,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface QuickActionsProps {
  onNewEvent?: () => void;
  onNewMeeting?: () => void;
  onNewReminder?: () => void;
  onSettings?: () => void;
}

export function QuickActions({
  onNewEvent,
  onNewMeeting,
  onNewReminder,
  onSettings,
}: QuickActionsProps) {
  const quickStats = [
    { label: "Today's Events", value: "3", color: "bg-blue-500" },
    { label: "This Week", value: "12", color: "bg-green-500" },
    { label: "Pending", value: "2", color: "bg-orange-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-medium text-sm">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quickStats.map((stat, index) => (
            <div className="flex items-center justify-between" key={index}>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${stat.color}`} />
                <span className="text-muted-foreground text-sm">
                  {stat.label}
                </span>
              </div>
              <Badge variant="secondary">{stat.value}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-medium text-sm">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            className="w-full cursor-pointer justify-start"
            onClick={onNewEvent}
            variant="outline"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>

          <Button
            className="w-full cursor-pointer justify-start"
            onClick={onNewMeeting}
            variant="outline"
          >
            <Users className="mr-2 h-4 w-4" />
            Schedule Meeting
          </Button>

          <Button
            className="w-full cursor-pointer justify-start"
            onClick={onNewReminder}
            variant="outline"
          >
            <Bell className="mr-2 h-4 w-4" />
            Set Reminder
          </Button>

          <Separator className="my-3" />

          <Button
            className="w-full cursor-pointer justify-start"
            size="sm"
            variant="ghost"
          >
            <Share className="mr-2 h-4 w-4" />
            Share Calendar
          </Button>

          <Button
            className="w-full cursor-pointer justify-start"
            size="sm"
            variant="ghost"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>

          <Button
            className="w-full cursor-pointer justify-start"
            onClick={onSettings}
            size="sm"
            variant="ghost"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-medium text-sm">
            <Clock className="h-4 w-4" />
            Next Up
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="mt-2 h-2 w-2 rounded-full bg-blue-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">Team Standup</p>
                <p className="text-muted-foreground text-xs">
                  9:00 AM • Conference Room A
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-2 h-2 w-2 rounded-full bg-purple-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">Design Review</p>
                <p className="text-muted-foreground text-xs">
                  2:00 PM • Virtual
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
