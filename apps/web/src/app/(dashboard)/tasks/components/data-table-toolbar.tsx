"use client";

import type { Table } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { priorities, statuses } from "../data/data";
import type { Task } from "../data/schema";
import { AddTaskModal } from "./add-task-modal";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { DataTableViewOptions } from "./data-table-view-options";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  onAddTask?: (task: Task) => void;
}

export function DataTableToolbar<TData>({
  table,
  onAddTask,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <Input
          className="h-8 w-[150px] cursor-text lg:w-[250px]"
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          placeholder="Filter tasks..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
        />
        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            options={statuses}
            title="Status"
          />
        )}
        {table.getColumn("priority") && (
          <DataTableFacetedFilter
            column={table.getColumn("priority")}
            options={priorities}
            title="Priority"
          />
        )}
        {isFiltered && (
          <Button
            className="h-8 cursor-pointer px-2 lg:px-3"
            onClick={() => table.resetColumnFilters()}
            variant="ghost"
          >
            Reset
            <X />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
      <AddTaskModal onAddTask={onAddTask} />
    </div>
  );
}
