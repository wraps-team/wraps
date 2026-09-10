export type SuppressionRow = {
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
  lastUpdated: string; // ISO
  awsAccountId: string;
  region: string;
};
