import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/src/lib/env";
import { exchangeXAuthorizationCode, getXPkceCookieNames } from "@/src/server/x-auth";

function redirectWithStatus(status: "connected" | "error", message?: string): NextResponse {
  const params = new URLSearchParams({ x_auth: status });
  if (message) {
    params.set("message", message);
  }

  return NextResponse.redirect(`${getAppBaseUrl()}/?${params.toString()}#run-control`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const cookieStore = await cookies();
  const names = getXPkceCookieNames();
  const savedState = cookieStore.get(names.state)?.value ?? null;
  const verifier = cookieStore.get(names.verifier)?.value ?? null;
  const username = cookieStore.get(names.username)?.value ?? null;
  const userId = cookieStore.get(names.userId)?.value ?? null;
  const label = cookieStore.get(names.label)?.value ?? null;

  cookieStore.delete(names.state);
  cookieStore.delete(names.verifier);
  cookieStore.delete(names.username);
  cookieStore.delete(names.userId);
  cookieStore.delete(names.label);

  if (error) {
    return redirectWithStatus("error", errorDescription ?? error);
  }

  if (!code || !state || !savedState || !verifier || state !== savedState) {
    return redirectWithStatus("error", "Invalid or expired X OAuth session. Try Connect X again.");
  }

  try {
    await exchangeXAuthorizationCode({
      code,
      codeVerifier: verifier,
      identity: {
        username,
        userId,
        label
      }
    });
    return redirectWithStatus("connected");
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : "X OAuth callback failed";
    return redirectWithStatus("error", message);
  }
}
