import { describe, expect, it } from "vitest";
import { scoreTrendDigestText } from "@/src/server/trend-quality";
import { loadTrendDigestExamples } from "@/src/server/trend-digest-examples";
import { parseTrendEvalCliArgs } from "@/src/cli/eval-trend-quality";

describe("scoreTrendDigestText", () => {
  it("rewards the intended stacked digest shape", () => {
    const summary = scoreTrendDigestText(`Do you understand what happened in the last 48 hours?

> Meta pivoted from metaverse theater into AI compute
> OpenAI widened the cloud power game again
> Google asked users to label the next slop dataset for free
> workers got the productivity memo and the weak raise in the same week

And people still think the weird part hasn't started.`);

    expect(summary.signals.openerQuestion).toBe(true);
    expect(summary.signals.stackedLines).toBe(true);
    expect(summary.signals.sufficientLines).toBe(true);
    expect(summary.signals.escalatingClose).toBe(true);
    expect(summary.passed).toBe(true);
  });

  it("penalizes soft analytical prose", () => {
    const summary = scoreTrendDigestText(
      "This week illustrates a broader shift in the AI ecosystem and highlights several downstream implications for platform strategy and labor markets."
    );

    expect(summary.signals.analyticalPenalty).toBe(true);
    expect(summary.passed).toBe(false);
  });
});

describe("trend digest examples", () => {
  it("loads the checked-in examples", () => {
    const examples = loadTrendDigestExamples();

    expect(examples.length).toBeGreaterThan(0);
    expect(examples[0]?.tweetText).toContain(">");
  });
});

describe("parseTrendEvalCliArgs", () => {
  it("uses the default output path", () => {
    const options = parseTrendEvalCliArgs([]);

    expect(options.outPath.endsWith("/tmp/trend-quality-eval.json")).toBe(true);
  });

  it("accepts example and json flags", () => {
    const options = parseTrendEvalCliArgs(["--example", "ai-chaos-window", "--json"]);

    expect(options.exampleId).toBe("ai-chaos-window");
    expect(options.json).toBe(true);
  });
});
