import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EmailLog = {
  id: string;
  to: string[]; // Array of recipients
  from: string;
  subject: string;
  status:
    | "delivered"
    | "bounced"
    | "complained"
    | "sent"
    | "failed"
    | "opened"
    | "clicked";
  timestamp: number;
  messageId: string;
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  delivered: "default",
  sent: "secondary",
  bounced: "destructive",
  complained: "destructive",
  failed: "destructive",
  opened: "default",
  clicked: "default",
};

export function EmailLogs() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("15");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("sending");
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch email logs from API
  useEffect(() => {
    async function fetchLogs() {
      try {
        setLoading(true);
        setError(null);

        // Get token from sessionStorage or URL params
        let token = sessionStorage.getItem("wraps-auth-token");

        if (!token) {
          const params = new URLSearchParams(window.location.search);
          token = params.get("token");

          // Store token for future use
          if (token) {
            sessionStorage.setItem("wraps-auth-token", token);
          }
        }

        if (!token) {
          throw new Error(
            "Authentication token not found. Please use the URL provided by 'wraps console' command."
          );
        }

        // Calculate time range
        const daysAgo = Number.parseInt(dateRange, 10);
        const startTime = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
        const endTime = Date.now();

        const response = await fetch(
          `/api/emails?startTime=${startTime}&endTime=${endTime}&limit=100&token=${token}`
        );

        if (!response.ok) {
          let errorMessage = "Failed to fetch email logs";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (_e) {
            // Response wasn't JSON, use status text
            errorMessage = `${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setLogs(
          data.logs.map((log: any) => ({
            id: log.messageId,
            to: log.to,
            from: log.from,
            subject: log.subject,
            status: log.status,
            timestamp: log.sentAt,
            messageId: log.messageId,
          }))
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Error fetching email logs:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
  }, [dateRange]);

  const filteredLogs = logs.filter((log) => {
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesRecipient = log.to.some((recipient) =>
        recipient.toLowerCase().includes(query)
      );
      const matchesSubject = log.subject.toLowerCase().includes(query);

      if (!(matchesRecipient || matchesSubject)) {
        return false;
      }
    }

    // Filter by status
    if (statusFilter !== "all" && log.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffInDays === 0) {
      return "Today";
    }
    if (diffInDays === 1) {
      return "Yesterday";
    }
    if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    }

    return date.toLocaleDateString();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription>
            View and manage your email sending history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs onValueChange={setActiveTab} value={activeTab}>
            <TabsList>
              <TabsTrigger value="sending">Sending</TabsTrigger>
              <TabsTrigger value="receiving">Receiving</TabsTrigger>
            </TabsList>

            <TabsContent className="space-y-4" value="sending">
              {/* Error State */}
              {error && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    value={searchQuery}
                  />
                </div>

                <Select onValueChange={setDateRange} value={dateRange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="15">Last 15 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>

                <Select onValueChange={setStatusFilter} value={statusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="clicked">Clicked</SelectItem>
                    <SelectItem value="opened">Opened</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                    <SelectItem value="complained">Complained</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>

                <Button size="icon" variant="outline">
                  <span className="sr-only">Download</span>↓
                </Button>
              </div>

              {/* Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell
                          className="h-24 text-center text-muted-foreground"
                          colSpan={5}
                        >
                          Loading email logs...
                        </TableCell>
                      </TableRow>
                    ) : filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell
                          className="h-24 text-center text-muted-foreground"
                          colSpan={5}
                        >
                          No emails found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          key={log.id}
                          onClick={() => navigate(`/email/${log.id}`)}
                        >
                          <TableCell className="font-mono text-sm">
                            {log.to.length > 0 ? (
                              <>
                                {log.to[0]}
                                {log.to.length > 1 && (
                                  <span className="ml-1 text-muted-foreground text-xs">
                                    +{log.to.length - 1} more
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">
                                (no recipients)
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANTS[log.status]}>
                              {log.status.charAt(0).toUpperCase() +
                                log.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[400px] truncate">
                            {log.subject}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatTimestamp(log.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Add menu actions here later
                              }}
                              size="icon"
                              variant="ghost"
                            >
                              <span className="sr-only">More options</span>⋯
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination would go here */}
              {filteredLogs.length > 0 && !loading && (
                <div className="flex items-center justify-between text-muted-foreground text-sm">
                  <div>
                    Showing {filteredLogs.length} of {logs.length} emails
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="receiving">
              <div className="flex h-[400px] items-center justify-center text-muted-foreground">
                Receiving emails coming soon
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
