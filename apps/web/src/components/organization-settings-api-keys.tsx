"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wraps/ui/components/ui/alert";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Area, AreaChart } from "recharts";
import { toast } from "sonner";
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  updateApiKey,
} from "@/actions/api-keys";
import { useVolumeData } from "@/app/(dashboard)/[orgSlug]/emails/analytics/hooks/use-analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  API_KEY_PERMISSIONS,
  type ApiKeyPermission,
  type ApiKeyWithMeta,
} from "@/lib/api-keys";

type OrganizationSettingsApiKeysProps = {
  organization: {
    id: string;
    name: string;
  };
  userRole: string;
};

// Permission categories for display
const PERMISSION_CATEGORIES = [
  {
    name: "Contacts",
    permissions: ["contacts:read", "contacts:write"] as ApiKeyPermission[],
  },
  {
    name: "Topics",
    permissions: ["topics:read", "topics:write"] as ApiKeyPermission[],
  },
  {
    name: "Segments",
    permissions: ["segments:read", "segments:write"] as ApiKeyPermission[],
  },
  {
    name: "Campaigns",
    permissions: ["campaigns:read", "campaigns:write"] as ApiKeyPermission[],
  },
  {
    name: "Workflows",
    permissions: ["workflows:read", "workflows:write"] as ApiKeyPermission[],
  },
  {
    name: "Analytics",
    permissions: ["analytics:read"] as ApiKeyPermission[],
  },
  {
    name: "Email",
    permissions: ["send:email"] as ApiKeyPermission[],
  },
];

