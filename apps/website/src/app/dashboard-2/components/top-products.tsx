"use client";

import { Eye, Star, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const products = [
  {
    id: 1,
    name: "Premium Dashboard",
    sales: 2847,
    revenue: "$142,350",
    growth: "+23%",
    rating: 4.8,
    stock: 145,
    category: "Software",
  },
  {
    id: 2,
    name: "Analytics Pro",
    sales: 1923,
    revenue: "$96,150",
    growth: "+18%",
    rating: 4.6,
    stock: 67,
    category: "Tools",
  },
  {
    id: 3,
    name: "Mobile App Suite",
    sales: 1456,
    revenue: "$72,800",
    growth: "+12%",
    rating: 4.9,
    stock: 234,
    category: "Mobile",
  },
  {
    id: 4,
    name: "Enterprise License",
    sales: 892,
    revenue: "$178,400",
    growth: "+8%",
    rating: 4.7,
    stock: 12,
    category: "Enterprise",
  },
  {
    id: 5,
    name: "Basic Subscription",
    sales: 3421,
    revenue: "$68,420",
    growth: "+31%",
    rating: 4.4,
    stock: 999,
    category: "Subscription",
  },
];

export function TopProducts() {
  return (
    <Card className="cursor-pointer">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Top Products</CardTitle>
          <CardDescription>Best performing products this month</CardDescription>
        </div>
        <Button className="cursor-pointer" size="sm" variant="outline">
          <Eye className="mr-2 h-4 w-4" />
          View All
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {products.map((product, index) => (
          <div
            className="flex items-center gap-2 rounded-lg border p-3"
            key={product.id}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
              #{index + 1}
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-between gap-2 space-x-3">
              <div className="">
                <div className="flex items-center space-x-2">
                  <p className="truncate font-medium text-sm">{product.name}</p>
                  <Badge className="text-xs" variant="outline">
                    {product.category}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-muted-foreground text-xs">
                      {product.rating}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">•</span>
                  <span className="text-muted-foreground text-xs">
                    {product.sales} sales
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-right">
                <div className="flex items-center space-x-2">
                  <p className="font-medium text-sm">{product.revenue}</p>
                  <Badge
                    className="cursor-pointer border-green-200 text-green-600"
                    variant="outline"
                  >
                    <TrendingUp className="mr-1 h-3 w-3" />
                    {product.growth}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-muted-foreground text-xs">
                    Stock: {product.stock}
                  </span>
                  <Progress
                    className="h-1 w-12"
                    value={
                      product.stock > 100 ? 100 : (product.stock / 100) * 100
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
