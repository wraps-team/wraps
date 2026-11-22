import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import BlogContent from "./page-content";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description:
    "Deep dives into email infrastructure, security, and developer experience. Interactive content that makes complex topics tangible.",
  path: "/blog",
  social: {
    twitterCopy: {
      description:
        "Deep dives into email infrastructure, security, and developer experience.",
    },
  },
});

export default function BlogPage() {
  return <BlogContent />;
}
