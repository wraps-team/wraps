"use client";

import { ActiveSessions } from "./components/active-sessions";
import { ChangePassword } from "./components/change-password";
import { PasskeyManagement } from "./components/passkey-management";
import { TwoFactorAuth } from "./components/two-factor-auth";

export default function SecuritySettings() {
  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Security Settings</h1>
        <p className="text-muted-foreground">
          Manage your account security with passkeys, two-factor authentication,
          and active sessions.
        </p>
      </div>

      {/* Change Password */}
      <ChangePassword />

      {/* Passkey Management */}
      <PasskeyManagement />

      {/* Two-Factor Authentication */}
      <TwoFactorAuth />

      {/* Active Sessions */}
      <ActiveSessions />
    </div>
  );
}
