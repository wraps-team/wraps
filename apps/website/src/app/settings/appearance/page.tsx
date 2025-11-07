"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BaseLayout } from "@/components/layouts/base-layout";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues: {
      theme: "dark",
      fontFamily: "",
      fontSize: "",
      sidebarWidth: "",
      contentWidth: "",
    },
  });

  function onSubmit(data: AppearanceFormValues) {
    console.log("Form submitted:", data);
    // Here you would typically save the data
  }

  return (
    <BaseLayout>
      <div className="space-y-6 px-4 lg:px-6">
        <div>
          <h1 className="font-bold text-3xl">Appearance</h1>
          <p className="text-muted-foreground">
            Customize the appearance of the application.
          </p>
        </div>

        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Theme Section */}
            <h3 className="mb-2 font-medium text-lg">Theme</h3>
            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormControl>
                    <RadioGroup
                      className="flex gap-4"
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormItem>
                        <FormLabel className="cursor-pointer [&:has([data-state=checked])>div]:border-primary">
                          <FormControl>
                            <RadioGroupItem className="sr-only" value="light" />
                          </FormControl>
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
                        </FormLabel>
                      </FormItem>
                      <FormItem>
                        <FormLabel className="cursor-pointer [&:has([data-state=checked])>div]:border-primary">
                          <FormControl>
                            <RadioGroupItem className="sr-only" value="dark" />
                          </FormControl>
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
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fontFamily"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Font Family</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder="Select a font" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="inter">Inter</SelectItem>
                      <SelectItem value="roboto">Roboto</SelectItem>
                      <SelectItem value="system">System Default</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fontSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Font Size</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder="Select font size" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Layout Section */}
            <FormField
              control={form.control}
              name="sidebarWidth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sidebar Width</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder="Select sidebar width" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="spacious">Spacious</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contentWidth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content Width</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue placeholder="Select content width" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="fluid">Fluid</SelectItem>
                      <SelectItem value="container">Container</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mt-12 flex space-x-2">
              <Button className="cursor-pointer" type="submit">
                Save Preferences
              </Button>
              <Button
                className="cursor-pointer"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </BaseLayout>
  );
}
