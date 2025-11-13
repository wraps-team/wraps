"use client";

import type { Session, User } from "better-auth";
import { createContext, type ReactNode, useContext } from "react";
import { authClient } from "@/lib/auth-client";

interface SessionContextType {
  session: Session | null;
  user: User | null;
  isPending: boolean;
  error: Error | null;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
