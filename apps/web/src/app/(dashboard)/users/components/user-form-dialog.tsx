"use client";

import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

const userFormSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  role: z.string().min(1, {
    message: "Please select a role.",
  }),
  plan: z.string().min(1, {
    message: "Please select a plan.",
  }),
  billing: z.string().min(1, {
    message: "Please select a billing method.",
  }),
  status: z.string().min(1, {
    message: "Please select a status.",
  }),
});

type UserFormValues = z.infer<typeof userFormSchema>;

type UserFormDialogProps = {
  onAddUser: (user: UserFormValues) => void;
};

export function UserFormDialog({ onAddUser }: UserFormDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      role: "",
      plan: "",
      billing: "",
      status: "",
    } as UserFormValues,
    validators: {
      onChange: userFormSchema,
    },
    onSubmit: async ({ value }) => {
      onAddUser(value);
      form.reset();
      setOpen(false);
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Add New User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Create a new user account. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Name</Label>
                <Input
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter full name"
                  value={field.state.value}
                />
                {field.state.meta.errors ? (
                  <p className="text-destructive text-sm">
                    {field.state.meta.errors.join(", ")}
                  </p>
                ) : null}
              </div>
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter email address"
                  value={field.state.value}
                />
                {field.state.meta.errors ? (
                  <p className="text-destructive text-sm">
                    {field.state.meta.errors.join(", ")}
                  </p>
                ) : null}
              </div>
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-4">
            <form.Field name="role">
              {(field) => (
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  >
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Author">Author</SelectItem>
                      <SelectItem value="Editor">Editor</SelectItem>
                      <SelectItem value="Maintainer">Maintainer</SelectItem>
                      <SelectItem value="Subscriber">Subscriber</SelectItem>
                    </SelectContent>
                  </Select>
                  {field.state.meta.errors ? (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
            <form.Field name="plan">
              {(field) => (
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  >
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Basic">Basic</SelectItem>
                      <SelectItem value="Professional">Professional</SelectItem>
                      <SelectItem value="Enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                  {field.state.meta.errors ? (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <form.Field name="billing">
              {(field) => (
                <div className="space-y-2">
                  <Label>Billing</Label>
                  <Select
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  >
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue placeholder="Select billing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto Debit">Auto Debit</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Paypal">Paypal</SelectItem>
                    </SelectContent>
                  </Select>
                  {field.state.meta.errors ? (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
            <form.Field name="status">
              {(field) => (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  >
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Error">Error</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  {field.state.meta.errors ? (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
          </div>
          <DialogFooter>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  className="cursor-pointer"
                  disabled={!canSubmit}
                  type="submit"
                >
                  {isSubmitting ? "Saving..." : "Save User"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
