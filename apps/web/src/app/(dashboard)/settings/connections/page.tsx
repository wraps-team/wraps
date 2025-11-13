"use client";
import {
  Apple,
  Chrome,
  Database,
  Dribbble,
  Facebook,
  Github,
  Globe,
  Instagram,
  Slack,
  Twitter,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
export default function ConnectionSettings() {
  // Controlled state for switches
  const [appleConnected, setAppleConnected] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [githubConnected, setGithubConnected] = useState(true);
  const [slackConnected, setSlackConnected] = useState(false);
  const [zapierConnected, setZapierConnected] = useState(true);
  const [webhooksConnected, setWebhooksConnected] = useState(false);
  const [dbConnected, setDbConnected] = useState(true);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Connections</h1>
        <p className="text-muted-foreground">
          Connect your account with third-party services and integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>
              Display content from your connected accounts on your site
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Apple className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Apple</div>
                    <div className="text-muted-foreground text-sm">
                      Calendar and contacts
                    </div>
                  </div>
                </div>
                <Switch
                  checked={appleConnected}
                  className="cursor-pointer"
                  onCheckedChange={setAppleConnected}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Chrome className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Google</div>
                    <div className="text-muted-foreground text-sm">
                      Calendar and contacts
                    </div>
                  </div>
                </div>
                <Switch
                  checked={googleConnected}
                  className="cursor-pointer"
                  onCheckedChange={setGoogleConnected}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Github className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Github</div>
                    <div className="text-muted-foreground text-sm">
                      Manage your Git repositories
                    </div>
                  </div>
                </div>
                <Switch
                  checked={githubConnected}
                  className="cursor-pointer"
                  onCheckedChange={setGithubConnected}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Slack className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Slack</div>
                    <div className="text-muted-foreground text-sm">
                      Communication
                    </div>
                  </div>
                </div>
                <Switch
                  checked={slackConnected}
                  className="cursor-pointer"
                  onCheckedChange={setSlackConnected}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Social Accounts</CardTitle>
            <CardDescription>
              Display content from your connected accounts on your site
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Facebook className="h-8 w-8" />
                  <div>
                    <div className="font-medium">
                      Facebook
                      <Badge className="ml-2" variant="outline">
                        Not Connected
                      </Badge>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Share updates on Facebook
                    </div>
                  </div>
                </div>
                <Button
                  className="cursor-pointer"
                  size="icon"
                  variant="outline"
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Twitter className="h-8 w-8" />
                  <div>
                    <div className="font-medium">
                      Twitter
                      <Badge className="ml-2" variant="secondary">
                        connected
                      </Badge>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Share updates on Twitter
                    </div>
                  </div>
                </div>
                <Button
                  className="cursor-pointer text-destructive"
                  size="icon"
                  variant="outline"
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Instagram className="h-8 w-8" />
                  <div>
                    <div className="font-medium">
                      Instagram
                      <Badge className="ml-2" variant="secondary">
                        connected
                      </Badge>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Stay connected at Instagram
                    </div>
                  </div>
                </div>
                <Button
                  className="cursor-pointer text-destructive"
                  size="icon"
                  variant="outline"
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Dribbble className="h-8 w-8" />
                  <div>
                    <div className="font-medium">
                      Dribbble
                      <Badge className="ml-2" variant="outline">
                        Not Connected
                      </Badge>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      Stay connected at Dribbble
                    </div>
                  </div>
                </div>
                <Button
                  className="cursor-pointer"
                  size="icon"
                  variant="outline"
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API Integrations</CardTitle>
            <CardDescription>
              Configure API connections and webhooks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Zap className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Zapier</div>
                    <div className="text-muted-foreground text-sm">
                      Automate workflows with Zapier
                    </div>
                  </div>
                </div>
                <Switch
                  checked={zapierConnected}
                  className="cursor-pointer"
                  onCheckedChange={setZapierConnected}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Globe className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Webhooks</div>
                    <div className="text-muted-foreground text-sm">
                      Configure custom webhook endpoints
                    </div>
                  </div>
                </div>
                <Switch
                  checked={webhooksConnected}
                  className="cursor-pointer"
                  onCheckedChange={setWebhooksConnected}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Database className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Database Sync</div>
                    <div className="text-muted-foreground text-sm">
                      Sync data with external databases
                    </div>
                  </div>
                </div>
                <Switch
                  checked={dbConnected}
                  className="cursor-pointer"
                  onCheckedChange={setDbConnected}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Manage your API keys and access tokens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Production API Key</div>
                  <div className="font-mono text-muted-foreground text-sm">
                    sk_live_••••••••••••••••••••••••4234
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    className="cursor-pointer"
                    size="sm"
                    variant="outline"
                  >
                    Regenerate
                  </Button>
                  <Button
                    className="cursor-pointer"
                    size="sm"
                    variant="outline"
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Development API Key</div>
                  <div className="font-mono text-muted-foreground text-sm">
                    sk_test_••••••••••••••••••••••••5678
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    className="cursor-pointer"
                    size="sm"
                    variant="outline"
                  >
                    Regenerate
                  </Button>
                  <Button
                    className="cursor-pointer"
                    size="sm"
                    variant="outline"
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="pt-4">
                <Button className="cursor-pointer" variant="outline">
                  Add New API Key
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
