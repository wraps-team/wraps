"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FAQ {
  id: number;
  question: string;
  answer: string;
  category: string;
}

interface Category {
  name: string;
  count: number;
}

interface FAQListProps {
  faqs: FAQ[];
  categories: Category[];
}

export function FAQList({ faqs, categories }: FAQListProps) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter FAQs based on selected category and search query
  const filteredFaqs = faqs.filter((faq) => {
    const matchesCategory =
      selectedCategory === "All" || faq.category === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-6 xl:grid-cols-4">
      {/* Categories Sidebar */}
      <Card className="lg:col-span-2 xl:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg">Categories</CardTitle>
          <div className="relative">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
            <Input
              className="cursor-pointer pl-10"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search FAQs..."
              value={searchQuery}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {categories.map((category) => (
            <div
              className={cn(
                "group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-muted",
                selectedCategory === category.name && "bg-muted"
              )}
              key={category.name}
              onClick={() => setSelectedCategory(category.name)}
            >
              <span className="font-medium">{category.name}</span>
              <Badge
                className={cn(
                  "transition-colors",
                  selectedCategory === category.name && "bg-background"
                )}
                variant="secondary"
              >
                {category.name === "All" ? faqs.length : category.count}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* FAQs List */}
      <div className="lg:col-span-4 xl:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedCategory === "All"
                ? "All FAQs"
                : `${selectedCategory} FAQs`}
              <span className="ml-2 font-normal text-muted-foreground text-sm">
                ({filteredFaqs.length}{" "}
                {filteredFaqs.length === 1 ? "question" : "questions"})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[570px] pr-4">
              {filteredFaqs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p>No FAQs found matching your search criteria.</p>
                </div>
              ) : (
                <Accordion
                  className="space-y-4"
                  defaultValue="item-1"
                  type="single"
                >
                  {filteredFaqs.map((item) => (
                    <AccordionItem
                      className="border! rounded-md"
                      key={item.id}
                      value={`item-${item.id}`}
                    >
                      <AccordionTrigger className="cursor-pointer px-4 hover:no-underline">
                        <div className="flex items-start text-left">
                          <span>{item.question}</span>
                          <Badge
                            className="ms-3 mt-0.5 shrink-0 text-xs"
                            variant="outline"
                          >
                            {item.category}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
