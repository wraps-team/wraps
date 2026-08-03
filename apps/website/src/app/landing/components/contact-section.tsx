"use client";

import { BookOpen, MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { memo } from "react";
import { Github } from "@/components/ui/svgs/brand-icons";

const Cal = dynamic(() => import("@calcom/embed-react"), { ssr: false });

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";

const ContactSection = memo(function ContactSection() {
  return (
    <section className="py-24 sm:py-32" id="contact">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            Get In Touch
          </Badge>
          <h1 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            Book a call with us
          </h1>
          <p className="text-lg text-muted-foreground">
            Schedule a time to chat about your email infrastructure needs. We'll
            help you get started with Wraps.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Contact Options */}
          <div className="order-2 space-y-6 lg:order-1">
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle
                    aria-hidden="true"
                    className="h-5 w-5 text-primary"
                  />
                  Discord Community
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground">
                  Join our active community for quick help and discussions with
                  other developers.
                </p>
                <Button
                  asChild
                  className="cursor-pointer"
                  size="sm"
                  variant="outline"
                >
                  <a
                    href="https://discord.gg/pdgAa6xAWF"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Join Discord
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Github aria-hidden="true" className="h-5 w-5 text-primary" />
                  GitHub Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground">
                  Report bugs, request features, or contribute to our open
                  source repository.
                </p>
                <Button
                  asChild
                  className="cursor-pointer"
                  size="sm"
                  variant="outline"
                >
                  <a
                    href="https://github.com/wraps-team/wraps/issues"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View on GitHub
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen
                    aria-hidden="true"
                    className="h-5 w-5 text-primary"
                  />
                  Documentation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground">
                  Browse our comprehensive guides, tutorials, and component
                  documentation.
                </p>
                <Button
                  asChild
                  className="cursor-pointer"
                  size="sm"
                  variant="outline"
                >
                  <Link href="/docs">View Docs</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Cal.com Booking Embed */}
          <div className="order-1 lg:order-2 lg:col-span-2">
            <Cal
              calLink="wraps/get-started-with-wraps"
              config={{ layout: "month_view" }}
              style={{ width: "100%", height: "100%", overflow: "scroll" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
});

export { ContactSection };
