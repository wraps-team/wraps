"use client";

import { Laptop, Loader2, LogOut, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UAParser } from "ua-parser-js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient, useSession } from "@/lib/auth-client";

type ActiveSession = {
  id: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
};

export function ActiveSessions() {
  const { data: session } = useSession();
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTerminating, setIsTerminating] = useState<string>();
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const [_selectedSession, _setSelectedSession] =
    useState<ActiveSession | null>(null);

  // Fetch all active sessions on mount
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const sessions = await authClient.listSessions();
        if (sessions.data) {
          setActiveSessions(sessions.data as ActiveSession[]);
        }
      } catch (error) {
        console.error("Failed to fetch sessions:", error);
        toast.error("Failed to load active sessions");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, []);

  const removeActiveSession = (id: string) =>
    setActiveSessions(activeSessions.filter((s) => s.id !== id));

  const handleRevokeSession = async (sessionToRevoke: ActiveSession) => {
    setIsTerminating(sessionToRevoke.id);
    const res = await authClient.revokeSession({
      token: sessionToRevoke.token,
    });

    if (res.error) {
      toast.error(res.error.message || "Failed to revoke session");
    } else {
      toast.success("Session terminated successfully");
      removeActiveSession(sessionToRevoke.id);
    }
    setIsTerminating(undefined);
  };

  const handleRevokeAllSessions = async () => {
    setIsRevokingAll(true);
    // Revoke all sessions except current
    const otherSessions = activeSessions.filter(
      (s) => s.id !== session?.session.id
    );

    for (const sess of otherSessions) {
      const res = await authClient.revokeSession({
        token: sess.token,
      });

      if (res.error) {
        toast.error(`Failed to revoke session: ${res.error.message}`);
      } else {
        removeActiveSession(sess.id);
      }
    }

    toast.success("All other sessions revoked successfully");
    setIsRevokingAll(false);
  };

  const getDeviceIcon = (userAgent?: string) => {
    if (!userAgent) {
      return <Laptop className="h-5 w-5 text-muted-foreground" />;
    }

    const deviceType = new UAParser(userAgent).getDevice().type;
    if (deviceType === "mobile" || deviceType === "tablet") {
      return <Smartphone className="h-5 w-5 text-muted-foreground" />;
    }
    return <Laptop className="h-5 w-5 text-muted-foreground" />;
  };

  const otherSessions = activeSessions.filter(
    (s) => s.id !== session?.session.id
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Manage devices and sessions where you're currently signed in.
              </CardDescription>
            </div>
            {otherSessions.length > 0 && (
              <Button
                className="cursor-pointer text-destructive hover:text-destructive"
                onClick={() => setIsRevokingAll(true)}
                variant="outline"
              >
                Revoke All Other Sessions
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Laptop className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 font-semibold text-lg">No active sessions</h3>
              <p className="max-w-sm text-muted-foreground text-sm">
                Your active sessions will appear here once you sign in.
              </p>
            </div>
          ) : (
            activeSessions
              .filter((sess) => sess.userAgent)
              .map((sess) => {
                const parser = new UAParser(sess.userAgent || "");
                const os = parser.getOS().name || sess.userAgent;
                const browser = parser.getBrowser().name;
                const isCurrent = sess.id === session?.session.id;

                return (
                  <div
                    className="flex items-center justify-between rounded-lg border p-4"
                    key={sess.id}
                  >
                    <div className="flex items-center gap-3">
                      {getDeviceIcon(sess.userAgent)}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">
                            {os}
                            {browser && `, ${browser}`}
                          </p>
                          {isCurrent && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700 text-xs">
                              Current
                            </span>
                          )}
                        </div>
                        {sess.ipAddress && (
                          <p className="text-muted-foreground text-xs">
                            IP: {sess.ipAddress}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      className="cursor-pointer text-destructive hover:text-destructive"
                      disabled={isTerminating === sess.id}
                      onClick={() => handleRevokeSession(sess)}
                      size="sm"
                      variant="ghost"
                    >
                      {isTerminating === sess.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <LogOut className="mr-2 h-4 w-4" />
                          {isCurrent ? "Sign Out" : "Terminate"}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>

      {/* Revoke All Sessions Confirmation */}
      <AlertDialog onOpenChange={setIsRevokingAll} open={isRevokingAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke All Other Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke all other sessions? All other
              devices will be signed out immediately. Your current session will
              remain active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsRevokingAll(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevokeAllSessions}
            >
              Revoke All Sessions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
