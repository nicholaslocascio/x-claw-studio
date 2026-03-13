import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getAppBaseUrl,
  getXApiBearerToken,
  getXOAuthClientId,
  getXOAuthClientSecret,
  getXOAuthRedirectUri
} from "@/src/lib/env";
import { ensureDir, writeJson } from "@/src/lib/fs";

const projectRoot = process.cwd();
const controlDir = path.join(projectRoot, "data", "control");
const authPath = path.join(controlDir, "x-auth.json");
const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const PKCE_COOKIE_STATE = "x_oauth_state";
const PKCE_COOKIE_VERIFIER = "x_oauth_verifier";
const PKCE_COOKIE_USERNAME = "x_oauth_username";
const PKCE_COOKIE_USER_ID = "x_oauth_user_id";
const PKCE_COOKIE_LABEL = "x_oauth_label";
const PKCE_SCOPE = ["tweet.read", "users.read", "offline.access"].join(" ");
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface XUserAuthRecord {
  accountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string;
  expiresAt: string | null;
  obtainedAt: string;
  userId: string | null;
  username: string | null;
  name: string | null;
  label: string | null;
}

interface XAuthStore {
  activeAccountId: string | null;
  accounts: XUserAuthRecord[];
}

interface XTokenResponse {
  token_type: string;
  expires_in?: number;
  access_token: string;
  scope?: string;
  refresh_token?: string;
}

interface XMeResponse {
  data?: {
    id?: string;
    username?: string;
    name?: string;
  };
}

export interface XAccountIdentityInput {
  username?: string | null;
  userId?: string | null;
  label?: string | null;
}

interface XAccountIdentity {
  username: string | null;
  userId: string | null;
  label: string | null;
}

function normalizeIdentity(input?: XAccountIdentityInput | null): XAccountIdentity {
  const username = input?.username?.trim().replace(/^@/, "") || null;
  const userId = input?.userId?.trim() || null;
  const label = input?.label?.trim() || null;
  return { username, userId, label };
}

function slugifyAccountId(identity: XAccountIdentity, fallbackSeed: string): string {
  const preferred = identity.username || identity.userId || fallbackSeed;
  return preferred.toLowerCase().replace(/[^a-z0-9_]+/g, "-");
}

export function getXPkceCookieNames(): {
  state: string;
  verifier: string;
  username: string;
  userId: string;
  label: string;
} {
  return {
    state: PKCE_COOKIE_STATE,
    verifier: PKCE_COOKIE_VERIFIER,
    username: PKCE_COOKIE_USERNAME,
    userId: PKCE_COOKIE_USER_ID,
    label: PKCE_COOKIE_LABEL
  };
}

export function getXOAuthConfigStatus(): {
  configured: boolean;
  appBaseUrl: string;
  redirectUri: string;
  missing: string[];
} {
  const missing: string[] = [];
  try {
    getXOAuthClientId();
  } catch {
    missing.push("X_CLIENT_ID");
  }

  return {
    configured: missing.length === 0,
    appBaseUrl: getAppBaseUrl(),
    redirectUri: getXOAuthRedirectUri(),
    missing
  };
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function randomBase64Url(size: number): string {
  return crypto.randomBytes(size).toString("base64url");
}

function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) {
    return false;
  }

  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return parsed <= Date.now() + TOKEN_REFRESH_SKEW_MS;
}

function buildDefaultLabel(identity: XAccountIdentity, profile: XMeResponse["data"] | undefined): string | null {
  return identity.label ?? identity.username ?? profile?.username ?? profile?.name ?? identity.userId ?? profile?.id ?? null;
}

function buildTokenRecord(
  response: XTokenResponse,
  profile: XMeResponse["data"] | undefined,
  previous: XUserAuthRecord | null = null,
  identityInput?: XAccountIdentityInput | null
): XUserAuthRecord {
  const identity = normalizeIdentity(identityInput);
  const accountId = previous?.accountId ?? slugifyAccountId(identity, randomBase64Url(6));

  return {
    accountId,
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    tokenType: response.token_type,
    scope: response.scope ?? previous?.scope ?? PKCE_SCOPE,
    expiresAt:
      typeof response.expires_in === "number"
        ? new Date(Date.now() + response.expires_in * 1000).toISOString()
        : previous?.expiresAt ?? null,
    obtainedAt: new Date().toISOString(),
    userId: identity.userId ?? profile?.id ?? previous?.userId ?? null,
    username: identity.username ?? profile?.username ?? previous?.username ?? null,
    name: profile?.name ?? previous?.name ?? null,
    label: buildDefaultLabel(identity, profile) ?? previous?.label ?? null
  };
}

