import "@/src/lib/env";
import { runPriorityAccountsCapture } from "@/src/server/x-api-capture";

async function run(): Promise<void> {
  await runPriorityAccountsCapture({
    postProcessMode: "deferred"
  });
}

run().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
