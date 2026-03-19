import { runDeferredCapturePostProcess } from "@/src/server/x-api-capture";

async function main() {
  const manifestPath = process.env.CAPTURE_MANIFEST_PATH;
  if (!manifestPath) {
    throw new Error("CAPTURE_MANIFEST_PATH is required");
  }

  const runStartedAtRaw = Number(process.env.CAPTURE_RUN_STARTED_AT_MS);
  const runStartedAt = Number.isFinite(runStartedAtRaw) ? runStartedAtRaw : Date.now();

  await runDeferredCapturePostProcess({
    manifestPath,
    runStartedAt,
    startUrl: process.env.CAPTURE_START_URL ?? null
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
