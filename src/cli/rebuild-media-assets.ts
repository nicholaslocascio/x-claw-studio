import "@/src/lib/env";
import { getDashboardData } from "@/src/server/data";
import { syncMediaAssetIndex, syncMediaAssetSummaries } from "@/src/server/media-assets";

async function main() {
  const data = getDashboardData();
  const indexSync = await syncMediaAssetIndex({
    usages: data.tweetUsages,
    manifests: data.manifests,
    forceFullRebuild: true
  });
  const summaries = syncMediaAssetSummaries({
    usages: data.tweetUsages,
    assetIndex: indexSync.index,
    forceFullRebuild: true
  });

  console.log(
    JSON.stringify(
      {
        assetCount: indexSync.index.assets.length,
        usageCount: data.tweetUsages.length,
        summaryCount: summaries.file.summaries.length,
        mode: indexSync.mode
      },
      null,
      2
    )
  );
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
