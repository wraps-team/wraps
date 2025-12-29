"use client";

import { useState, useTransition } from "react";
import { unsubscribeGlobally, updatePreferences } from "./actions";

interface Topic {
  id: string;
  name: string;
  description: string | null;
  subscribed: boolean;
}

interface PreferencesFormProps {
  token: string;
  contactId: string;
  organizationId: string;
  topics: Topic[];
  isGloballyUnsubscribed: boolean;
}

export function PreferencesForm({
  token,
  contactId,
  organizationId,
  topics,
  isGloballyUnsubscribed: initiallyUnsubscribed,
}: PreferencesFormProps) {
  const [isPending, startTransition] = useTransition();
  const [subscriptions, setSubscriptions] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const topic of topics) {
        initial[topic.id] = topic.subscribed;
      }
      return initial;
    }
  );
  const [isGloballyUnsubscribed, setIsGloballyUnsubscribed] = useState(
    initiallyUnsubscribed
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleTopicChange = (topicId: string, subscribed: boolean) => {
    setSubscriptions((prev) => ({ ...prev, [topicId]: subscribed }));
  };

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await updatePreferences(
        token,
        contactId,
        organizationId,
        subscriptions
      );
      if (result.success) {
        setMessage({
          type: "success",
          text: "Preferences saved successfully!",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to save preferences",
        });
      }
    });
  };

  const handleUnsubscribeAll = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await unsubscribeGlobally(
        token,
        contactId,
        organizationId
      );
      if (result.success) {
        setIsGloballyUnsubscribed(true);
        setMessage({
          type: "success",
          text: "You have been unsubscribed from all emails.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to unsubscribe",
        });
      }
    });
  };

  if (isGloballyUnsubscribed) {
    return (
      <div className="rounded-lg border bg-gray-50 p-6 text-center">
        <div className="mb-4 text-4xl">📭</div>
        <h2 className="mb-2 font-semibold text-lg">You're Unsubscribed</h2>
        <p className="text-gray-600">
          You have been unsubscribed from all email communications.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {topics.length > 0 ? (
        <div className="rounded-lg border">
          <div className="border-b bg-gray-50 px-4 py-3">
            <h2 className="font-semibold">Email Topics</h2>
            <p className="text-gray-600 text-sm">
              Choose which types of emails you'd like to receive
            </p>
          </div>
          <div className="divide-y">
            {topics.map((topic) => (
              <label
                className="flex cursor-pointer items-start gap-4 px-4 py-4 hover:bg-gray-50"
                key={topic.id}
              >
                <input
                  checked={subscriptions[topic.id] ?? false}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  onChange={(e) =>
                    handleTopicChange(topic.id, e.target.checked)
                  }
                  type="checkbox"
                />
                <div>
                  <div className="font-medium">{topic.name}</div>
                  {topic.description && (
                    <div className="text-gray-600 text-sm">
                      {topic.description}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-gray-50 p-6 text-center">
          <p className="text-gray-600">No email topics available.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {topics.length > 0 && (
          <button
            className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={isPending}
            onClick={handleSave}
            type="button"
          >
            {isPending ? "Saving..." : "Save Preferences"}
          </button>
        )}

        <button
          className="w-full rounded-lg border border-red-300 px-4 py-2 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          disabled={isPending}
          onClick={handleUnsubscribeAll}
          type="button"
        >
          Unsubscribe from All Emails
        </button>
      </div>

      <p className="text-center text-gray-500 text-xs">
        You can update your preferences at any time using the link in our
        emails.
      </p>
    </div>
  );
}
