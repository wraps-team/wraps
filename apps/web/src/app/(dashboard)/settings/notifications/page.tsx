"use client";

import { useForm } from "@tanstack/react-form";
import { Bell, Mail, MessageSquare } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const notificationsFormSchema = z.object({
  emailSecurity: z.boolean(),
  emailUpdates: z.boolean(),
  emailMarketing: z.boolean(),
  pushMessages: z.boolean(),
  pushMentions: z.boolean(),
  pushTasks: z.boolean(),
  emailFrequency: z.string(),
  quietHoursStart: z.string(),
  quietHoursEnd: z.string(),
  channelEmail: z.boolean(),
  channelPush: z.boolean(),
  channelSms: z.boolean(),
  // New notification table fields
  orderUpdatesEmail: z.boolean(),
  orderUpdatesBrowser: z.boolean(),
  orderUpdatesApp: z.boolean(),
  invoiceRemindersEmail: z.boolean(),
  invoiceRemindersBrowser: z.boolean(),
  invoiceRemindersApp: z.boolean(),
  promotionalOffersEmail: z.boolean(),
  promotionalOffersBrowser: z.boolean(),
  promotionalOffersApp: z.boolean(),
  systemMaintenanceEmail: z.boolean(),
  systemMaintenanceBrowser: z.boolean(),
  systemMaintenanceApp: z.boolean(),
  notificationTiming: z.string(),
});

type NotificationsFormValues = z.infer<typeof notificationsFormSchema>;

