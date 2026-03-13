import { describe, expect, it } from "vitest";
import { extractTweetIdFromStatusUrl, isXStatusUrl, normalizeXStatusUrl } from "@/src/lib/x-status-url";

describe("normalizeXStatusUrl", () => {
  it("normalizes x.com status URLs and strips query params", () => {
    expect(normalizeXStatusUrl("https://x.com/litteralyme0/status/2031185321342210442?t=abc")).toBe(
      "https://x.com/litteralyme0/status/2031185321342210442"
    );
  });

  it("normalizes twitter.com status URLs to x.com", () => {
    expect(normalizeXStatusUrl("https://twitter.com/litteralyme0/status/2031185321342210442")).toBe(
      "https://x.com/litteralyme0/status/2031185321342210442"
    );
  });

  it("rejects non-status URLs", () => {
    expect(normalizeXStatusUrl("https://x.com/home")).toBeNull();
    expect(isXStatusUrl("https://x.com/home")).toBe(false);
  });

  it("extracts the tweet id from a normalized status URL", () => {
    expect(extractTweetIdFromStatusUrl("https://x.com/litteralyme0/status/2031185321342210442?t=abc")).toBe(
      "2031185321342210442"
    );
  });
});
