import { describe, expect, it } from "vitest";
import { looksTooAnalyticalForPost, looksTooGenericForReply, normalizeDraftStrings } from "@/src/server/prose-cleaner";

describe("prose cleaner", () => {
  it("normalizes smart punctuation", () => {
    expect(normalizeDraftStrings({ text: "it’s over..." })).toEqual({ text: "it's over..." });
  });

  it("flags analytical post voice", () => {
    expect(looksTooAnalyticalForPost("This changes workflow defaults and shifts the broader narrative downstream.")).toBe(true);
  });

  it("allows punchier post voice", () => {
    expect(looksTooAnalyticalForPost("spent two years hoarding GPUs just for this to run on a mac cpu")).toBe(false);
  });

  it("does not flag short fake-dialogue post voice as analytical", () => {
    expect(looksTooAnalyticalForPost("did you check the drive link on slack from two weeks ago? no, bro? guess i'll keep clicking.")).toBe(
      false
    );
  });

  it("flags generic short replies that are detached from the source scene", () => {
    expect(looksTooGenericForReply("suddenly i am very passionate about the q3 deliverables", "\"I hate this job\" *gets paid*")).toBe(
      true
    );
  });

  it("allows short replies that anchor into a concrete trigger", () => {
    expect(looksTooGenericForReply("direct deposit hit and now the laptop isn't even that loud", "\"I hate this job\" *gets paid*")).toBe(
      false
    );
  });
});
