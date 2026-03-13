import { NextResponse } from "next/server";
import { setActiveXAccount, upsertXAccountMetadata } from "@/src/server/x-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    accountId?: string;
    username?: string | null;
    userId?: string | null;
    label?: string | null;
    makeActive?: boolean;
  };

  if (!body.accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const store = upsertXAccountMetadata({
    accountId: body.accountId,
    username: body.username,
    userId: body.userId,
    label: body.label,
    makeActive: body.makeActive
  });
  return NextResponse.json(store);
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    accountId?: string;
  };
  if (!body.accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const store = setActiveXAccount(body.accountId);
  return NextResponse.json(store);
}
