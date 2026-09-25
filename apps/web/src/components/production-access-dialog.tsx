"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wraps/ui/components/ui/dialog";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { sesAccountDashboardUrl } from "@/lib/ses-console-url";
import type { ProductsStatus } from "@/stores/products-store";

const PRODUCTION_ACCESS_DOCS =
  "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html";

type FormField = {
  field: string;
  values: string;
  guidance: string;
};

const FORM_FIELDS: FormField[] = [
  {
    field: "Mail type",
    values: "Transactional or Marketing",
    guidance:
      "Pick what most of your volume is. Receipts, password resets and notifications are transactional; newsletters and promotions are marketing.",
  },
  {
    field: "Website URL",
    values: "a live public URL",
    guidance:
      "The site your recipients know you by. It must load, and it should show who you are.",
  },
  {
    field: "Contact language",
    values: "English or Japanese",
    guidance: "Language for AWS's reply.",
  },
  {
    field: "Acknowledgment",
    values: "checkbox",
    guidance:
      "You send only to people who asked for your email, and you have a process for bounces and complaints.",
  },
  {
    field: "Additional contacts",
    values: "optional, up to 4 emails",
    guidance: "Optional.",
  },
];

type ProductionAccessDialogProps = {
  region: string | null;
  review: ProductsStatus["productionAccessRequest"];
  trigger: ReactNode;
};

export function ProductionAccessDialog({
  region,
  review,
  trigger,
}: ProductionAccessDialogProps) {
  const openHref = region
    ? sesAccountDashboardUrl(region)
    : PRODUCTION_ACCESS_DOCS;
  const openLabel = region ? `Open SES in ${region}` : "Open AWS's guide";

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request SES production access</DialogTitle>
          <DialogDescription>
            AWS reviews the request, not Wraps. AWS says it responds within 24
            hours.
          </DialogDescription>
        </DialogHeader>

        {review?.status === "DENIED" && (
          <div className="rounded-md border bg-muted p-3 text-sm">
            <p>
              A denial isn't final. Before resubmitting, make clear where your
              recipients came from and how people unsubscribe.
            </p>
            {review.caseId && (
              <p className="mt-1 text-muted-foreground">
                Case {review.caseId} — you can ask AWS Support about that case
                for details.
              </p>
            )}
          </div>
        )}

        {review?.status === "FAILED" && (
          <div className="rounded-md border bg-muted p-3 text-sm">
            AWS never received your previous request, so submit it again.
          </div>
        )}

        <div>
          <h3 className="font-medium text-sm">What AWS's form asks</h3>
          <dl className="mt-2 space-y-3">
            {FORM_FIELDS.map((row) => (
              <div key={row.field}>
                <dt className="text-sm">
                  <span className="font-medium">{row.field}</span>{" "}
                  <span className="text-muted-foreground">({row.values})</span>
                </dt>
                <dd className="text-muted-foreground text-sm">
                  {row.guidance}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-muted-foreground text-sm">
          Wraps deploys your SES configuration set with bounce and complaint
          suppression on by default.
        </p>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button asChild variant="brand">
            <a href={openHref} rel="noopener noreferrer" target="_blank">
              {openLabel}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
