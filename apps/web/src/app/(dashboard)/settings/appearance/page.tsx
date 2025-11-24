"use client";

import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const appearanceFormSchema = z.object({
  theme: z.enum(["light", "dark"]),
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  sidebarWidth: z.string().optional(),
  contentWidth: z.string().optional(),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

export default function AppearanceSettings() {
  const form = useForm({
    defaultValues: {
      theme: "dark",
      fontFamily: "",
      fontSize: "",
      sidebarWidth: "",
      contentWidth: "",
    } as AppearanceFormValues,
    validators: {
      onChange: appearanceFormSchema,
    },
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value);
      // Here you would typically save the data
    },
  });

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Appearance</h1>
        <p className="text-muted-foreground">
          Customize the appearance of the application.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* Theme Section */}
        <h3 className="mb-2 font-medium text-lg">Theme</h3>
        <form.Field name="theme">
          {(field) => (
            <div className="space-y-3">
              <RadioGroup
                className="flex gap-4"
                onValueChange={(value) =>
                  field.handleChange(value as "light" | "dark")
                }
                value={field.state.value}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    className="sr-only"
                    id="light"
                    value="light"
                  />
                  <Label
                    className="cursor-pointer [&:has([data-state=checked])>div]:border-primary"
                    htmlFor="light"
                  >
                    <div className="rounded-md border-2 border-muted p-4 transition-colors hover:border-accent">
                      <div className="space-y-2">
                        <div className="h-20 w-20 rounded-md border bg-white p-3">
                          <div className="space-y-2">
                            <div className="h-2 w-3/4 rounded bg-gray-200" />
                            <div className="h-2 w-1/2 rounded bg-gray-200" />
                            <div className="flex space-x-2">
                              <div className="h-2 w-2 rounded-full bg-gray-300" />
                              <div className="h-2 flex-1 rounded bg-gray-200" />
                            </div>
                            <div className="flex space-x-2">
                              <div className="h-2 w-2 rounded-full bg-gray-300" />
                              <div className="h-2 flex-1 rounded bg-gray-200" />
                            </div>
                          </div>
                        </div>
                        <span className="font-medium text-sm">Light</span>
                      </div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem className="sr-only" id="dark" value="dark" />
                  <Label
                    className="cursor-pointer [&:has([data-state=checked])>div]:border-primary"
                    htmlFor="dark"
                  >
                    <div className="rounded-md border-2 border-muted p-4 transition-colors hover:border-accent">
                      <div className="space-y-2">
                        <div className="h-20 w-20 rounded-md border border-gray-700 bg-gray-900 p-3">
                          <div className="space-y-2">
                            <div className="h-2 w-3/4 rounded bg-gray-600" />
                            <div className="h-2 w-1/2 rounded bg-gray-600" />
                            <div className="flex space-x-2">
                              <div className="h-2 w-2 rounded-full bg-gray-500" />
                              <div className="h-2 flex-1 rounded bg-gray-600" />
                            </div>
                            <div className="flex space-x-2">
                              <div className="h-2 w-2 rounded-full bg-gray-500" />
                              <div className="h-2 flex-1 rounded bg-gray-600" />
                            </div>
                          </div>
                        </div>
                        <span className="font-medium text-sm">Dark</span>
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </form.Field>

        <form.Field name="fontFamily">
          {(field) => (
            <div className="space-y-2">
              <Label>Font Family</Label>
              <Select
                onValueChange={field.handleChange}
                value={field.state.value || ""}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select a font" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inter">Inter</SelectItem>
                  <SelectItem value="roboto">Roboto</SelectItem>
                  <SelectItem value="system">System Default</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
        <form.Field name="fontSize">
          {(field) => (
            <div className="space-y-2">
              <Label>Font Size</Label>
              <Select
                onValueChange={field.handleChange}
                value={field.state.value || ""}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select font size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        {/* Layout Section */}
        <form.Field name="sidebarWidth">
          {(field) => (
            <div className="space-y-2">
              <Label>Sidebar Width</Label>
              <Select
                onValueChange={field.handleChange}
                value={field.state.value || ""}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select sidebar width" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
        <form.Field name="contentWidth">
          {(field) => (
            <div className="space-y-2">
              <Label>Content Width</Label>
              <Select
                onValueChange={field.handleChange}
                value={field.state.value || ""}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select content width" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="fluid">Fluid</SelectItem>
                  <SelectItem value="container">Container</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <div className="mt-12 flex space-x-2">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                className="cursor-pointer"
                disabled={!canSubmit}
                type="submit"
              >
                {isSubmitting ? "Saving..." : "Save Preferences"}
              </Button>
            )}
          </form.Subscribe>
          <Button
            className="cursor-pointer"
            onClick={() => form.reset()}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
