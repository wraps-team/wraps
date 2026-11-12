import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/fs.js", () => ({ ensurePulumiWorkDir: vi.fn() }));

import { WrapsError } from "../shared/errors.js";
import * as fsUtils from "../shared/fs.js";
import { getS3BackendUrl } from "../shared/s3-state.js";
import { requireAccountStateBackend } from "../shared/state-backend.js";

const ACCOUNT = "111111111111";
const REGION = "us-east-1";

function backendIs(url: string) {
  vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
    process.env.PULUMI_BACKEND_URL = url;
    return "/tmp/unused" as never;
  });
}

describe("requireAccountStateBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WRAPS_LOCAL_ONLY", "");
    vi.stubEnv("PULUMI_BACKEND_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves when the backend is this account's S3 bucket", async () => {
    backendIs(getS3BackendUrl(ACCOUNT, REGION));
    await expect(
      requireAccountStateBackend(ACCOUNT, REGION)
    ).resolves.toBeUndefined();
    expect(fsUtils.ensurePulumiWorkDir).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      region: REGION,
    });
  });

  it("throws on the local file backend, naming account and region", async () => {
    backendIs("file:///home/x/.wraps/pulumi");
    const error = await requireAccountStateBackend(ACCOUNT, REGION).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(WrapsError);
    expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
    expect(error.suggestion).toContain(`wraps-state-${ACCOUNT}-${REGION}`);
  });

  it("throws when the backend is another account's bucket", async () => {
    backendIs(getS3BackendUrl("222222222222", REGION));
    const error = await requireAccountStateBackend(ACCOUNT, REGION).catch(
      (e) => e
    );
    expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
  });

  it("allows file:// when WRAPS_LOCAL_ONLY=1", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    backendIs("file:///home/x/.wraps/pulumi");
    await expect(
      requireAccountStateBackend(ACCOUNT, REGION)
    ).resolves.toBeUndefined();
  });

  it("still throws when WRAPS_LOCAL_ONLY=true", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "true");
    backendIs("file:///home/x/.wraps/pulumi");
    const error = await requireAccountStateBackend(ACCOUNT, REGION).catch(
      (e) => e
    );
    expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
  });
});
