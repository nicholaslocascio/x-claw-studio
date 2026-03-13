import { NextResponse } from "next/server";
import { clearXAuthRecord } from "@/src/server/x-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { accountId?: string | null } | null;
  const store = clearXAuthRecord(body?.accountId ?? null);
  return NextResponse.json({ ok: true, store });
}
