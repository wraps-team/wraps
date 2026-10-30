"use client";

import type { CascadeChannelConfig } from "@wraps/db";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import {
  ArrowDown,
  ArrowUp,
  Layers,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTemplates } from "@/hooks/use-template-queries";
import { amountUnitToSeconds, parseDurationToAmountUnit } from "@/lib/utils";
import { useWorkflowStore } from "../use-workflow-store";

export type CascadeConfigProps = {
  nodeId: string;
  channels: CascadeChannelConfig[];
  orgSlug: string;
};

export function CascadeConfig({
  nodeId,
  channels,
  orgSlug,
}: CascadeConfigProps) {
  const updateCascadeChannels = useWorkflowStore(
    (state) => state.updateCascadeChannels
  );

  const { data: templatesData } = useTemplates(orgSlug);
  const templates = templatesData ?? [];
  const emailTemplates = templates.filter((t) => t.channel !== "sms");

  const handleCreateNewTemplate = () => {
    window.open(`/${orgSlug}/emails/templates/new`, "_blank");
  };

  const handleEditTemplate = (templateId: string) => {
    window.open(`/${orgSlug}/emails/templates/${templateId}`, "_blank");
  };

  const updateChannel = (
    index: number,
    updates: Partial<CascadeChannelConfig>
  ) => {
    const newChannels = [...channels];
    newChannels[index] = { ...newChannels[index], ...updates };
    updateCascadeChannels(nodeId, newChannels);
  };

  const addChannel = () => {
    updateCascadeChannels(nodeId, [
      ...channels,
      { id: crypto.randomUUID(), type: "sms", body: "" },
    ]);
  };

  const removeChannel = (index: number) => {
    if (channels.length <= 1) {
      return;
    }
    updateCascadeChannels(
      nodeId,
      channels.filter((_, i) => i !== index)
    );
  };

  const moveChannel = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= channels.length) {
      return;
    }
    const newChannels = [...channels];
    [newChannels[index], newChannels[newIndex]] = [
      newChannels[newIndex],
      newChannels[index],
    ];
    updateCascadeChannels(nodeId, newChannels);
  };

  const getWaitValues = (seconds: number) =>
    parseDurationToAmountUnit(seconds, { amount: 1, unit: "hours" });

  return (
    <>
      <div className="space-y-2 rounded-md bg-muted p-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <p className="font-medium text-xs">Cascade Sequence</p>
        </div>
        <p className="text-muted-foreground text-xs">
          Try each channel in order. If engagement is detected, exit early.
          Otherwise, fall through to the next channel.
        </p>
      </div>

      {/* Channel list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Channels ({channels.length})</Label>
          <button
            className="flex items-center gap-1 text-primary text-xs hover:underline"
            onClick={addChannel}
            type="button"
          >
            <Plus className="h-3 w-3" />
            Add channel
          </button>
        </div>

        {channels.map((channel, index) => {
          const isLast = index === channels.length - 1;
          const selectedTemplate = emailTemplates.find(
            (t) => t.id === channel.templateId
          );

          return (
            <div
              className="space-y-2 rounded-md border p-3"
              key={channel.id || index}
            >
              {/* Channel header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {channel.type === "email" ? (
                    <Mail className="h-3.5 w-3.5 text-info" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 text-success" />
                  )}
                  <span className="font-medium text-xs">
                    Channel {index + 1}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {index > 0 && (
                    <Button
                      aria-label="Move up"
                      className="h-6 w-6"
                      onClick={() => moveChannel(index, "up")}
                      size="icon"
                      variant="ghost"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                  )}
                  {!isLast && (
                    <Button
                      aria-label="Move down"
                      className="h-6 w-6"
                      onClick={() => moveChannel(index, "down")}
                      size="icon"
                      variant="ghost"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  )}
                  {channels.length > 1 && (
                    <Button
                      aria-label="Remove channel"
                      className="h-6 w-6"
                      onClick={() => removeChannel(index)}
                      size="icon"
                      variant="ghost-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Channel type */}
              <Select
                onValueChange={(value) =>
                  updateChannel(index, {
                    type: value as "email" | "sms",
                    templateId: value === "email" ? "" : undefined,
                    body: value === "sms" ? "" : undefined,
                    engagement: value === "email" ? "opened" : undefined,
                    waitDuration:
                      value === "email" && !isLast ? 259_200 : undefined,
                  })
                }
                value={channel.type}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>

              {/* Email-specific config */}
              {channel.type === "email" && (
                <>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Template</Label>
                      <button
                        className="flex items-center gap-1 text-primary text-xs hover:underline"
                        onClick={handleCreateNewTemplate}
                        type="button"
                      >
                        <Plus className="h-3 w-3" />
                        New
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Select
                        onValueChange={(value) =>
                          updateChannel(index, { templateId: value })
                        }
                        value={channel.templateId || ""}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                          {emailTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {channel.templateId && (
                        <Button
                          aria-label="Edit template"
                          className="h-9 w-9"
                          onClick={() =>
                            handleEditTemplate(channel.templateId!)
                          }
                          size="icon"
                          title="Edit template"
                          variant="outline"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {selectedTemplate && (
                      <p className="text-muted-foreground text-xs">
                        Subject: {selectedTemplate.subject || "(no subject)"}
                      </p>
                    )}
                  </div>

                  {/* Engagement type */}
                  <div className="space-y-1">
                    <Label className="text-xs">Wait for</Label>
                    <Select
                      onValueChange={(value) =>
                        updateChannel(index, {
                          engagement: value as "opened" | "clicked",
                        })
                      }
                      value={channel.engagement || "opened"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opened">Opened</SelectItem>
                        <SelectItem value="clicked">Clicked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* SMS-specific config */}
              {channel.type === "sms" && (
                <div className="space-y-1">
                  <Label className="text-xs">Message</Label>
                  <Textarea
                    onChange={(e) =>
                      updateChannel(index, { body: e.target.value })
                    }
                    placeholder="Enter SMS message..."
                    rows={3}
                    value={channel.body || ""}
                  />
                  <p className="text-muted-foreground text-xs">
                    {(channel.body || "").length} / 160 characters
                  </p>
                </div>
              )}

              {/* SMS in non-last position */}
              {!isLast && channel.type === "sms" && (
                <p className="text-muted-foreground text-xs italic">
                  SMS channels send immediately then fall through to the next
                  channel (no engagement wait).
                </p>
              )}

              {/* Wait duration (email channels except last) */}
              {!isLast && channel.type === "email" && (
                <div className="space-y-1">
                  <Label className="text-xs">Wait Duration</Label>
                  {(() => {
                    const { amount, unit } = getWaitValues(
                      channel.waitDuration || 259_200
                    );
                    return (
                      <div className="flex gap-2">
                        <Input
                          className="w-20"
                          min={1}
                          onChange={(e) =>
                            updateChannel(index, {
                              waitDuration: amountUnitToSeconds(
                                Number.parseInt(e.target.value, 10) || 1,
                                unit
                              ),
                            })
                          }
                          type="number"
                          value={amount}
                        />
                        <Select
                          onValueChange={(value) =>
                            updateChannel(index, {
                              waitDuration: amountUnitToSeconds(amount, value),
                            })
                          }
                          value={unit}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                  <p className="text-muted-foreground text-xs">
                    Wait for engagement before trying next channel.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Output paths info */}
      <div className="space-y-1 rounded-md bg-muted p-3">
        <p className="font-medium text-xs">Output Paths:</p>
        <ul className="space-y-0.5 text-muted-foreground text-xs">
          <li>
            <span className="font-medium text-success">Engaged</span> — Contact
            engaged with a channel
          </li>
          <li>
            <span className="font-medium text-muted-foreground">Exhausted</span>{" "}
            — All channels tried without engagement
          </li>
        </ul>
      </div>
    </>
  );
}
