import { NextResponse } from "next/server";
import { ensureValidXUserAuth, getXOAuthConfigStatus, readXAuthStore } from "@/src/server/x-auth";

function toPublicAccount(account: {
  accountId: string;
  label: string | null;
  username: string | null;
  userId: string | null;
  expiresAt: string | null;
  scope: string;
}) {
  return {
    accountId: account.accountId,
    label: account.label,
    username: account.username,
    userId: account.userId,
    expiresAt: account.expiresAt,
    scope: account.scope
  };
}

export async function GET() {
  const config = getXOAuthConfigStatus();
  let store = readXAuthStore();

  try {
    const refreshed = await ensureValidXUserAuth();
    if (refreshed) {
      store = readXAuthStore();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh X auth";
    return NextResponse.json({
      ...config,
      connected: store.accounts.length > 0,
      error: message,
      activeAccountId: store.activeAccountId,
      auth: store.accounts.find((account) => account.accountId === store.activeAccountId)
        ? toPublicAccount(store.accounts.find((account) => account.accountId === store.activeAccountId)!)
        : null,
      accounts: store.accounts.map((account) => toPublicAccount(account))
    });
  }

  const activeAccount = store.accounts.find((account) => account.accountId === store.activeAccountId) ?? null;
  return NextResponse.json({
    ...config,
    connected: store.accounts.length > 0,
    activeAccountId: store.activeAccountId,
    auth: activeAccount ? toPublicAccount(activeAccount) : null,
    accounts: store.accounts.map((account) => toPublicAccount(account)),
    error: null
  });
}
