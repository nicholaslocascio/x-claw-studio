import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildXAuthorizationUrl, getXPkceCookieNames, getXOAuthConfigStatus } from "@/src/server/x-auth";

export async function GET(request: Request) {
  const config = getXOAuthConfigStatus();
  if (!config.configured) {
    return NextResponse.json(
      {
        error: `X OAuth is not configured. Missing: ${config.missing.join(", ")}`
      },
      { status: 500 }
    );
  }

  const { url, state, verifier } = buildXAuthorizationUrl();
  const requestUrl = new URL(request.url);
  const username = requestUrl.searchParams.get("username");
  const userId = requestUrl.searchParams.get("userId");
  const label = requestUrl.searchParams.get("label");
  const cookieStore = await cookies();
  const names = getXPkceCookieNames();

  cookieStore.set(names.state, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 10
  });
  cookieStore.set(names.verifier, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 10
  });
  cookieStore.set(names.username, username ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 10
  });
  cookieStore.set(names.userId, userId ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 10
  });
  cookieStore.set(names.label, label ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 10
  });

  return NextResponse.redirect(url);
}