function migrateAuthStore(raw: unknown): XAuthStore {
  if (!raw || typeof raw !== "object") {
    return {
      activeAccountId: null,
      accounts: []
    };
  }

  const maybeStore = raw as Partial<XAuthStore> & Partial<XUserAuthRecord>;
  if (Array.isArray(maybeStore.accounts)) {
    const accounts = maybeStore.accounts.filter(Boolean) as XUserAuthRecord[];
    return {
      activeAccountId: maybeStore.activeAccountId ?? accounts[0]?.accountId ?? null,
      accounts
    };
  }

  if ("accessToken" in maybeStore && typeof maybeStore.accessToken === "string") {
    const legacy = maybeStore as XUserAuthRecord;
    const accountId = legacy.accountId ?? slugifyAccountId(
      {
        username: legacy.username,
        userId: legacy.userId,
        label: legacy.label
      },
      "default"
    );
    const migrated: XUserAuthRecord = {
      ...legacy,
      accountId,
      label: legacy.label ?? legacy.username ?? legacy.userId ?? "Connected X account"
    };
    return {
      activeAccountId: accountId,
      accounts: [migrated]
    };
  }

  return {
    activeAccountId: null,
    accounts: []
  };
}

function writeAuthStore(store: XAuthStore): XAuthStore {
  ensureDir(controlDir);
  writeJson(authPath, store);
  return store;
}

function readAuthStore(): XAuthStore {
  return migrateAuthStore(readJsonFile<unknown>(authPath));
}

