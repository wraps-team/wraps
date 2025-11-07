"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import { BaseLayout } from "@/components/layouts/base-layout";
import { columns } from "./components/columns";
import { DataTable } from "./components/data-table";
import { type Task, taskSchema } from "./data/schema";
import tasksData from "./data/tasks.json";

// Use static import for tasks data (works in both Vite and Next.js)
async function getTasks() {
  return z.array(taskSchema).parse(tasksData);
}

export default function TaskPage() {
  const [tasks, setTasks] = useState<z.infer<typeof taskSchema>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        const taskList = await getTasks();
        setTasks(taskList);
      } catch (error) {
        console.error("Failed to load tasks:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, []);

  const handleAddTask = (newTask: Task) => {
    setTasks((prev) => [newTask, ...prev]);
  };

  if (loading) {
    return (
      <BaseLayout
        description="A task and issue tracker built using Tanstack Table."
        title="Tasks"
      >
        <div className="flex h-96 items-center justify-center">
          <div className="text-muted-foreground">Loading tasks...</div>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout
      description="A task and issue tracker built using Tanstack Table."
      title="Tasks"
    >
      {/* Mobile view placeholder - shows message instead of images */}
      <div className="md:hidden">
        <div className="flex h-96 items-center justify-center rounded-lg border bg-muted/20">
          <div className="p-8 text-center">
            <h3 className="mb-2 font-semibold text-lg">Tasks Dashboard</h3>
            <p className="text-muted-foreground">
              Please use a larger screen to view the full tasks interface.
            </p>
          </div>
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden h-full flex-1 flex-col px-4 md:flex md:px-6">
        <DataTable columns={columns} data={tasks} onAddTask={handleAddTask} />
      </div>
    </BaseLayout>
  );
}
