"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { labels, priorities, statuses } from "../data/data";
import type { Task } from "../data/schema";

// Extended task schema for the form
const taskFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.string(),
  label: z.string(),
  priority: z.string(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

type AddTaskModalProps = {
  onAddTask?: (task: Task) => void;
  trigger?: React.ReactNode;
};

export function AddTaskModal({ onAddTask, trigger }: AddTaskModalProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>({
    id: "",
    title: "",
    description: "",
    status: "todo",
    label: "feature",
    priority: "medium",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Generate unique task ID
  const generateTaskId = () => {
    const prefix = "TASK";
    const number = Math.floor(Math.random() * 9999) + 1000;
    return `${prefix}-${number}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate form data
      const validatedData = taskFormSchema.parse({
        ...formData,
        id: generateTaskId(),
      });

      // Create the task
      const newTask: Task = {
        id: validatedData.id,
        title: validatedData.title,
        status: validatedData.status,
        label: validatedData.label,
        priority: validatedData.priority,
      };

      onAddTask?.(newTask);

      // Reset form and close modal
      setFormData({
        id: "",
        title: "",
        description: "",
        status: "todo",
        label: "feature",
        priority: "medium",
      });
      setErrors({});
      setOpen(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.issues.forEach((issue) => {
          if (issue.path[0]) {
            newErrors[issue.path[0] as string] = issue.message;
          }
        });
        setErrors(newErrors);
      }
    }
  };

  const handleCancel = () => {
    setFormData({
      id: "",
      title: "",
      description: "",
      status: "todo",
      label: "feature",
      priority: "medium",
    });
    setErrors({});
    setOpen(false);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="cursor-pointer" size="sm" variant="default">
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add New Task</DialogTitle>
          <DialogDescription>
            Create a new task to track work and progress. Fill in the details
            below.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Task Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              className={errors.title ? "border-red-500" : ""}
              id="title"
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Enter task title..."
              value={formData.title}
            />
            {errors.title && (
              <p className="text-red-500 text-sm">{errors.title}</p>
            )}
          </div>

          {/* Task Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Provide additional details about the task..."
              rows={3}
              value={formData.description}
            />
          </div>

          {/* Task Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, status: value }))
              }
              value={formData.status}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    <div className="flex items-center">
                      {status.icon && (
                        <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      )}
                      {status.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Select
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, label: value }))
              }
              value={formData.label}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select label" />
              </SelectTrigger>
              <SelectContent>
                {labels.map((label) => (
                  <SelectItem key={label.value} value={label.value}>
                    <Badge className="cursor-pointer" variant="outline">
                      {label.label}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, priority: value }))
              }
              value={formData.priority}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((priority) => (
                  <SelectItem key={priority.value} value={priority.value}>
                    <div className="flex items-center">
                      {priority.icon && (
                        <priority.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      )}
                      {priority.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              className="cursor-pointer"
              onClick={handleCancel}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button className="cursor-pointer" type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Create Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
