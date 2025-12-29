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
  brandColor: string;
  orgName?: string;
}

export function PreferencesForm({
  token,
  contactId,
  organizationId,
  topics,
  isGloballyUnsubscribed: initiallyUnsubscribed,
  brandColor,
  orgName,
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
          text: "Your preferences have been saved.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Something went wrong. Please try again.",
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
          text: "You've been unsubscribed from all emails.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Something went wrong. Please try again.",
        });
      }
    });
  };

  if (isGloballyUnsubscribed) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-8 w-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </svg>
        </div>
        <h2 className="mb-2 font-semibold text-gray-900 text-lg">
          You're Unsubscribed
        </h2>
        <p className="text-gray-500 text-sm">
          You won't receive any more emails
          {orgName ? ` from ${orgName}` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status message */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl p-4 ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.type === "success" ? (
            <svg
              className="h-5 w-5 shrink-0 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5 shrink-0 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Topics list */}
      {topics.length > 0 ? (
        <div className="space-y-1">
          <h2 className="mb-3 font-medium text-gray-900 text-sm">
            Email Topics
          </h2>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {topics.map((topic) => (
              <label
                className="flex cursor-pointer items-start gap-4 p-4 transition-colors hover:bg-gray-50"
                key={topic.id}
              >
                <div className="relative flex h-5 items-center">
                  <input
                    checked={subscriptions[topic.id] ?? false}
                    className="peer h-4 w-4 cursor-pointer appearance-none rounded border-2 border-gray-300 transition-all checked:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2"
                    onChange={(e) =>
                      handleTopicChange(topic.id, e.target.checked)
                    }
                    style={{
                      backgroundColor: subscriptions[topic.id]
                        ? brandColor
                        : undefined,
                    }}
                    type="checkbox"
                  />
                  {subscriptions[topic.id] && (
                    <svg
                      className="pointer-events-none absolute left-0 h-4 w-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M5 13l4 4L19 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">
                    {topic.name}
                  </div>
                  {topic.description && (
                    <div className="mt-0.5 text-gray-500 text-sm">
                      {topic.description}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-gray-500 text-sm">No email topics available.</p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-2">
        {topics.length > 0 && (
          <button
            className="w-full rounded-xl px-4 py-3 font-medium text-sm text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
            disabled={isPending}
            onClick={handleSave}
            style={{ backgroundColor: brandColor }}
            type="button"
          >
            {isPending ? "Saving..." : "Save Preferences"}
          </button>
        )}

        <button
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-gray-600 text-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 disabled:opacity-50"
          disabled={isPending}
          onClick={handleUnsubscribeAll}
          type="button"
        >
          Unsubscribe from All
        </button>
      </div>
    </div>
  );
}
