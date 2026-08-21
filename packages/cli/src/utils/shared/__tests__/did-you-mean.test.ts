import { describe, expect, it } from "vitest";
import { suggestCommand } from "../did-you-mean.js";

describe("suggestCommand", () => {
  it("suggests the nearest routed command for a one-character typo", () => {
    // "doctor" is passed explicitly: TOP_LEVEL_COMMANDS does not carry it
    // until cli.ts actually routes it.
    expect(suggestCommand("docter", ["destroy", "doctor", "email"])).toBe(
      "doctor"
    );
  });

  it("completes a truncated command by prefix, however short the stem", () => {
    expect(suggestCommand("stat")).toBe("status");
    // "com" is seven edits from "completion" — only the prefix rule reaches it.
    expect(suggestCommand("com")).toBe("completion");
  });

  it("still recognises a command shouted in capitals", () => {
    // Caps lock, or a command copied out of a doc that styles it uppercase.
    // Uppercase input prefix-matches nothing and sits a full token length
    // from every lowercase candidate, so without folding the case the user
    // gets silence — the exact failure this suggester exists to remove.
    expect(suggestCommand("DOCTER", ["destroy", "doctor", "email"])).toBe(
      "doctor"
    );
    expect(suggestCommand("STAT")).toBe("status");
  });

  it("resolves an ambiguous prefix to the shortest match", () => {
    // "s" prefixes selfhost, sms, status and support; the shortest wins, and
    // array order breaks a length tie.
    expect(suggestCommand("s")).toBe("sms");
  });

  it("guesses nothing for an empty command", () => {
    // Every candidate prefix-matches "", so the prefix rule would otherwise
    // answer a question the user did not ask.
    expect(suggestCommand("")).toBeNull();
  });

  it("never answers a command with itself", () => {
    // `wraps license` and `wraps selfhost` reach the unknown-command branch
    // whenever they are typed bare: cli.ts:1168 and :1195 both gate on
    // `&& subCommand`, and the global switch has no case for either. Echoing
    // the input back would advise re-running the command that just failed,
    // forever.
    expect(suggestCommand("license")).toBeNull();
    expect(suggestCommand("selfhost")).toBeNull();
  });

  it("stays silent rather than offering a distant guess", () => {
    expect(suggestCommand("xyzzy")).toBeNull();
  });

  it("reaches a typo that inserted or dropped a character", () => {
    // Both are one edit away, but the dropped character shifts every later
    // one, so a metric that compares positions instead of edits scores them
    // far past the threshold and gives up. Insertion and deletion typos are
    // the whole reason this uses Levenshtein.
    expect(suggestCommand("dstroy")).toBe("destroy");
    expect(suggestCommand("eail")).toBe("email");
  });

  it("reaches a transposed command name, the commonest typo of all", () => {
    // "destory" is two edits from "destroy" and prefix-matches nothing, so it
    // is only reachable at the inclusive edge of the threshold. Transposition
    // is the most common typing error there is — emial, stauts, conosle all
    // land here — so a threshold that stops at one edit guts the feature.
    expect(suggestCommand("destory")).toBe("destroy");
  });

  it("weighs every candidate rather than taking the first near one", () => {
    // Each of these has a nearer command sitting BEHIND a good-enough one in
    // TOP_LEVEL_COMMANDS: "aus" meets auth (2 edits) before aws (1), "bews"
    // meets aws (2) before news (1), "adn" meets aws (2) before cdn (1). A
    // suggester that returns the first candidate inside the threshold instead
    // of the closest passes every other test in this file and still answers
    // 175 of the 6456 one-edit typos with the wrong command.
    expect(suggestCommand("aus")).toBe("aws");
    expect(suggestCommand("bews")).toBe("news");
    expect(suggestCommand("adn")).toBe("cdn");
  });

  it("will not offer a destructive command three edits away", () => {
    // "deploy" is exactly three edits from "destroy". Guessing at that range
    // would answer a mistyped deploy with the command that tears the
    // infrastructure down, so the threshold stays at two.
    expect(suggestCommand("deploy")).toBeNull();
  });
});
