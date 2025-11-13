"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const blogs = [
  {
    id: 1,
    image: "https://ui.shadcn.com/placeholder.svg",
    category: "Technology",
    title: "AI Development Catalysts",
    description:
      "Exploring how AI-driven tools are transforming software development workflows and accelerating innovation.",
  },
  {
    id: 2,
    image: "https://ui.shadcn.com/placeholder.svg",
    category: "Lifestyle",
    title: "Minimalist Living Guide",
    description:
      "Minimalist living approaches that can help reduce stress and create more meaningful daily experiences.",
  },
  {
    id: 3,
    image: "https://ui.shadcn.com/placeholder.svg",
    category: "Design",
    title: "Accessible UI Trends",
    description:
      "How modern UI trends are embracing accessibility while maintaining sleek, intuitive user experiences.",
  },
];

export function BlogSection() {
  return (
    <section className="bg-muted/50 py-24 sm:py-32" id="blog">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            Latest Insights
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            From our blog
          </h2>
          <p className="text-lg text-muted-foreground">
            Stay updated with the latest trends, best practices, and insights
            from our team of experts.
          </p>
        </div>

        {/* Blog Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {blogs.map((blog) => (
            <Card className="overflow-hidden py-0" key={blog.id}>
              <CardContent className="px-0">
                <div className="aspect-video">
                  <Image
                    alt={blog.title}
                    className="size-full object-cover dark:brightness-[0.95] dark:invert"
                    height={225}
                    loading="lazy"
                    src={blog.image}
                    width={400}
                  />
                </div>
                <div className="space-y-3 p-6">
                  <p className="text-muted-foreground text-xs uppercase tracking-widest">
                    {blog.category}
                  </p>
                  <a
                    className="cursor-pointer"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                  >
                    <h3 className="font-bold text-xl transition-colors hover:text-primary">
                      {blog.title}
                    </h3>
                  </a>
                  <p className="text-muted-foreground">{blog.description}</p>
                  <a
                    className="inline-flex cursor-pointer items-center gap-2 text-primary hover:underline"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                  >
                    Learn More
                    <ArrowRight className="size-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
