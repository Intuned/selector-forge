import { describe, expect, it } from "vitest";
import {
  collapseExtensionUrls,
  normalizeError,
  sanitizeMeasurements,
  sanitizeProperties,
  scrubUrlToHost,
} from "../../../lib/telemetry/scrub";

describe("scrubUrlToHost", () => {
  it("reduces a URL to host only, dropping path/query/hash", () => {
    expect(
      scrubUrlToHost("https://app.intuned.io/api/selectors/create?wid=secret#x")
    ).toBe("app.intuned.io");
  });

  it("returns a placeholder for non-URLs", () => {
    expect(scrubUrlToHost("not a url")).toBe("invalid-url");
  });
});

describe("collapseExtensionUrls", () => {
  it("collapses chrome- and moz-extension origins to a stable token", () => {
    const stack =
      "at f (chrome-extension://abcdefghabcdefghabcdefghabcdefgh/content.js:1:2)\n" +
      "at g (moz-extension://1234-5678/background.js:3:4)";
    const out = collapseExtensionUrls(stack);
    expect(out).not.toContain("abcdefghabcdefghabcdefghabcdefgh");
    expect(out).toContain("extension://content.js:1:2");
    expect(out).toContain("extension://background.js:3:4");
  });
});

describe("normalizeError", () => {
  it("normalizes an Error and collapses extension urls in the stack", () => {
    const err = new TypeError("boom");
    err.stack = "TypeError: boom\n at chrome-extension://aaaa/bg.js:1:1";
    const out = normalizeError(err);
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe("boom");
    expect(out.stack).toContain("extension://bg.js");
    expect(out.stack).not.toContain("chrome-extension://aaaa");
  });

  it("handles thrown strings and non-error values", () => {
    expect(normalizeError("oops").message).toBe("oops");
    expect(normalizeError({ a: 1 }).name).toBe("NonError");
  });
});

describe("sanitizeProperties", () => {
  it("drops keys not in the allow-list and keeps allowed ones", () => {
    const out = sanitizeProperties({
      command: "bg:startAgent",
      email: "user@example.com", // not allow-listed -> dropped
      mode: "single",
    });
    expect(out).toEqual({ command: "bg:startAgent", mode: "single" });
    expect(out).not.toHaveProperty("email");
  });

  it("collapses extension urls inside property values", () => {
    const out = sanitizeProperties({
      context: "failed at chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh/x.js",
    });
    expect(out?.context).toContain("extension://x.js");
    expect(out?.context).not.toContain("aaaabbbbccccddddeeeeffffgggghhhh");
  });

  it("caps over-long values at 8192 chars", () => {
    const out = sanitizeProperties({ host: "x".repeat(9000) });
    expect(out?.host).toHaveLength(8192);
  });

  it("drops allow-listed keys whose value is null/undefined", () => {
    const out = sanitizeProperties({
      host: "app.intuned.io",
      pathname: null as unknown as string,
      method: undefined as unknown as string,
    });
    expect(out).toEqual({ host: "app.intuned.io" });
  });

  it("coerces non-string allowed values to strings", () => {
    const out = sanitizeProperties({ ok: true as unknown as string });
    expect(out?.ok).toBe("true");
  });

  it("returns undefined when nothing survives", () => {
    expect(sanitizeProperties({ email: "a@b.c" })).toBeUndefined();
    expect(sanitizeProperties(undefined)).toBeUndefined();
  });
});

describe("sanitizeMeasurements", () => {
  it("keeps finite numbers and drops the rest", () => {
    expect(
      sanitizeMeasurements({ durationMs: 12, bad: NaN, inf: Infinity })
    ).toEqual({ durationMs: 12 });
    expect(sanitizeMeasurements(undefined)).toBeUndefined();
  });
});
