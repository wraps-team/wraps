import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { pageMetadata } from "@/lib/page-metadata";
import { ContactPageContent } from "./page-content";

export const metadata: Metadata = pageMetadata({
  title: "Contact Us - Book a Call with Wraps",
  description:
    "Schedule a call with the Wraps team to discuss your email infrastructure needs. Or reach out via Discord or GitHub.",
  path: "/contact",
  social: {
    title: "Contact Us",
    description:
      "Schedule a call with the Wraps team to discuss your email infrastructure needs.",
  },
});

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <ContactPageContent />
      </main>
      <LandingFooter />
    </div>
  );
}
