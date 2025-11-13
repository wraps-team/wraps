import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type BillingHistoryItem = {
  id: number;
  month: string;
  plan: string;
  amount: string;
  status: string;
};

type BillingHistoryCardProps = {
  history: BillingHistoryItem[];
};

export function BillingHistoryCard({ history }: BillingHistoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
        <CardDescription>View your past invoices and payments.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {history.map((item, index) => (
            <div key={item.id}>
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{item.month}</div>
                  <div className="text-muted-foreground text-sm">
                    {item.plan}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{item.amount}</div>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
              </div>
              {index < history.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
