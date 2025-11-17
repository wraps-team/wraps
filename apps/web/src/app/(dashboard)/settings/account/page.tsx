"use client";

import { DeleteAccount } from "./components/delete-account";
import { PersonalInformation } from "./components/personal-information";

export default function AccountSettings() {
  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Account Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Personal Information */}
      <PersonalInformation />

      {/* Danger Zone */}
      <DeleteAccount />
    </div>
  );
}
