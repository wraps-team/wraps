import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displaySMSSDKUsage } from "../output.js";

describe("displaySMSSDKUsage", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("prints the real WrapsSMS API with the deployment region", () => {
    displaySMSSDKUsage("eu-west-1");

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("npm install @wraps.dev/sms");
    expect(output).toContain("import { WrapsSMS } from '@wraps.dev/sms'");
    expect(output).toContain(
      "const sms = new WrapsSMS({ region: 'eu-west-1' })"
    );
    expect(output).toContain("await sms.send(");
    expect(output).not.toContain("wraps.sms.send");
    expect(output).not.toContain("new Wraps(");
  });
});
