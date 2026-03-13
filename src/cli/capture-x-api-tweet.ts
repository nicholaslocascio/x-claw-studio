import "@/src/lib/env";
import { runXApiCapture } from "@/src/server/x-api-capture";

async function run(): Promise<void> {
  await runXApiCapture({
    mode: "tweet_lookup"
  });
}

run().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
