import { useEffect, useRef, useState } from "react";

export type SSEMessage<T = unknown> = {
  type: string;
  data: T;
};

export function useSSE<T = unknown>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Get token from URL params or sessionStorage
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
      setError(
        new Error(
          "Authentication token not found in URL. Please use the URL provided by 'wraps console' command."
        )
      );
      return;
    }

    // Create EventSource with token
    const eventSource = new EventSource(`${url}?token=${token}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "error") {
          setError(new Error(message.error));
        } else {
          setData(message);
        }
      } catch (err) {
        setError(err as Error);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError(new Error("Connection lost"));
    };

    // Cleanup
    return () => {
      eventSource.close();
    };
  }, [url]);

  return { data, error, isConnected };
}
