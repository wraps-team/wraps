"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SuppressConfirmDialog } from "../../deliverability/components/suppress-confirm-dialog";

/**
 * Suppress a hard-bounced address from the message it bounced on. Opens the
 * same confirmation the Deliverability tab uses; nothing reaches SES until the
 * user confirms. A refresh afterwards turns the step into "Suppressed".
 */
export function SuppressAddressButton({
  account,
  address,
  organizationId,
}: {
  account: { id: string; name: string; region: string };
  address: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="brand">
        Suppress address
      </Button>
      <SuppressConfirmDialog
        accounts={[account]}
        onDone={(result) => {
          if (result.failed === 0) {
            setOpen(false);
            router.refresh();
          }
        }}
        onOpenChange={setOpen}
        open={open}
        organizationId={organizationId}
        targets={[{ address, reason: "BOUNCE", awsAccountId: account.id }]}
      />
    </>
  );
}
