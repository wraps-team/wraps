"use client";

import { Calendar, Clock, Filter, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export function DashboardHeader() {
  const [dateRange, setDateRange] = useState("30d");
  const lastUpdated = new Date().toLocaleString();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-bold text-3xl">
              Business Dashboard
            </CardTitle>
            <CardDescription className="mt-2 text-base">
              Comprehensive overview of your business performance and key
              metrics
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className="cursor-pointer" variant="outline">
              <Clock className="mr-1 h-3 w-3" />
              Live Data
            </Badge>
            <Button className="cursor-pointer" size="sm" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm">Date Range:</span>
              <Select onValueChange={setDateRange} value={dateRange}>
                <SelectTrigger className="w-40 cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem className="cursor-pointer" value="7d">
                    Last 7 days
                  </SelectItem>
                  <SelectItem className="cursor-pointer" value="30d">
                    Last 30 days
                  </SelectItem>
                  <SelectItem className="cursor-pointer" value="90d">
                    Last 90 days
                  </SelectItem>
                  <SelectItem className="cursor-pointer" value="1y">
                    Last year
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="cursor-pointer" size="sm" variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </div>

          <div className="text-muted-foreground text-sm">
            Last updated: {lastUpdated}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
