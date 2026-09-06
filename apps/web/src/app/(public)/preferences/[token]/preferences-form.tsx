"use client";

import { useState, useTransition } from "react";
import { SMS_CONSENT_TEXT } from "@/lib/sms-consent";
import {
  resendConfirmation,
  unsubscribeGlobally,
  updatePreferences,
} from "./actions";

type Topic = {
  id: string;
  name: string;
  description: string | null;
  subscribed: boolean;
  pending: boolean;
  doubleOptIn: boolean;
};

type PreferencesFormProps = {
  token: string;
  contactId: string;
  organizationId: string;
  topics: Topic[];
  isGloballyUnsubscribed: boolean;
  hasMultipleChannels: boolean;
  preferredChannel: "email" | "sms" | null;
  orgName?: string;
  canManageSms: boolean;
  maskedPhone: string | null;
  smsOptedIn: boolean;
};

export function PreferencesForm({
  token,
  contactId,
  organizationId,
  topics,
  isGloballyUnsubscribed: initiallyUnsubscribed,
  hasMultipleChannels,
  preferredChannel: initialPreferredChannel,
  orgName,
  canManageSms,
  maskedPhone,
  smsOptedIn,
}: PreferencesFormProps) {
  const [isPending, startTransition] = useTransition();
  const [subscriptions, setSubscriptions] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const topic of topics) {
        // Include both subscribed and pending as "checked"
        initial[topic.id] = topic.subscribed || topic.pending;
      }
      return initial;
    }
  );
  const [pendingTopics, setPendingTopics] = useState<Set<string>>(
    () => new Set(topics.filter((t) => t.pending).map((t) => t.id))
  );
  const [selectedChannel, setSelectedChannel] = useState<
    "email" | "sms" | null
  >(initialPreferredChannel);
  const [smsOptIn, setSmsOptIn] = useState(smsOptedIn);
  const [resendingFor, setResendingFor] = useState<string | null>(null);
  const [isGloballyUnsubscribed, setIsGloballyUnsubscribed] = useState(
    initiallyUnsubscribed
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleTopicChange = (topicId: string, subscribed: boolean) => {
    setSubscriptions((prev) => ({ ...prev, [topicId]: subscribed }));
    // If unchecking, remove from pending set
    if (!subscribed) {
      setPendingTopics((prev) => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
    }
  };

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await updatePreferences(
        token,
        contactId,
        organizationId,
        subscriptions,
        hasMultipleChannels ? selectedChannel : undefined,
        canManageSms ? smsOptIn : undefined
      );
      if (result.success) {
        // Update pending topics state
        if (result.pendingTopics) {
          setPendingTopics((prev) => {
            const next = new Set(prev);
            for (const topicId of result.pendingTopics!) {
              next.add(topicId);
            }
            return next;
          });
          setMessage({
            type: "success",
            text: `Preferences saved. Check your email to confirm ${result.pendingTopics.length === 1 ? "your subscription" : "your subscriptions"}.`,
          });
        } else {
          setMessage({
            type: "success",
            text: "Your preferences have been saved.",
          });
        }
      } else {
        setMessage({
          type: "error",
          text: result.error || "Something went wrong. Please try again.",
        });
      }
    });
  };

  const handleResendConfirmation = (topicId: string) => {
    setResendingFor(topicId);
    setMessage(null);
    startTransition(async () => {
      const result = await resendConfirmation(
        token,
        contactId,
        organizationId,
        topicId
      );
      setResendingFor(null);
      if (result.success) {
        setMessage({
          type: "success",
          text: "Confirmation email sent. Please check your inbox.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to resend confirmation.",
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
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <svg
            className="h-8 w-8 text-muted-foreground"
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
        <h2 className="mb-2 font-semibold text-foreground text-lg">
          You're Unsubscribed
        </h2>
        <p className="text-muted-foreground text-sm">
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
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.type === "success" ? (
            <svg
              className="h-5 w-5 shrink-0 text-success"
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
              className="h-5 w-5 shrink-0 text-destructive"
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
          <h2 className="mb-3 font-medium text-foreground text-sm">
            Email Topics
          </h2>
          <div className="divide-y divide-border rounded-xl border border-border">
            {topics.map((topic) => {
              const isPendingConfirmation = pendingTopics.has(topic.id);
              const isResending = resendingFor === topic.id;

              return (
                <div className="p-4" key={topic.id}>
                  <label className="flex cursor-pointer items-start gap-4 transition-colors hover:bg-muted/50">
                    <div className="relative flex h-5 items-center">
                      <input
                        checked={subscriptions[topic.id] ?? false}
                        className={`peer h-4 w-4 cursor-pointer appearance-none rounded border-2 border-input transition-all checked:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                          subscriptions[topic.id]
                            ? isPendingConfirmation
                              ? "bg-warning"
                              : "bg-primary"
                            : ""
                        }`}
                        onChange={(e) =>
                          handleTopicChange(topic.id, e.target.checked)
                        }
                        type="checkbox"
                      />
                      {subscriptions[topic.id] && (
                        <svg
                          className={`pointer-events-none absolute left-0 h-4 w-4 ${
                            isPendingConfirmation
                              ? "text-warning-foreground"
                              : "text-primary-foreground"
                          }`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          viewBox="0 0 24 24"
                        >
                          {isPendingConfirmation ? (
                            <path
                              d="M12 8v4m0 4h.01"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ) : (
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">
                          {topic.name}
                        </span>
                        {isPendingConfirmation && (
                          <span className="rounded-full bg-warning/20 px-2 py-0.5 font-medium text-foreground text-xs">
                            Pending confirmation
                          </span>
                        )}
                      </div>
                      {topic.description && (
                        <div className="mt-0.5 text-muted-foreground text-sm">
                          {topic.description}
                        </div>
                      )}
                    </div>
                  </label>

                  {/* Resend confirmation button for pending subscriptions */}
                  {isPendingConfirmation && (
                    <div className="mt-2 ml-9">
                      <button
                        className="rounded-md px-3 py-1.5 font-medium text-warning text-xs transition-colors hover:bg-warning/10 disabled:opacity-50"
                        disabled={isPending || isResending}
                        onClick={() => handleResendConfirmation(topic.id)}
                        type="button"
                      >
                        {isResending
                          ? "Sending..."
                          : "Resend confirmation email"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-muted-foreground text-sm">
            No email topics available.
          </p>
        </div>
      )}

      {/* Text messages */}
      {canManageSms && (
        <div className="space-y-1">
          <h2 className="mb-3 font-medium text-foreground text-sm">
            Text Messages
          </h2>
          <div className="divide-y divide-border rounded-xl border border-border">
            <div className="p-4">
              <label className="flex cursor-pointer items-start gap-4 transition-colors hover:bg-muted/50">
                <div className="relative flex h-5 items-center">
                  <input
                    checked={smsOptIn}
                    className={`peer h-4 w-4 cursor-pointer appearance-none rounded border-2 border-input transition-all checked:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      smsOptIn ? "bg-primary" : ""
                    }`}
                    onChange={(e) => {
                      setSmsOptIn(e.target.checked);
                      if (!e.target.checked && selectedChannel === "sms") {
                        setSelectedChannel(null);
                      }
                    }}
                    type="checkbox"
                  />
                  {smsOptIn && (
                    <svg
                      className="pointer-events-none absolute left-0 h-4 w-4 text-primary-foreground"
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
                  <span className="font-medium text-foreground text-sm">
                    {SMS_CONSENT_TEXT}
                  </span>
                  {maskedPhone && (
                    <div className="mt-0.5 text-muted-foreground text-sm">
                      Sent to {maskedPhone}
                      {orgName ? ` by ${orgName}` : ""}.
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Channel preference */}
      {hasMultipleChannels && (
        <div className="space-y-1">
          <h2 className="mb-3 font-medium text-foreground text-sm">
            Preferred Channel
          </h2>
          <p className="mb-3 text-muted-foreground text-xs">
            Choose how you'd prefer to be contacted.
          </p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {(
              [
                { value: null, label: "No preference" },
                { value: "email", label: "Email" },
                // Offering SMS to someone who has not consented advertises a
                // channel no send can use: every SMS audience filters on
                // `opted_in`.
                ...(smsOptIn
                  ? ([{ value: "sms", label: "SMS" }] as const)
                  : []),
              ] as const
            ).map((option) => (
              <label
                className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-muted/50"
                key={option.label}
              >
                <div className="relative flex h-5 items-center">
                  <input
                    checked={selectedChannel === option.value}
                    className={`h-4 w-4 cursor-pointer appearance-none rounded-full border-2 border-input transition-all checked:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      selectedChannel === option.value ? "bg-primary" : ""
                    }`}
                    name="preferredChannel"
                    onChange={() => setSelectedChannel(option.value)}
                    type="radio"
                  />
                  {selectedChannel === option.value && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    </div>
                  )}
                </div>
                <span className="font-medium text-foreground text-sm">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-2">
        {(topics.length > 0 || canManageSms) && (
          <button
            className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
            disabled={isPending}
            onClick={handleSave}
            type="button"
          >
            {isPending ? "Saving..." : "Save Preferences"}
          </button>
        )}

        <button
          className="w-full rounded-xl border border-border bg-card px-4 py-3 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
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
