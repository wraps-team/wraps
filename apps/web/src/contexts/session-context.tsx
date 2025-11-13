"use client";

import { createContext, type ReactNode, useContext } from "react";
import { authClient } from "@/lib/auth-client";

// Use ReturnType to infer the exact type from better-auth's useSession hook
type SessionContextType = ReturnType<typeof authClient.useSession>;

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
