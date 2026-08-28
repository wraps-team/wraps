"use client";

import { useEffect } from "react";

type WebMCPTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type WebMCPContext = {
  name: string;
  description: string;
  tools: WebMCPTool[];
};

declare global {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface augmentation required for Navigator merging
  interface Navigator {
    modelContext?: {
      provideContext: (ctx: WebMCPContext) => () => void;
    };
  }
}

export function WebMCP() {
  useEffect(() => {
    if (!navigator.modelContext) return;

    const cleanup = navigator.modelContext.provideContext({
      name: "Wraps",
      description:
        "Deploy email (AWS SES), SMS, and CDN infrastructure to your AWS account with one command. Full ownership, AWS pricing, no credentials stored.",
      tools: [
        {
          name: "get_pricing",
          description:
            "Get Wraps pricing: plans, custom-event limits and overage rates, AWS SES pricing plans, worked cost examples, and the feature comparison (markdown)",
          inputSchema: { type: "object", properties: {} },
          execute: async () => {
            const res = await fetch("/pricing.md");
            return res.ok ? res.text() : { error: "unavailable" };
          },
        },
        {
          name: "estimate_cost",
          description:
            "Estimate the real monthly cost of running email on Wraps + AWS: Wraps platform fee, custom-event overage, and the itemized AWS bill (SES, EventBridge, SQS, Lambda, DynamoDB, dedicated IP, WAF). Use this instead of doing the arithmetic — the model has six interacting variables, including which SES pricing plan the AWS account is on.",
          inputSchema: {
            type: "object",
            properties: {
              emails: {
                type: "integer",
                description: "Emails sent per month",
              },
              events: {
                type: "integer",
                description:
                  "Custom events you emit via POST /v1/events per month. Emails sent and SES delivery events (deliveries, opens, clicks, bounces) are not counted and do not affect price.",
              },
              tier: {
                type: "string",
                enum: ["free", "starter", "growth", "scale"],
                description: "Wraps plan",
              },
              billing: {
                type: "string",
                enum: ["monthly", "annual"],
                description: "Wraps billing interval",
              },
              sesPlan: {
                type: "string",
                enum: ["alacarte", "essentials", "pro", "enterprise"],
                description:
                  "AWS SES pricing plan for that account and Region. New AWS accounts default to 'essentials' ($0.16/1K); 'alacarte' is $0.10/1K.",
              },
              dedicatedIp: {
                type: "boolean",
                description: "Include a dedicated sending IP",
              },
              retention: {
                type: "string",
                enum: ["7days", "30days", "90days", "1year", "indefinite"],
                description: "Email event history retention",
              },
            },
            required: ["emails"],
          },
          execute: async (input) => {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(input)) {
              if (value !== undefined && value !== null) {
                params.set(key, String(value));
              }
            }
            const res = await fetch(`/api/pricing/estimate?${params}`, {
              headers: { Accept: "application/json" },
            });
            return res.ok
              ? await res.json()
              : { error: "unavailable", status: res.status };
          },
        },
        {
          name: "get_quickstart",
          description:
            "Get the quickstart guide for deploying email infrastructure on AWS",
          inputSchema: {
            type: "object",
            properties: {
              service: {
                type: "string",
                enum: ["email", "sms", "cdn"],
                description: "Which service to get quickstart docs for",
              },
            },
          },
          execute: async (input) => {
            const service = (input.service as string) ?? "email";
            const res = await fetch("/llms.txt");
            return res.ok ? res.text() : { error: "unavailable", service };
          },
        },
        {
          name: "search_docs",
          description: "Get full Wraps documentation in markdown format",
          inputSchema: { type: "object", properties: {} },
          execute: async () => {
            const res = await fetch("/llms-full.txt");
            return res.ok ? res.text() : { error: "unavailable" };
          },
        },
      ],
    });

    return cleanup;
  }, []);

  return null;
}