export default function NotificationSettings() {
  const form = useForm({
    defaultValues: {
      emailSecurity: false,
      emailUpdates: true,
      emailMarketing: false,
      pushMessages: true,
      pushMentions: true,
      pushTasks: false,
      emailFrequency: "instant",
      quietHoursStart: "22:00",
      quietHoursEnd: "06:00",
      channelEmail: true,
      channelPush: true,
      channelSms: false,
      // New notification table defaults
      orderUpdatesEmail: true,
      orderUpdatesBrowser: true,
      orderUpdatesApp: true,
      invoiceRemindersEmail: true,
      invoiceRemindersBrowser: false,
      invoiceRemindersApp: true,
      promotionalOffersEmail: false,
      promotionalOffersBrowser: true,
      promotionalOffersApp: false,
      systemMaintenanceEmail: true,
      systemMaintenanceBrowser: true,
      systemMaintenanceApp: false,
      notificationTiming: "online",
    } as NotificationsFormValues,
    validators: {
      onChange: notificationsFormSchema,
    },
    onSubmit: async ({ value }) => {
      console.log("Notifications settings submitted:", value);
      // Here you would typically save the settings
    },
  });

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Notifications</h1>
        <p className="text-muted-foreground">
          Configure how you receive notifications.
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Choose what email notifications you want to receive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <form.Field name="emailSecurity">
                  {(field) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={field.state.value}
                        id={field.name}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor={field.name}>Security alerts</Label>
                        <p className="text-muted-foreground text-sm">
                          Get notified when there are security events on your
                          account.
                        </p>
                      </div>
                    </div>
                  )}
                </form.Field>
                <form.Field name="emailUpdates">
                  {(field) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={field.state.value}
                        id={field.name}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor={field.name}>Product updates</Label>
                        <p className="text-muted-foreground text-sm">
                          Receive updates about new features and improvements.
                        </p>
                      </div>
                    </div>
                  )}
                </form.Field>
                <form.Field name="emailMarketing">
                  {(field) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={field.state.value}
                        id={field.name}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor={field.name}>Marketing emails</Label>
                        <p className="text-muted-foreground text-sm">
                          Receive emails about our latest offers and promotions.
                        </p>
                      </div>
                    </div>
                  )}
                </form.Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Push Notifications</CardTitle>
              <CardDescription>
                Configure browser and mobile push notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <form.Field name="pushMessages">
                  {(field) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={field.state.value}
                        id={field.name}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor={field.name}>New messages</Label>
                        <p className="text-muted-foreground text-sm">
                          Get notified when you receive new messages.
                        </p>
                      </div>
                    </div>
                  )}
                </form.Field>
                <form.Field name="pushMentions">
                  {(field) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={field.state.value}
                        id={field.name}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor={field.name}>Mentions</Label>
                        <p className="text-muted-foreground text-sm">
                          Get notified when someone mentions you.
                        </p>
                      </div>
                    </div>
                  )}
                </form.Field>
                <form.Field name="pushTasks">
                  {(field) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={field.state.value}
                        id={field.name}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor={field.name}>Task updates</Label>
                        <p className="text-muted-foreground text-sm">
                          Get notified about task assignments and updates.
                        </p>
                      </div>
                    </div>
                  )}
                </form.Field>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Notification Frequency</CardTitle>
            <CardDescription>
              Control how often you receive notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <form.Field name="emailFrequency">
              {(field) => (
                <div className="space-y-2">
                  <Label>Email Frequency</Label>
                  <Select
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  >
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="hourly">Hourly digest</SelectItem>
                      <SelectItem value="daily">Daily digest</SelectItem>
                      <SelectItem value="weekly">Weekly digest</SelectItem>
                      <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
            <div className="space-y-2">
              <Label>Quiet Hours</Label>
              <div className="flex space-x-2">
                <form.Field name="quietHoursStart">
                  {(field) => (
                    <Select
                      onValueChange={field.handleChange}
                      value={field.state.value}
                    >
                      <SelectTrigger className="w-50 cursor-pointer">
                        <SelectValue placeholder="Start" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="22:00">10:00 PM</SelectItem>
                        <SelectItem value="23:00">11:00 PM</SelectItem>
                        <SelectItem value="00:00">12:00 AM</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </form.Field>
                <span className="self-center">to</span>
                <form.Field name="quietHoursEnd">
                  {(field) => (
                    <Select
                      onValueChange={field.handleChange}
                      value={field.state.value}
                    >
                      <SelectTrigger className="w-50 cursor-pointer">
                        <SelectValue placeholder="End" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="06:00">6:00 AM</SelectItem>
                        <SelectItem value="07:00">7:00 AM</SelectItem>
                        <SelectItem value="08:00">8:00 AM</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </form.Field>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>
              We need permission from your browser to show notifications.{" "}
              <Button className="h-auto p-0 text-primary" variant="link">
                Request Permission
              </Button>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">TYPE</TableHead>
                    <TableHead className="text-center">EMAIL</TableHead>
                    <TableHead className="text-center">BROWSER</TableHead>
                    <TableHead className="text-center">APP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Order updates</TableCell>
                    <TableCell className="text-center">
                      <form.Field name="orderUpdatesEmail">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="orderUpdatesBrowser">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="orderUpdatesApp">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      Invoice reminders
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="invoiceRemindersEmail">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="invoiceRemindersBrowser">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="invoiceRemindersApp">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      Promotional offers
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="promotionalOffersEmail">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="promotionalOffersBrowser">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="promotionalOffersApp">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      System maintenance
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="systemMaintenanceEmail">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="systemMaintenanceBrowser">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                    <TableCell className="text-center">
                      <form.Field name="systemMaintenanceApp">
                        {(field) => (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={field.state.value}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="space-y-4">
                <form.Field name="notificationTiming">
                  {(field) => (
                    <div className="space-y-2">
                      <Label>When should we send you notifications?</Label>
                      <Select
                        onValueChange={field.handleChange}
                        value={field.state.value}
                      >
                        <SelectTrigger className="w-full max-w-sm cursor-pointer">
                          <SelectValue placeholder="Select timing" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="online">
                            Only When I&apos;m online
                          </SelectItem>
                          <SelectItem value="always">Always</SelectItem>
                          <SelectItem value="never">Never</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </form.Field>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Channels</CardTitle>
            <CardDescription>
              Choose your preferred notification channels for different types of
              alerts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <form.Field name="channelEmail">
                {(field) => (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <Label
                          className="mb-1 font-medium"
                          htmlFor={field.name}
                        >
                          Email
                        </Label>
                        <div className="text-muted-foreground text-sm">
                          Receive notifications via email
                        </div>
                      </div>
                    </div>
                    <Checkbox
                      checked={field.state.value}
                      id={field.name}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked === true)
                      }
                    />
                  </div>
                )}
              </form.Field>
              <Separator />
              <form.Field name="channelPush">
                {(field) => (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Bell className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <Label
                          className="mb-1 font-medium"
                          htmlFor={field.name}
                        >
                          Push Notifications
                        </Label>
                        <div className="text-muted-foreground text-sm">
                          Receive browser push notifications
                        </div>
                      </div>
                    </div>
                    <Checkbox
                      checked={field.state.value}
                      id={field.name}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked === true)
                      }
                    />
                  </div>
                )}
              </form.Field>
              <Separator />
              <form.Field name="channelSms">
                {(field) => (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <Label
                          className="mb-1 font-medium"
                          htmlFor={field.name}
                        >
                          SMS
                        </Label>
                        <div className="text-muted-foreground text-sm">
                          Receive notifications via SMS
                        </div>
                      </div>
                    </div>
                    <Checkbox
                      checked={field.state.value}
                      id={field.name}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked === true)
                      }
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </CardContent>
        </Card>

        <div className="flex space-x-2">
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
