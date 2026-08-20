// Topics types and constants - shared between server actions and client components

// Topic with relations
export type TopicWithMeta = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  public: boolean;
  doubleOptIn: boolean;
  /** Opted in. Not all of them are reachable — see `sendableCount`. */
  subscriberCount: number;
  /** Of the subscribed, the ones a broadcast to this topic would reach. */
  sendableCount: number;
  /** Waiting on a double opt-in confirmation. Broadcasts skip these. */
  pendingCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
};

// Result types
export type ListTopicsResult =
  | { success: true; topics: TopicWithMeta[] }
  | { success: false; error: string };

export type GetTopicResult =
  | { success: true; topic: TopicWithMeta }
  | { success: false; error: string };

export type CreateTopicResult =
  | { success: true; topic: TopicWithMeta }
  | { success: false; error: string };

export type UpdateTopicResult =
  | { success: true; topic: TopicWithMeta }
  | { success: false; error: string };

export type DeleteTopicResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Generate a URL-safe slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}
