import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSesFeatureEntitlement,
  monthlyCostForPlan,
  SES_PLAN_FEATURE_LABELS,
  SES_PLAN_FEATURES,
  SES_PLAN_RATES,
  SES_PRICING_PLANS,
  sendingCostForPlan,
} from "./ses-plans.js";

const IMPORT_STATEMENT_PATTERN = /^import /m;

describe("ses-plans.ts purity", () => {
  it("has no imports at all", () => {
    // apps/web client components import this file through the
    // `@wraps/core/ses-plans` subpath, so one import of a Node built-in (or
    // any other module) breaks the browser bundle — a failure only
    // `next build` would catch. Guard it here instead.
    const source = readFileSync(
      new URL("./ses-plans.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(IMPORT_STATEMENT_PATTERN);
  });
});

describe("getSesFeatureEntitlement", () => {
  it("returns a valid entitlement with a label for every plan × feature pair", () => {
    for (const plan of SES_PRICING_PLANS) {
      for (const feature of SES_PLAN_FEATURES) {
        const entitlement = getSesFeatureEntitlement(plan, feature);
        expect(["included", "addon", "unavailable"]).toContain(
          entitlement.status
        );
        expect(SES_PLAN_FEATURE_LABELS[feature]).toBeTruthy();
      }
    }
  });

  it("includes VDM on ESSENTIALS, PRO and ENTERPRISE, and sells it as an add-on on NONE", () => {
    expect(getSesFeatureEntitlement("NONE", "vdm").status).toBe("addon");
    expect(getSesFeatureEntitlement("ESSENTIALS", "vdm").status).toBe(
      "included"
    );
    expect(getSesFeatureEntitlement("PRO", "vdm").status).toBe("included");
    expect(getSesFeatureEntitlement("ENTERPRISE", "vdm").status).toBe(
      "included"
    );
  });

  it("sells global deliverability as a $1,250/mo add-on on ESSENTIALS", () => {
    const entitlement = getSesFeatureEntitlement(
      "ESSENTIALS",
      "globalDeliverability"
    );
    expect(entitlement.status).toBe("addon");
    expect(entitlement.status === "addon" && entitlement.price).toContain(
      "1,250"
    );
  });

  it("includes 2,500 validations/mo on PRO and 5,000 on ENTERPRISE", () => {
    const pro = getSesFeatureEntitlement("PRO", "validationApi");
    expect(pro.status).toBe("included");
    expect(pro.status === "included" && pro.allowance).toContain("2,500");

    const enterprise = getSesFeatureEntitlement("ENTERPRISE", "validationApi");
    expect(enterprise.status).toBe("included");
    expect(enterprise.status === "included" && enterprise.allowance).toContain(
      "5,000"
    );
  });

  it("includes open ingress and global endpoints only on ENTERPRISE", () => {
    for (const plan of SES_PRICING_PLANS) {
      const openIngress = getSesFeatureEntitlement(plan, "openIngress");
      const globalEndpoints = getSesFeatureEntitlement(plan, "globalEndpoints");
      if (plan === "ENTERPRISE") {
        expect(openIngress.status).toBe("included");
        expect(globalEndpoints.status).toBe("included");
      } else {
        expect(openIngress.status).toBe("addon");
        expect(globalEndpoints.status).toBe("addon");
      }
    }
  });

  it("sells archiving as an add-on on all four plans", () => {
    for (const plan of SES_PRICING_PLANS) {
      expect(getSesFeatureEntitlement(plan, "archiving").status).toBe("addon");
    }
  });
});

describe("monthlyCostForPlan spot checks", () => {
  it("prices 20M emails/mo on ESSENTIALS at $3,000 (marginal tiers)", () => {
    // 10M @ $0.16/1K = $1,600, plus 10M @ $0.14/1K = $1,400.
    expect(monthlyCostForPlan("ESSENTIALS", 20_000_000)).toBe(3000);
  });

  it("prices 300K emails/mo on PRO at $171 (base + first-tier rate)", () => {
    // $105 base plus 300 * $0.22 = $66.
    expect(monthlyCostForPlan("PRO", 300_000)).toBe(171);
  });
});

describe("sendingCostForPlan", () => {
  it("does not round: one email on ESSENTIALS is $0.00016", () => {
    expect(sendingCostForPlan("ESSENTIALS", 1)).toBeCloseTo(0.000_16, 10);
  });

  it("excludes the base fee: zero emails on PRO cost nothing", () => {
    expect(sendingCostForPlan("PRO", 0)).toBe(0);
  });

  it("agrees with monthlyCostForPlan once base is added and cents are rounded", () => {
    for (const plan of SES_PRICING_PLANS) {
      for (const volume of [0, 1, 300_000, 20_000_000]) {
        expect(monthlyCostForPlan(plan, volume)).toBe(
          Math.round(
            (SES_PLAN_RATES[plan].monthlyBase +
              sendingCostForPlan(plan, volume)) *
              100
          ) / 100
        );
      }
    }
  });
});
