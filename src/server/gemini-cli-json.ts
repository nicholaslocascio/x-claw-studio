import { parseComposeJsonResponse, runComposePromptWithProvider } from "@/src/server/compose-model-cli";

export const parseGeminiJsonResponse = parseComposeJsonResponse;

export async function runGeminiPrompt(prompt: string): Promise<string> {
  return runComposePromptWithProvider("gemini-cli", { prompt });
}
