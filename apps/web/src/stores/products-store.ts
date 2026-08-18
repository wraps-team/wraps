import { create } from "zustand";
import type { PlanId } from "@/lib/plans";

export type PlanFeatures = {
  batch: boolean;
  topics: boolean;
  segments: boolean;
  campaigns: boolean;
  workflows: boolean;
  events: boolean;
};

export type ProductsStatus = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  hasAwsAccounts: boolean;
  /** `true` in the SES sandbox, `false` in production, `null` never scanned. */
  sandboxStatus: boolean | null;
  planId: PlanId;
  planFeatures: PlanFeatures;
  memberCount: number;
  userRole: string;
};

type ProductsStore = {
  status: ProductsStatus | null;
  orgId: string | null;
  setStatus: (orgId: string, status: ProductsStatus) => void;
  clear: () => void;
};

export const useProductsStore = create<ProductsStore>((set) => ({
  status: null,
  orgId: null,
  setStatus: (orgId, status) => set({ orgId, status }),
  clear: () => set({ status: null, orgId: null }),
}));
