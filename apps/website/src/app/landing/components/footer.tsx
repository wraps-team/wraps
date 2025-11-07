"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Github, Heart, Linkedin, Twitter, Youtube } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const newsletterSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
});

const footerLinks = {
  product: [
    { name: "Features", href: "#features" },
    { name: "Pricing", href: "#pricing" },
    { name: "API", href: "#api" },
    { name: "Documentation", href: "#docs" },
  ],
  company: [
    { name: "About", href: "#about" },
    { name: "Blog", href: "#blog" },
    { name: "Careers", href: "#careers" },
    { name: "Press", href: "#press" },
  ],
  resources: [
    { name: "Help Center", href: "#help" },
    { name: "Community", href: "#community" },
    { name: "Guides", href: "#guides" },
    { name: "Webinars", href: "#webinars" },
  ],
  legal: [
    { name: "Privacy", href: "#privacy" },
    { name: "Terms", href: "#terms" },
    { name: "Security", href: "#security" },
    { name: "Status", href: "#status" },
  ],
};

const socialLinks = [
  { name: "Twitter", href: "#", icon: Twitter },
  {
    name: "GitHub",
    href: "https://github.com/silicondeck/shadcn-dashboard-landing-template",
    icon: Github,
  },
  { name: "LinkedIn", href: "#", icon: Linkedin },
  { name: "YouTube", href: "#", icon: Youtube },
];

export function LandingFooter() {
  const form = useForm<z.infer<typeof newsletterSchema>>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: {
      email: "",
    },
  });

  function onSubmit(values: z.infer<typeof newsletterSchema>) {
    // Here you would typically send the email to your newsletter service
    console.log(values);
    // Show success message and reset form
    form.reset();
  }

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Newsletter Section */}
        <div className="mb-16">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="mb-4 font-bold text-2xl">Stay updated</h3>
            <p className="mb-6 text-muted-foreground">
              Get the latest updates, articles, and resources sent to your inbox
              weekly.
            </p>
            <Form {...form}>
              <form
                className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          placeholder="Enter your email"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button className="cursor-pointer" type="submit">
                  Subscribe
                </Button>
              </form>
            </Form>
          </div>
        </div>

        {/* Main Footer Content */}
        <div className="grid grid-cols-4 gap-8 lg:grid-cols-6">
          {/* Brand Column */}
          <div className="col-span-4 max-w-2xl lg:col-span-2">
            <div className="mb-4 flex items-center space-x-2 max-lg:justify-center">
              <a
                className="flex cursor-pointer items-center space-x-2"
                href="https://shadcnstore.com"
                rel="noopener"
                target="_blank"
              >
                <Logo size={32} />
                <span className="font-bold text-xl">ShadcnStore</span>
              </a>
            </div>
            <p className="mb-6 text-muted-foreground max-lg:flex max-lg:justify-center max-lg:text-center">
              Accelerating web development with curated blocks, templates,
              landing pages, and admin dashboards designed for modern
              developers.
            </p>
            <div className="flex space-x-4 max-lg:justify-center">
              {socialLinks.map((social) => (
                <Button asChild key={social.name} size="icon" variant="ghost">
                  <a
                    aria-label={social.name}
                    href={social.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <social.icon className="h-4 w-4" />
                  </a>
                </Button>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <a
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <a
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <a
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <a
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Bottom Footer */}
        <div className="flex flex-col items-center justify-between gap-2 lg:flex-row">
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm sm:flex-row">
            <div className="flex items-center gap-1">
              <span>Made with</span>
              <Heart className="h-4 w-4 fill-current text-red-500" />
              <span>by</span>
              <a
                className="cursor-pointer font-semibold text-foreground transition-colors hover:text-primary"
                href="https://shadcnstore.com"
                rel="noopener"
                target="_blank"
              >
                ShadcnStore
              </a>
            </div>
            <span className="hidden sm:inline">•</span>
            <span>
              © {new Date().getFullYear()} for the developer community
            </span>
          </div>
          <div className="mt-4 flex items-center space-x-4 text-muted-foreground text-sm md:mt-0">
            <a
              className="transition-colors hover:text-foreground"
              href="#privacy"
            >
              Privacy Policy
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="#terms"
            >
              Terms of Service
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="#cookies"
            >
              Cookie Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
