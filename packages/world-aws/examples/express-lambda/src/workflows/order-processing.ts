"use workflow";

import { step } from "workflow";

type OrderInput = {
  orderId: string;
  items: { sku: string; quantity: number }[];
  customerEmail: string;
};

export default async function orderProcessing(input: OrderInput) {
  const validated = await step("validate-inventory", async () => {
    // Check inventory for all items
    return input.items.map((item) => ({
      ...item,
      available: true,
    }));
  });

  const payment = await step("process-payment", async () => {
    // Charge the customer
    return { transactionId: `txn_${Date.now()}`, status: "captured" };
  });

  await step("send-confirmation", async () => {
    // Send order confirmation email
    console.log(`Confirmation sent to ${input.customerEmail}`);
    return { sent: true };
  });

  return {
    orderId: input.orderId,
    transactionId: payment.transactionId,
    itemCount: validated.length,
    status: "confirmed",
  };
}
