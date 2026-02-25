import { useEffect } from "react";
import { useIsDirty } from "./use-automation-store";

export function useBeforeUnload() {
  const isDirty = useIsDirty();

  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