async function postTokenForm(body: URLSearchParams): Promise<XTokenResponse> {
  const clientId = getXOAuthClientId();
  const clientSecret = getXOAuthClientSecret();
  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(clientSecret
        ? {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
          }
        : {})
    },
    body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      typeof data?.error_description === "string"
        ? data.error_description
        : typeof data?.detail === "string"
          ? data.detail
          : `X token exchange failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as XTokenResponse;
}

async function fetchAuthenticatedProfile(accessToken: string): Promise<XMeResponse["data"]> {
  const response = await fetch("https://api.x.com/2/users/me?user.fields=id,name,username", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as XMeResponse) : null;
  if (!response.ok) {
    throw new Error(data && "data" in data ? "X user lookup failed" : `X user lookup failed with status ${response.status}`);
  }

  return data?.data;
}

async function fetchAuthenticatedProfileSafe(accessToken: string): Promise<XMeResponse["data"]> {
  try {
    return await fetchAuthenticatedProfile(accessToken);
  } catch (error) {
    console.warn(
      error instanceof Error
        ? `X profile lookup failed during OAuth setup: ${error.message}`
        : "X profile lookup failed during OAuth setup."
    );
    return undefined;
  }
}

export function buildXAuthorizationUrl(): {
  url: string;
  state: string;
  verifier: string;
} {
  const state = randomBase64Url(24);
  const verifier = randomBase64Url(48);
  const challenge = sha256Base64Url(verifier);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getXOAuthClientId(),
    redirect_uri: getXOAuthRedirectUri(),
    scope: PKCE_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  return {
    url: `${X_AUTHORIZE_URL}?${params.toString()}`,
    state,
    verifier
  };
}

export function readXAuthStore(): XAuthStore {
  return readAuthStore();
}

export function readXAuthRecord(accountId?: string | null): XUserAuthRecord | null {
  const store = readAuthStore();
  if (!store.activeAccountId && !accountId) {
    return store.accounts[0] ?? null;
  }

  const desiredAccountId = accountId ?? store.activeAccountId;
  return store.accounts.find((account) => account.accountId === desiredAccountId) ?? null;
}

export function setActiveXAccount(accountId: string): XAuthStore {
  const store = readAuthStore();
  if (!store.accounts.some((account) => account.accountId === accountId)) {
    throw new Error(`Unknown X account ${accountId}`);
  }

  return writeAuthStore({
    ...store,
    activeAccountId: accountId
  });
}

export function upsertXAccountMetadata(input: {
  accountId: string;
  username?: string | null;
  userId?: string | null;
  label?: string | null;
  makeActive?: boolean;
}): XAuthStore {
  const store = readAuthStore();
  let found = false;
  const accounts = store.accounts.map((account) => {
    if (account.accountId !== input.accountId) {
      return account;
    }

    found = true;
    return {
      ...account,
      username: input.username?.trim().replace(/^@/, "") || account.username,
      userId: input.userId?.trim() || account.userId,
      label: input.label?.trim() || account.label
    };
  });

  if (!found) {
    throw new Error(`Unknown X account ${input.accountId}`);
  }

  return writeAuthStore({
    activeAccountId: input.makeActive ? input.accountId : store.activeAccountId,
    accounts
  });
}

export function clearXAuthRecord(accountId?: string | null): XAuthStore {
  if (!fs.existsSync(authPath)) {
    return {
      activeAccountId: null,
      accounts: []
    };
  }

  if (!accountId) {
    fs.unlinkSync(authPath);
    return {
      activeAccountId: null,
      accounts: []
    };
  }

  const store = readAuthStore();
  const accounts = store.accounts.filter((account) => account.accountId !== accountId);
  return writeAuthStore({
    activeAccountId:
      store.activeAccountId === accountId
        ? accounts[0]?.accountId ?? null
        : store.activeAccountId,
    accounts
  });
}

export async function exchangeXAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  identity?: XAccountIdentityInput | null;
}): Promise<XUserAuthRecord> {
  const body = new URLSearchParams({
    code: input.code,
    grant_type: "authorization_code",
    client_id: getXOAuthClientId(),
    redirect_uri: getXOAuthRedirectUri(),
    code_verifier: input.codeVerifier
  });
  const token = await postTokenForm(body);
  const profile = await fetchAuthenticatedProfileSafe(token.access_token);
  const store = readAuthStore();
  const identity = normalizeIdentity(input.identity);
  const existing =
    store.accounts.find((account) => (identity.username ? account.username === identity.username : false)) ??
    store.accounts.find((account) => (identity.userId ? account.userId === identity.userId : false)) ??
    null;
  const record = buildTokenRecord(token, profile, existing, input.identity);
  const accounts = [...store.accounts.filter((account) => account.accountId !== record.accountId), record];
  writeAuthStore({
    activeAccountId: record.accountId,
    accounts
  });
  return record;
}

export async function refreshXUserAccessToken(record: XUserAuthRecord): Promise<XUserAuthRecord> {
  if (!record.refreshToken) {
    throw new Error("No X refresh token is available. Reconnect X from the dashboard.");
  }

  const body = new URLSearchParams({
    refresh_token: record.refreshToken,
    grant_type: "refresh_token",
    client_id: getXOAuthClientId()
  });
  const token = await postTokenForm(body);
  const profile = await fetchAuthenticatedProfileSafe(token.access_token);
  const refreshed = buildTokenRecord(token, profile, record, {
    username: record.username,
    userId: record.userId,
    label: record.label
  });
  const store = readAuthStore();
  const accounts = [...store.accounts.filter((account) => account.accountId !== refreshed.accountId), refreshed];
  writeAuthStore({
    activeAccountId: store.activeAccountId ?? refreshed.accountId,
    accounts
  });
  return refreshed;
}

export async function ensureValidXUserAuth(accountId?: string | null): Promise<XUserAuthRecord | null> {
  const record = readXAuthRecord(accountId);
  if (!record) {
    return null;
  }

  if (!isExpired(record.expiresAt)) {
    return record;
  }

  return refreshXUserAccessToken(record);
}

export async function getXAccessTokenForApi(): Promise<string> {
  const saved = await ensureValidXUserAuth();
  if (saved?.accessToken) {
    return saved.accessToken;
  }

  return getXApiBearerToken();
}
