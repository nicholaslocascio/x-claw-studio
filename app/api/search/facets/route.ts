import { NextResponse } from "next/server";
import { searchFacetIndex } from "@/src/server/chroma-facets";
import { logRouteError } from "@/src/server/api-error";
import { createPerfTrace } from "@/src/server/perf-log";

export async function GET(request: Request) {
  const routePerf = createPerfTrace("api:search/facets", {
    method: request.method
  });

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const facetName = searchParams.get("facetName") || undefined;
    const limit = Number(searchParams.get("limit") || 20);
    const highQualityOnly = searchParams.get("all") !== "1";
    const allFacetsMode = searchParams.get("allFacetsMode") === "facet_concat" ? "facet_concat" : "combined_blob";
    const hardMatchMode = searchParams.get("hardMatchMode") === "intent" ? "intent" : "off";

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    routePerf.mark("request_parsed", {
      facetName: facetName ?? null,
      limit,
      queryLength: query.length,
      highQualityOnly,
      allFacetsMode,
      hardMatchMode
    });
    const result = await searchFacetIndex({
      query,
      facetName: facetName as never,
      limit,
      highQualityOnly,
      allFacetsMode,
      hardMatchMode
    });
    routePerf.end({
      resultCount: result.results.length,
      vectorStatus: result.vectorStatus
    });

    return NextResponse.json(result);
  } catch (error) {
    routePerf.fail(error);
    const message = logRouteError("search/facets", request, error, "Unknown search error");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
