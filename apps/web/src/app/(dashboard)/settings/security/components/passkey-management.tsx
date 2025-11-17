"use client";

import {
  Edit2,
  Fingerprint,
  Laptop,
  Loader2,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
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
import { authClient } from "@/lib/auth-client";

export function PasskeyManagement() {
  // Use Better Auth's built-in hook for passkeys
  const { data: passkeys, isPending } = authClient.useListPasskeys();
  const [isAddingPasskey, setIsAddingPasskey] = useState(false);
  const [isEditingPasskey, setIsEditingPasskey] = useState(false);
  const [isDeletingPasskey, setIsDeletingPasskey] = useState(false);
  const [selectedPasskey, setSelectedPasskey] = useState<
    NonNullable<typeof passkeys>[number] | null
  >(null);
  const [passkeyName, setPasskeyName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAddPasskey = async () => {
    if (!passkeyName) {
      toast.error("Passkey name is required");
      return;
    }
    setIsLoading(true);
    const res = await authClient.passkey.addPasskey({
      name: passkeyName,
    });
    setIsLoading(false);
    if (res?.error) {
      toast.error(res.error.message || "Failed to add passkey");
    } else {
      toast.success(
        "Passkey added successfully. You can now use it to sign in."
      );
      setIsAddingPasskey(false);
      setPasskeyName("");
    }
  };

  const handleEditPasskey = async () => {
    if (!(selectedPasskey && passkeyName)) {
      toast.error("Passkey name is required");
      return;
    }

    setIsLoading(true);
    const res = await authClient.passkey.updatePasskey({
      id: selectedPasskey.id,
      name: passkeyName,
    });
    setIsLoading(false);
    if (res?.error) {
      toast.error(res.error.message || "Failed to update passkey");
    } else {
      toast.success("Passkey updated successfully");
      setIsEditingPasskey(false);
      setSelectedPasskey(null);
      setPasskeyName("");
    }
  };

  const handleDeletePasskey = async () => {
    if (!selectedPasskey) {
      return;
    }

    setIsLoading(true);
    const _res = await authClient.passkey.deletePasskey({
      id: selectedPasskey.id,
      fetchOptions: {
        onRequest: () => {
          setIsLoading(true);
        },
        onSuccess: () => {
          toast.success("Passkey removed successfully");
          setIsDeletingPasskey(false);
          setSelectedPasskey(null);
          setIsLoading(false);
        },
        onError: (error) => {
          toast.error(error.error.message || "Failed to remove passkey");
          setIsLoading(false);
        },
      },
    });
  };

  const _getDeviceIcon = (deviceType?: string) => {
    if (deviceType === "platform") {
      return <Smartphone className="h-5 w-5 text-muted-foreground" />;
    }
    return <Laptop className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5" />
                Passkeys
              </CardTitle>
              <CardDescription>
                Passkeys provide a secure, passwordless way to sign in using
                biometrics or your device's security features.
              </CardDescription>
            </div>
            <Button
              className="cursor-pointer"
              onClick={() => setIsAddingPasskey(true)}
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Passkey
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !passkeys || passkeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Fingerprint className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 font-semibold text-lg">
                No passkeys configured
              </h3>
              <p className="mb-4 max-w-sm text-muted-foreground text-sm">
                Add a passkey to enable secure, passwordless authentication on
                this device.
              </p>
              <Button
                className="cursor-pointer"
                onClick={() => setIsAddingPasskey(true)}
                variant="outline"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Passkey
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {passkeys.map((passkey) => (
                <div
                  className="flex items-center justify-between rounded-lg border p-4"
                  key={passkey.id}
                >
                  <div className="flex items-center gap-3">
                    <Fingerprint className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {passkey.name || "My Passkey"}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Created{" "}
                        {new Date(passkey.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedPasskey(passkey);
                        setPasskeyName(passkey.name || "");
                        setIsEditingPasskey(true);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      className="cursor-pointer text-destructive hover:text-destructive"
                      onClick={() => {
                        setSelectedPasskey(passkey);
                        setIsDeletingPasskey(true);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Passkey Dialog */}
      <Dialog onOpenChange={setIsAddingPasskey} open={isAddingPasskey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Passkey</DialogTitle>
            <DialogDescription>
              Give your passkey a memorable name. You'll be prompted to
              authenticate with your device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="passkey-name">Passkey Name (Optional)</Label>
              <Input
                id="passkey-name"
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder="e.g., MacBook Pro, iPhone"
                value={passkeyName}
              />
              <p className="text-muted-foreground text-xs">
                If left empty, we'll use your device information
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="cursor-pointer"
              onClick={() => {
                setIsAddingPasskey(false);
                setPasskeyName("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              disabled={isLoading}
              onClick={handleAddPasskey}
            >
              {isLoading ? "Adding..." : "Add Passkey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Passkey Dialog */}
      <Dialog onOpenChange={setIsEditingPasskey} open={isEditingPasskey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Passkey</DialogTitle>
            <DialogDescription>
              Update the name of your passkey for easier identification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-passkey-name">Passkey Name</Label>
              <Input
                id="edit-passkey-name"
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder="e.g., MacBook Pro, iPhone"
                value={passkeyName}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="cursor-pointer"
              onClick={() => {
                setIsEditingPasskey(false);
                setSelectedPasskey(null);
                setPasskeyName("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              disabled={isLoading || !passkeyName}
              onClick={handleEditPasskey}
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Passkey Confirmation */}
      <AlertDialog onOpenChange={setIsDeletingPasskey} open={isDeletingPasskey}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Passkey</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{selectedPasskey?.name}"? You
              won't be able to use this passkey to sign in anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsDeletingPasskey(false);
                setSelectedPasskey(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeletePasskey}
            >
              {isLoading ? "Removing..." : "Remove Passkey"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
