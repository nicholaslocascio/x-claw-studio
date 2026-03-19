import { afterEach, describe, expect, it } from "vitest";
import { getComposeModelProvider, parseComposeJsonResponse } from "@/src/server/compose-model-cli";

describe("compose-model-cli", () => {
  afterEach(() => {
    delete process.env.COMPOSE_MODEL_PROVIDER;
  });

  it("defaults the compose provider to codex exec", () => {
    expect(getComposeModelProvider()).toBe("codex-exec");
  });

  it("accepts Gemini aliases when switching providers", () => {
    process.env.COMPOSE_MODEL_PROVIDER = "gemini";

    expect(getComposeModelProvider()).toBe("gemini-cli");
  });

  it("parses JSON nested in a response envelope", () => {
    const value = parseComposeJsonResponse(
      JSON.stringify({
        response: JSON.stringify({
          ok: true,
          provider: "codex"
        })
      }),
      (input) => input as { ok: boolean; provider: string }
    );

    expect(value).toEqual({
      ok: true,
      provider: "codex"
    });
  });
});
