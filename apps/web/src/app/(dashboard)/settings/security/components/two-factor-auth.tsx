"use client";

import { Check, Key, Shield } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useSession } from "@/lib/auth-client";

interface TwoFactorSetup {
  totpURI: string;
  backupCodes: string[];
}

export function TwoFactorAuth() {
  const { data: session } = useSession();
  const isEnabled = session?.user?.twoFactorEnabled;

  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordAction, setPasswordAction] = useState<"enable" | "disable">(
    "enable"
  );
  const [password, setPassword] = useState("");
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetup | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const promptForPassword = (action: "enable" | "disable") => {
    setPasswordAction(action);
    setShowPasswordPrompt(true);
  };

  const handlePasswordSubmit = async () => {
    if (!password) {
      toast.error("Password is required");
      return;
    }

    setShowPasswordPrompt(false);

    if (passwordAction === "enable") {
      await handleEnable2FA();
    } else {
      await handleDisable2FA();
    }

    setPassword("");
  };

  const handleEnable2FA = async () => {
    setIsLoading(true);
    try {
      const result = await authClient.twoFactor.enable({
        password,
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to enable 2FA");
        return;
      }

      // Get TOTP URI after enabling
      const uriResult = await authClient.twoFactor.getTotpUri({
        password,
      });

      if (uriResult.error) {
        toast.error(uriResult.error.message || "Failed to get TOTP URI");
        return;
      }

      setSetupData({
        totpURI: uriResult.data?.totpURI || "",
        backupCodes: result.data?.backupCodes || [],
      });
      setIsEnabling(true);
    } catch (error) {
      console.error("Failed to enable 2FA:", error);
      toast.error("Failed to enable two-factor authentication");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: verificationCode,
      });

      if (result.error) {
        toast.error(result.error.message || "Invalid verification code");
        return;
      }

      setBackupCodes(setupData?.backupCodes || []);
      setShowBackupCodes(true);
      setIsEnabling(false);
      setVerificationCode("");
      toast.success("Two-factor authentication enabled successfully");
    } catch (error) {
      console.error("Failed to verify 2FA:", error);
      toast.error("Failed to verify code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setIsLoading(true);
    try {
      const result = await authClient.twoFactor.disable({
        password,
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to disable 2FA");
        return;
      }

      setIsDisabling(false);
      setSetupData(null);
      setBackupCodes([]);
      toast.success("Two-factor authentication disabled");
    } catch (error) {
      console.error("Failed to disable 2FA:", error);
      toast.error("Failed to disable two-factor authentication");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateBackupCodes = async () => {
    setPasswordAction("enable"); // Use enable action to get password
    setShowPasswordPrompt(true);

    // After password is provided, generate codes
    if (!password) return;

    setIsLoading(true);
    try {
      const result = await authClient.twoFactor.generateBackupCodes({
        password,
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to generate backup codes");
        return;
      }

      setBackupCodes(result.data?.backupCodes || []);
      setShowBackupCodes(true);
      toast.success("New backup codes generated");
    } catch (error) {
      console.error("Failed to generate backup codes:", error);
      toast.error("Failed to generate backup codes");
    } finally {
      setIsLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success("Backup codes copied to clipboard");
  };

  const downloadBackupCodes = () => {
    const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wraps-2fa-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup codes downloaded");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Add an extra layer of security to your account with TOTP
                authentication using apps like Google Authenticator or Authy.
              </CardDescription>
            </div>
            {isEnabled ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-green-700">
                  <Check className="h-4 w-4" />
                  <span className="text-sm">Enabled</span>
                </div>
                <Button
                  className="cursor-pointer"
                  onClick={() => promptForPassword("disable")}
                  variant="outline"
                >
                  Disable
                </Button>
              </div>
            ) : (
              <Button
                className="cursor-pointer"
                loading={isLoading}
                onClick={() => promptForPassword("enable")}
              >
                Enable 2FA
              </Button>
            )}
          </div>
        </CardHeader>
        {isEnabled && (
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <Key className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <h4 className="font-medium">Backup Codes</h4>
                  <p className="text-muted-foreground text-sm">
                    You have {backupCodes.length} backup codes remaining. Store
                    them in a safe place in case you lose access to your
                    authenticator app.
                  </p>
                  <Button
                    className="h-auto cursor-pointer p-0 text-sm"
                    onClick={() => setShowBackupCodes(true)}
                    variant="link"
                  >
                    View backup codes
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Setup 2FA Dialog */}
      <Dialog onOpenChange={setIsEnabling} open={isEnabling}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app and enter the
              verification code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {setupData?.totpURI && (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-lg border bg-white p-3 sm:p-4">
                  <QRCodeSVG
                    className="h-auto w-full max-w-[200px]"
                    size={200}
                    value={setupData.totpURI}
                  />
                </div>
                <div className="w-full space-y-2">
                  <Label className="text-xs">
                    Or enter this code manually:
                  </Label>
                  {/* Mobile: Stacked */}
                  <div className="flex flex-col gap-2 sm:hidden">
                    <code className="break-all rounded-lg border bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                      {setupData.totpURI.split("secret=")[1]?.split("&")[0] ||
                        ""}
                    </code>
                    <Button
                      className="w-full cursor-pointer"
                      onClick={() => {
                        const secret =
                          setupData.totpURI
                            .split("secret=")[1]
                            ?.split("&")[0] || "";
                        navigator.clipboard.writeText(secret);
                        toast.success("Secret copied to clipboard");
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Copy Secret
                    </Button>
                  </div>
                  {/* Desktop: Button Group */}
                  <div className="hidden w-full rounded-lg border sm:flex">
                    <code className="flex flex-1 items-center break-all bg-muted px-3 py-2 font-mono text-sm leading-relaxed">
                      {setupData.totpURI.split("secret=")[1]?.split("&")[0] ||
                        ""}
                    </code>
                    <Button
                      className="shrink-0 cursor-pointer rounded-none border-0 border-l"
                      onClick={() => {
                        const secret =
                          setupData.totpURI
                            .split("secret=")[1]
                            ?.split("&")[0] || "";
                        navigator.clipboard.writeText(secret);
                        toast.success("Secret copied to clipboard");
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="verification-code">Verification Code</Label>
              <Input
                className="text-center font-mono text-lg tracking-widest"
                id="verification-code"
                maxLength={6}
                onChange={(e) =>
                  setVerificationCode(
                    e.target.value.replace(/\D/g, "").slice(0, 6)
                  )
                }
                placeholder="000000"
                value={verificationCode}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              className="w-full cursor-pointer sm:w-auto"
              onClick={() => {
                setIsEnabling(false);
                setSetupData(null);
                setVerificationCode("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="w-full cursor-pointer sm:w-auto"
              disabled={verificationCode.length !== 6}
              loading={isLoading}
              onClick={handleVerify2FA}
            >
              Verify & Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Prompt Dialog */}
      <Dialog onOpenChange={setShowPasswordPrompt} open={showPasswordPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Password</DialogTitle>
            <DialogDescription>
              Please enter your password to{" "}
              {passwordAction === "enable" ? "enable" : "disable"} two-factor
              authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                autoFocus
                id="password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handlePasswordSubmit();
                  }
                }}
                placeholder="Enter your password"
                type="password"
                value={password}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="cursor-pointer"
              onClick={() => {
                setShowPasswordPrompt(false);
                setPassword("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              disabled={!password}
              loading={isLoading}
              onClick={handlePasswordSubmit}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Confirmation */}
      <AlertDialog onOpenChange={setIsDisabling} open={isDisabling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disable Two-Factor Authentication
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disable two-factor authentication? This
              will make your account less secure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDisabling(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              loading={isLoading}
              onClick={() => promptForPassword("disable")}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Backup Codes Dialog */}
      <Dialog onOpenChange={setShowBackupCodes} open={showBackupCodes}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backup Codes</DialogTitle>
            <DialogDescription>
              Save these backup codes in a secure location. Each code can only
              be used once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/50 p-4">
              {backupCodes.map((code, index) => (
                <code className="font-mono text-sm" key={index}>
                  {code}
                </code>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 cursor-pointer"
                onClick={copyBackupCodes}
                variant="outline"
              >
                Copy Codes
              </Button>
              <Button
                className="flex-1 cursor-pointer"
                onClick={downloadBackupCodes}
                variant="outline"
              >
                Download
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="cursor-pointer"
              onClick={() => setShowBackupCodes(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
