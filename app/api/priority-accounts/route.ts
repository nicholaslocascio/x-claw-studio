import { NextResponse } from "next/server";
import { formatPriorityAccountHandles, readPriorityAccountsConfig, writePriorityAccountsConfig } from "@/src/server/priority-accounts";

export async function GET() {
  const config = readPriorityAccountsConfig();
  return NextResponse.json({
    ...config,
    handles: formatPriorityAccountHandles(config)
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    enabled?: boolean;
    handles?: string;
  };

  const config = writePriorityAccountsConfig({
    enabled: body.enabled !== false,
    handles: body.handles ?? ""
  });

  return NextResponse.json({
    ...config,
    handles: formatPriorityAccountHandles(config)
  });
}
