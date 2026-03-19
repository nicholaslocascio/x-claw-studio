import "@/src/lib/env";
import { syncFacetSearchAssetIndex } from "@/src/server/chroma-facets";
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
  await syncFacetSearchAssetIndex({
    summaries: summaries.file.summaries,
    usages: data.tweetUsages,
    assetIds: summaries.touchedAssetIds
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
