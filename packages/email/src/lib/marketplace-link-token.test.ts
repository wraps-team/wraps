import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateConfirmationToken } from "./confirmation-token";
import {
  generateMarketplaceLinkToken,
  verifyMarketplaceLinkToken,
} from "./marketplace-link-token";

beforeEach(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "test-secret-for-marketplace-link-tokens");
});

describe("marketplace link tokens", () => {
  it("round-trips a subscription id", async () => {
    const token = await generateMarketplaceLinkToken("sub-123");
    await expect(verifyMarketplaceLinkToken(token)).resolves.toEqual({
      sid: "sub-123",
      type: "marketplace-link",
    });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await generateMarketplaceLinkToken("sub-123");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "a-completely-different-secret");
    await expect(verifyMarketplaceLinkToken(token)).resolves.toBeNull();
  });

  it("rejects another token type signed with the SAME secret", async () => {
    // Every token in this codebase shares one secret, so the type marker is
    // the only thing stopping an unsubscribe link from linking a subscription.
    const confirmation = await generateConfirmationToken(
      "contact-1",
      "org-1",
      "topic-1"
    );
    await expect(verifyMarketplaceLinkToken(confirmation)).resolves.toBeNull();
  });

  it("rejects garbage without throwing", async () => {
    await expect(verifyMarketplaceLinkToken("not-a-jwt")).resolves.toBeNull();
    await expect(verifyMarketplaceLinkToken("")).resolves.toBeNull();
  });
});