export function OrganizationSettingsApiKeys({
  organization,
  userRole,
}: OrganizationSettingsApiKeysProps) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { data: volumeData } = useVolumeData(orgSlug, 30);
  const sparkData = volumeData?.map((d) => ({ v: d.sent })) ?? [];

  const [apiKeys, setApiKeys] = useState<ApiKeyWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [secretKeyDialogOpen, setSecretKeyDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyWithMeta | null>(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<"live" | "test">("live");
  const [createPermissionPreset, setCreatePermissionPreset] = useState<
    "full" | "readonly" | "custom"
  >("full");
  const [createCustomPermissions, setCreateCustomPermissions] = useState<
    ApiKeyPermission[]
  >([...API_KEY_PERMISSIONS]);
  const [createExpiresInDays, setCreateExpiresInDays] =
    useState<string>("never");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Secret key display state
  const [newSecretKey, setNewSecretKey] = useState<string>("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPermissions, setEditPermissions] = useState<ApiKeyPermission[]>(
    []
  );
  const [editSubmitting, setEditSubmitting] = useState(false);

  const canEdit = userRole === "owner" || userRole === "admin";

  // Load API keys
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const result = await listApiKeys(organization.id);
        if (result.success) {
          setApiKeys(result.apiKeys);
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof TypeError
            ? "Couldn't reach the server. Check your connection and try again."
            : "Failed to load API keys."
        );
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [organization.id]);

  const refreshData = async () => {
    try {
      const result = await listApiKeys(organization.id);
      if (result.success) {
        setApiKeys(result.apiKeys);
      }
    } catch (error) {
      toast.error(
        error instanceof TypeError
          ? "Couldn't refresh API keys. Check your connection."
          : "Failed to refresh API keys."
      );
    }
  };

  async function handleCreateApiKey() {
    if (!createName.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }

    setCreateSubmitting(true);

    const permissions =
      createPermissionPreset === "custom"
        ? createCustomPermissions
        : createPermissionPreset;

    const result = await createApiKey(organization.id, {
      name: createName.trim(),
      type: createType,
      permissions,
      expiresInDays:
        createExpiresInDays !== "never"
          ? Number.parseInt(createExpiresInDays, 10)
          : undefined,
    });

    setCreateSubmitting(false);

    if (result.success) {
      toast.success("API key created");
      setCreateDialogOpen(false);

      // Show the secret key dialog
      setNewSecretKey(result.secretKey);
      setSecretKeyDialogOpen(true);

      // Reset form
      setCreateName("");
      setCreateType("live");
      setCreatePermissionPreset("full");
      setCreateCustomPermissions([...API_KEY_PERMISSIONS]);
      setCreateExpiresInDays("never");

      refreshData();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDeleteApiKey(keyId: string) {
    if (
      !confirm(
        "Are you sure you want to delete this API key? This action cannot be undone."
      )
    ) {
      return;
    }

    const result = await deleteApiKey(keyId, organization.id);
    if (result.success) {
      toast.success("API key deleted");
      refreshData();
    } else {
      toast.error(result.error);
    }
  }

  function openEditDialog(key: ApiKeyWithMeta) {
    setEditingKey(key);
    setEditName(key.name);
    setEditPermissions(key.permissions);
    setEditDialogOpen(true);
  }

  async function handleUpdateApiKey() {
    if (!editingKey) {
      return;
    }

    setEditSubmitting(true);
    const result = await updateApiKey(editingKey.id, organization.id, {
      name: editName.trim(),
      permissions: editPermissions,
    });
    setEditSubmitting(false);

    if (result.success) {
      toast.success("API key updated");
      setEditDialogOpen(false);
      setEditingKey(null);
      refreshData();
    } else {
      toast.error(result.error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
    toast.success("Copied to clipboard");
  }

  function togglePermission(permission: ApiKeyPermission) {
    setCreateCustomPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  }

  function toggleEditPermission(permission: ApiKeyPermission) {
    setEditPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create API Key Dialog */}
      <Dialog onOpenChange={setCreateDialogOpen} open={createDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key to access the Wraps API programmatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Production API Key"
                value={createName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Environment</Label>
              <Select
                onValueChange={(v) => setCreateType(v as "live" | "test")}
                value={createType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live (Production)</SelectItem>
                  <SelectItem value="test">Test (Sandbox)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="permissions">Permissions</Label>
              <Select
                onValueChange={(v) =>
                  setCreatePermissionPreset(v as "full" | "readonly" | "custom")
                }
                value={createPermissionPreset}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Access</SelectItem>
                  <SelectItem value="readonly">Read Only</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createPermissionPreset === "custom" && (
              <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border p-3">
                {PERMISSION_CATEGORIES.map((category) => (
                  <div key={category.name}>
                    <p className="mb-1 font-medium text-sm">{category.name}</p>
                    <div className="space-y-1">
                      {category.permissions.map((perm) => (
                        <div className="flex items-center space-x-2" key={perm}>
                          <Checkbox
                            checked={createCustomPermissions.includes(perm)}
                            id={`create-${perm}`}
                            onCheckedChange={() => togglePermission(perm)}
                          />
                          <label
                            className="text-sm leading-none"
                            htmlFor={`create-${perm}`}
                          >
                            {perm}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="expires">Expiration (optional)</Label>
              <Select
                onValueChange={setCreateExpiresInDays}
                value={createExpiresInDays}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Never expires" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={createSubmitting}
              onClick={() => setCreateDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={createSubmitting} onClick={handleCreateApiKey}>
              {createSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create API Key"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Key Display Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setNewSecretKey("");
            setShowSecretKey(false);
          }
          setSecretKeyDialogOpen(open);
        }}
        open={secretKeyDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Copy your API key now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                This is the only time you'll see this API key. Make sure to copy
                it and store it securely.
              </AlertDescription>
            </Alert>
            <div className="mt-4 space-y-2">
              <Label>Your API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    className="pr-10 font-mono text-sm"
                    readOnly
                    type={showSecretKey ? "text" : "password"}
                    value={newSecretKey}
                  />
                  <Button
                    aria-label="Toggle visibility"
                    className="-translate-y-1/2 absolute top-1/2 right-2 h-6 w-6"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    size="icon"
                    variant="ghost"
                  >
                    {showSecretKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button
                  aria-label="Copy to clipboard"
                  onClick={() => copyToClipboard(newSecretKey)}
                  size="icon"
                  variant="outline"
                >
                  {copiedSecret ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecretKeyDialogOpen(false)}>
              I've copied the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit API Key Dialog */}
      <Dialog onOpenChange={setEditDialogOpen} open={editDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>
              Update the name and permissions for this API key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                onChange={(e) => setEditName(e.target.value)}
                value={editName}
              />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border p-3">
                {PERMISSION_CATEGORIES.map((category) => (
                  <div key={category.name}>
                    <p className="mb-1 font-medium text-sm">{category.name}</p>
                    <div className="space-y-1">
                      {category.permissions.map((perm) => (
                        <div className="flex items-center space-x-2" key={perm}>
                          <Checkbox
                            checked={editPermissions.includes(perm)}
                            id={`edit-${perm}`}
                            onCheckedChange={() => toggleEditPermission(perm)}
                          />
                          <label
                            className="text-sm leading-none"
                            htmlFor={`edit-${perm}`}
                          >
                            {perm}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={editSubmitting}
              onClick={() => setEditDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={editSubmitting} onClick={handleUpdateApiKey}>
              {editSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Keys Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage API keys for programmatic access to the Wraps API.
              </CardDescription>
            </div>
            {canEdit && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create API Key
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="py-8 text-center">
              <Key className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold text-lg">No API Keys</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Create an API key to start using the Wraps API.
              </p>
              {canEdit && (
                <Button
                  className="mt-4"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  className="flex items-center justify-between rounded-lg border p-4"
                  key={key.id}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Key className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{key.name}</h4>
                        <Badge variant="secondary">
                          {key.prefix.includes("live") ? "Live" : "Test"}
                        </Badge>
                        {key.expiresAt &&
                          new Date(key.expiresAt) < new Date() && (
                            <Badge variant="destructive">Expired</Badge>
                          )}
                      </div>
                      <p className="font-mono text-muted-foreground text-sm">
                        {key.prefix}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Created{" "}
                        {new Date(key.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {key.lastUsedAt && (
                          <>
                            {" "}
                            &middot; Last used{" "}
                            {new Date(key.lastUsedAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sparkData.length > 0 && (
                      <div className="hidden h-10 w-24 md:block">
                        <AreaChart data={sparkData} height={40} width={96}>
                          <defs>
                            <linearGradient
                              id={`spark-${key.id}`}
                              x1="0"
                              x2="0"
                              y1="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="currentColor"
                                stopOpacity={0.15}
                              />
                              <stop
                                offset="95%"
                                stopColor="currentColor"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <Area
                            dataKey="v"
                            fill={`url(#spark-${key.id})`}
                            isAnimationActive={false}
                            stroke="currentColor"
                            strokeOpacity={0.3}
                            strokeWidth={1.5}
                            type="monotone"
                          />
                        </AreaChart>
                      </div>
                    )}
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="More actions"
                            size="icon"
                            variant="ghost"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(key)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteApiKey(key.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Guide Card */}
      <Card>
        <CardHeader>
          <CardTitle>Using API Keys</CardTitle>
          <CardDescription>
            How to authenticate with the Wraps API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="mb-2 font-medium">HTTP Header</h4>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm">
              Authorization: Bearer wraps_live_xxxx...
            </pre>
          </div>
          <div>
            <h4 className="mb-2 font-medium">SDK Usage</h4>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm">
              {`import { createPlatformClient } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});`}
            </pre>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Security Best Practices
              </h4>
              <ul className="mt-1 list-inside list-disc text-blue-800 text-sm dark:text-blue-200">
                <li>Never commit API keys to version control</li>
                <li>Use environment variables in production</li>
                <li>Rotate keys regularly</li>
                <li>Use the minimum required permissions</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
