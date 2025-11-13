import { ArrowRight, Clock, Shield, Sparkles, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type FeatureItem = {
  id: number;
  title: string;
  description: string;
  icon: string;
};

type FeaturesGridProps = {
  features: FeatureItem[];
};

const iconMap = {
  Sparkles,
  Shield,
  Truck,
  Clock,
};

export function FeaturesGrid({ features }: FeaturesGridProps) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
      {features.map((feature) => {
        const IconComponent = iconMap[feature.icon as keyof typeof iconMap];
        return (
          <article className="group" key={feature.id}>
            <Card className="relative h-full overflow-hidden transition-all hover:shadow-md">
              <CardContent className="px-6">
                <Badge
                  className="mb-4 inline-flex size-12 items-center justify-center"
                  variant="secondary"
                >
                  <IconComponent aria-hidden="true" className="!size-5" />
                </Badge>
                <h3 className="mb-2 font-semibold text-lg">{feature.title}</h3>
                <p className="mb-4 text-muted-foreground text-sm">
                  {feature.description}
                </p>

                <Button
                  className="!p-0 h-auto cursor-pointer text-muted-foreground text-sm hover:text-foreground"
                  size="sm"
                  variant="link"
                >
                  Learn more
                  <ArrowRight className="ms-1.5 size-4" />
                </Button>
              </CardContent>
            </Card>
          </article>
        );
      })}
    </div>
  );
}
