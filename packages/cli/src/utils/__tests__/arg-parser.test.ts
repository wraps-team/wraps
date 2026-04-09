import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../shared/arg-parser.js";

/**
 * argv helper: prepends the fake node + script entries that `process.argv`
 * always includes, so tests only need to write the user-visible args.
 */
const argv = (...args: string[]) => ["node", "wraps", ...args];

describe("parseCliArgs", () => {
  describe("wraps-team/wraps#100 — positional after boolean flag", () => {
    it("treats the slug after --force as a positional, not a flag value", () => {
      const { flags, sub } = parseCliArgs(
        argv(
          "email",
          "templates",
          "push",
          "--force",
          "reengagement-activate-account"
        )
      );
      expect(flags.force).toBe(true);
      expect(sub).toContain("reengagement-activate-account");
      // The slug is NOT silently swallowed into the --force flag
      expect(sub).toEqual([
        "email",
        "templates",
        "push",
        "reengagement-activate-account",
      ]);
    });

    it("treats the slug after -f as a positional, not a flag value", () => {
      const { flags, sub } = parseCliArgs(
        argv(
          "email",
          "templates",
          "push",
          "-f",
          "reengagement-activate-account"
        )
      );
      expect(flags.force).toBe(true);
      expect(sub).toContain("reengagement-activate-account");
    });

    it("accepts --template <slug> --force in any order", () => {
      const case1 = parseCliArgs(
        argv("email", "templates", "push", "--template", "welcome", "--force")
      );
      expect(case1.flags.force).toBe(true);
      expect(case1.flags.template).toBe("welcome");

      const case2 = parseCliArgs(
        argv("email", "templates", "push", "--force", "--template", "welcome")
      );
      expect(case2.flags.force).toBe(true);
      expect(case2.flags.template).toBe("welcome");
    });

    it("does not swallow positionals for --yes or other booleans either", () => {
      const { flags, sub } = parseCliArgs(
        argv("email", "destroy", "--yes", "some-other-arg")
      );
      expect(flags.yes).toBe(true);
      expect(sub).toEqual(["email", "destroy", "some-other-arg"]);
    });
  });

  describe("positional commands", () => {
    it("parses wraps email check <domain> with domain as positional", () => {
      const { sub } = parseCliArgs(argv("email", "check", "example.com"));
      expect(sub).toEqual(["email", "check", "example.com"]);
    });

    it("collects inbound subcommand as third positional", () => {
      const { flags, sub } = parseCliArgs(
        argv("email", "inbound", "status", "--region", "us-east-1")
      );
      expect(sub).toEqual(["email", "inbound", "status"]);
      expect(flags.region).toBe("us-east-1");
    });

    it("returns empty sub when no positionals provided", () => {
      const { sub } = parseCliArgs(argv());
      expect(sub).toEqual([]);
    });
  });

  describe("value flags", () => {
    it("parses --provider vercel", () => {
      const { flags } = parseCliArgs(
        argv("email", "init", "--provider", "vercel")
      );
      expect(flags.provider).toBe("vercel");
    });

    it("parses -p alias for provider", () => {
      const { flags } = parseCliArgs(argv("email", "init", "-p", "vercel"));
      expect(flags.provider).toBe("vercel");
    });

    it("parses -d alias for domain", () => {
      const { flags } = parseCliArgs(
        argv("email", "verify", "-d", "example.com")
      );
      expect(flags.domain).toBe("example.com");
    });

    it("parses --dkim-selector with kebab case", () => {
      const { flags } = parseCliArgs(
        argv("email", "check", "--dkim-selector", "selector1")
      );
      expect(flags.dkimSelector).toBe("selector1");
    });

    it("parses --phone-number with kebab case", () => {
      const { flags } = parseCliArgs(
        argv("sms", "verify-number", "--phone-number", "+15555551234")
      );
      expect(flags.phoneNumber).toBe("+15555551234");
    });

    it("parses --phoneNumber with camelCase", () => {
      const { flags } = parseCliArgs(
        argv("sms", "verify-number", "--phoneNumber", "+15555551234")
      );
      expect(flags.phoneNumber).toBe("+15555551234");
    });

    it("parses --dkimSelector with camelCase", () => {
      const { flags } = parseCliArgs(
        argv("email", "check", "--dkimSelector", "selector1")
      );
      expect(flags.dkimSelector).toBe("selector1");
    });
  });

  describe("boolean flags", () => {
    it("parses multiple boolean flags", () => {
      const { flags } = parseCliArgs(
        argv("email", "check", "--skip-tls", "--skip-blacklists", "--verbose")
      );
      expect(flags.skipTls).toBe(true);
      expect(flags.skipBlacklists).toBe(true);
      expect(flags.verbose).toBe(true);
    });

    it("parses camelCase boolean flags", () => {
      const { flags } = parseCliArgs(
        argv("email", "check", "--skipTls", "--skipBlacklists")
      );
      expect(flags.skipTls).toBe(true);
      expect(flags.skipBlacklists).toBe(true);
    });

    it("parses --dry-run as dryRun", () => {
      const { flags } = parseCliArgs(
        argv("email", "templates", "push", "--dry-run")
      );
      expect(flags.dryRun).toBe(true);
    });

    it("parses --dryRun as dryRun", () => {
      const { flags } = parseCliArgs(
        argv("email", "templates", "push", "--dryRun")
      );
      expect(flags.dryRun).toBe(true);
    });

    it("parses -j alias for json", () => {
      const { flags } = parseCliArgs(argv("email", "status", "-j"));
      expect(flags.json).toBe(true);
    });

    it("parses -q alias for quick", () => {
      const { flags } = parseCliArgs(argv("email", "check", "-q"));
      expect(flags.quick).toBe(true);
    });

    it("parses -w alias for wait", () => {
      const { flags } = parseCliArgs(argv("email", "verify", "-w"));
      expect(flags.wait).toBe(true);
    });

    it("omits boolean flags when not passed", () => {
      const { flags } = parseCliArgs(argv("email", "status"));
      expect(flags.force).toBeUndefined();
      expect(flags.yes).toBeUndefined();
      expect(flags.preview).toBeUndefined();
    });
  });

  describe("negated boolean flags", () => {
    it("parses --no-open as noOpen=true", () => {
      const { flags } = parseCliArgs(argv("console", "--no-open"));
      expect(flags.noOpen).toBe(true);
    });

    it("parses --no-example as noExample=true", () => {
      const { flags } = parseCliArgs(
        argv("email", "templates", "init", "--no-example")
      );
      expect(flags.noExample).toBe(true);
    });

    it("parses --no-claude as noClaude=true", () => {
      const { flags } = parseCliArgs(
        argv("email", "templates", "init", "--no-claude")
      );
      expect(flags.noClaude).toBe(true);
    });

    it("parses --noOpen as noOpen=true", () => {
      const { flags } = parseCliArgs(argv("console", "--noOpen"));
      expect(flags.noOpen).toBe(true);
    });

    it("parses --noExample as noExample=true", () => {
      const { flags } = parseCliArgs(
        argv("email", "templates", "init", "--noExample")
      );
      expect(flags.noExample).toBe(true);
    });

    it("parses --noClaude as noClaude=true", () => {
      const { flags } = parseCliArgs(
        argv("email", "templates", "init", "--noClaude")
      );
      expect(flags.noClaude).toBe(true);
    });

    it("leaves noOpen undefined when flag is absent", () => {
      const { flags } = parseCliArgs(argv("console"));
      expect(flags.noOpen).toBeUndefined();
    });
  });

  describe("short-form duplicates", () => {
    it("does not expose single-letter keys in the flags bag", () => {
      const { flags } = parseCliArgs(
        argv("email", "init", "-p", "vercel", "-r", "us-east-1", "-f")
      );
      expect(flags.provider).toBe("vercel");
      expect(flags.region).toBe("us-east-1");
      expect(flags.force).toBe(true);
      // No short-form leakage
      expect((flags as Record<string, unknown>).p).toBeUndefined();
      expect((flags as Record<string, unknown>).r).toBeUndefined();
      expect((flags as Record<string, unknown>).f).toBeUndefined();
    });
  });

  describe("complex real-world scenarios", () => {
    it("full email init command", () => {
      const { flags, sub } = parseCliArgs(
        argv(
          "email",
          "init",
          "--provider",
          "vercel",
          "--region",
          "us-east-1",
          "--domain",
          "example.com",
          "--preset",
          "production",
          "--yes"
        )
      );
      expect(sub).toEqual(["email", "init"]);
      expect(flags.provider).toBe("vercel");
      expect(flags.region).toBe("us-east-1");
      expect(flags.domain).toBe("example.com");
      expect(flags.preset).toBe("production");
      expect(flags.yes).toBe(true);
    });

    it("templates push with --force and --dry-run and --template filter", () => {
      const { flags, sub } = parseCliArgs(
        argv(
          "email",
          "templates",
          "push",
          "--template",
          "welcome",
          "--dry-run",
          "--force"
        )
      );
      expect(sub).toEqual(["email", "templates", "push"]);
      expect(flags.template).toBe("welcome");
      expect(flags.dryRun).toBe(true);
      expect(flags.force).toBe(true);
    });

    it("wraps push alias with --force and positional slug (the #100 repro)", () => {
      const { flags, sub } = parseCliArgs(
        argv("push", "--force", "reengagement-activate-account")
      );
      expect(flags.force).toBe(true);
      expect(sub).toEqual(["push", "reengagement-activate-account"]);
    });
  });
});
