"use client";

import { useForm } from "@tanstack/react-form";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const userFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  website: z.string().optional(),
  location: z.string().optional(),
  role: z.string().optional(),
  bio: z.string().optional(),
  company: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

export default function UserSettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [useDefaultIcon, setUseDefaultIcon] = useState(true);

  const form = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      website: "",
      location: "",
      role: "",
      bio: "",
      company: "",
      timezone: "",
      language: "",
    } as UserFormValues,
    validators: {
      onChange: userFormSchema,
    },
    onSubmit: async ({ value }) => {
      console.log("Form submitted:", value);
      // Here you would typically save the data
    },
  });

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfileImage(e.target?.result as string);
        setUseDefaultIcon(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReset = () => {
    setProfileImage(null);
    setUseDefaultIcon(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    form.reset();
  };

  return (
    <div className="px-4 lg:px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
            <CardDescription>
              Update your personal information and preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Profile Picture Section */}
            <div className="flex items-center gap-6">
              {useDefaultIcon ? (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg">
                  <Logo size={56} />
                </div>
              ) : (
                <Avatar className="h-20 w-20 rounded-lg">
                  <AvatarImage src={profileImage || undefined} />
                  <AvatarFallback>SS</AvatarFallback>
                </Avatar>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    className="cursor-pointer"
                    onClick={handleFileUpload}
                    size="sm"
                    type="button"
                    variant="default"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload new photo
                  </Button>
                  <Button
                    className="cursor-pointer"
                    onClick={handleReset}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Reset
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Allowed JPG, GIF or PNG. Max size of 800K
                </p>
              </div>
              <input
                accept="image/jpeg,image/gif,image/png"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            </div>

            <Separator className="mb-10" />
            {/* Form Fields */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* First Name */}
              <form.Field name="firstName">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>First Name</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your first name"
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

              {/* Last Name */}
              <form.Field name="lastName">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Last Name</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your last name"
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

              {/* Email */}
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>E-mail</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your email"
                      type="email"
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

              {/* Company */}
              <form.Field name="company">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Company</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your company"
                      value={field.state.value || ""}
                    />
                  </div>
                )}
              </form.Field>

              {/* Phone Number */}
              <form.Field name="phone">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Phone Number</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your phone number"
                      type="tel"
                      value={field.state.value || ""}
                    />
                  </div>
                )}
              </form.Field>

              {/* Location */}
              <form.Field name="location">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Location</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your location"
                      value={field.state.value || ""}
                    />
                  </div>
                )}
              </form.Field>

              {/* Website */}
              <form.Field name="website">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Website</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your website"
                      type="url"
                      value={field.state.value || ""}
                    />
                  </div>
                )}
              </form.Field>

              {/* Language */}
              <form.Field name="language">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Language</Label>
                    <Select
                      onValueChange={field.handleChange}
                      value={field.state.value || ""}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="spanish">Spanish</SelectItem>
                        <SelectItem value="french">French</SelectItem>
                        <SelectItem value="german">German</SelectItem>
                        <SelectItem value="italian">Italian</SelectItem>
                        <SelectItem value="portuguese">Portuguese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              {/* Role */}
              <form.Field name="role">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Role</Label>
                    <Input
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter your role"
                      value={field.state.value || ""}
                    />
                  </div>
                )}
              </form.Field>

              {/* Timezone */}
              <form.Field name="timezone">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Timezone</Label>
                    <Select
                      onValueChange={field.handleChange}
                      value={field.state.value || ""}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pst">
                          PST (Pacific Standard Time)
                        </SelectItem>
                        <SelectItem value="est">
                          EST (Eastern Standard Time)
                        </SelectItem>
                        <SelectItem value="cst">
                          CST (Central Standard Time)
                        </SelectItem>
                        <SelectItem value="mst">
                          MST (Mountain Standard Time)
                        </SelectItem>
                        <SelectItem value="utc">
                          UTC (Coordinated Universal Time)
                        </SelectItem>
                        <SelectItem value="cet">
                          CET (Central European Time)
                        </SelectItem>
                        <SelectItem value="jst">
                          JST (Japan Standard Time)
                        </SelectItem>
                        <SelectItem value="aest">
                          AEST (Australian Eastern Standard Time)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            </div>

            {/* Bio - Full Width */}
            <form.Field name="bio">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Bio</Label>
                  <Textarea
                    className="min-h-[100px]"
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Tell us a little about yourself..."
                    value={field.state.value || ""}
                  />
                </div>
              )}
            </form.Field>

            {/* Action Buttons */}
            <div className="flex justify-start gap-3">
              <form.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
              >
                {([canSubmit, isSubmitting]) => (
                  <Button
                    className="cursor-pointer"
                    disabled={!canSubmit}
                    type="submit"
                  >
                    {isSubmitting ? "Saving..." : "Save Changes"}
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
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
