"use client";

import { Eye, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const transactions = [
  {
    id: "TXN-001",
    customer: {
      name: "Olivia Martin",
      email: "olivia.martin@email.com",
      avatar: "/avatars/01.png",
    },
    amount: "$1,999.00",
    status: "completed",
    date: "2 hours ago",
  },
  {
    id: "TXN-002",
    customer: {
      name: "Jackson Lee",
      email: "jackson.lee@email.com",
      avatar: "/avatars/02.png",
    },
    amount: "$2,999.00",
    status: "pending",
    date: "5 hours ago",
  },
  {
    id: "TXN-003",
    customer: {
      name: "Isabella Nguyen",
      email: "isabella.nguyen@email.com",
      avatar: "/avatars/03.png",
    },
    amount: "$39.00",
    status: "completed",
    date: "1 day ago",
  },
  {
    id: "TXN-004",
    customer: {
      name: "William Kim",
      email: "will@email.com",
      avatar: "/avatars/04.png",
    },
    amount: "$299.00",
    status: "failed",
    date: "2 days ago",
  },
  {
    id: "TXN-005",
    customer: {
      name: "Sofia Davis",
      email: "sofia.davis@email.com",
      avatar: "/avatars/05.png",
    },
    amount: "$99.00",
    status: "completed",
    date: "3 days ago",
  },
];

export function RecentTransactions() {
  return (
    <Card className="cursor-pointer">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Latest customer transactions</CardDescription>
        </div>
        <Button className="cursor-pointer" size="sm" variant="outline">
          <Eye className="mr-2 h-4 w-4" />
          View All
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {transactions.map((transaction) => (
          <div key={transaction.id}>
            <div className="flex gap-2 rounded-lg border p-3">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  alt={transaction.customer.name}
                  src={transaction.customer.avatar}
                />
                <AvatarFallback>
                  {transaction.customer.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-wrap items-center justify-between gap-1">
                <div className="flex items-center space-x-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {transaction.customer.name}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {transaction.customer.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge
                    className="cursor-pointer"
                    variant={
                      transaction.status === "completed"
                        ? "default"
                        : transaction.status === "pending"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {transaction.status}
                  </Badge>
                  <div className="text-right">
                    <p className="font-medium text-sm">{transaction.amount}</p>
                    <p className="text-muted-foreground text-xs">
                      {transaction.date}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="h-8 w-8 cursor-pointer p-0"
                        size="sm"
                        variant="ghost"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="cursor-pointer">
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer">
                        Download Receipt
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer">
                        Contact Customer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
