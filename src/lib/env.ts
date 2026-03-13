import dotenv from "dotenv";

let loaded = false;

export function loadEnv(): void {
  if (loaded) {
    return;
  }

  dotenv.config({ quiet: true });
  loaded = true;
}

export function getGeminiApiKey(): string {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is required");
  }
  return apiKey;
}

export function getTypefullyApiKey(): string {
  loadEnv();
  const apiKey = process.env.TYPEFULLY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TYPEFULLY_API_KEY is required");
  }
  return apiKey;
}

export function getTypefullyDefaultSocialSetId(): number | null {
  loadEnv();
  const rawValue = process.env.TYPEFULLY_SOCIAL_SET_ID?.trim();
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getXApiBearerToken(): string {
  loadEnv();
  const token = process.env.X_BEARER_TOKEN?.trim();
  if (!token) {
    throw new Error("X_BEARER_TOKEN is required");
  }

  return token;
}

export function getXApiBaseUrl(): string {
  loadEnv();
  const baseUrl = process.env.X_API_BASE_URL?.trim() || "https://api.x.com";
  return baseUrl.replace(/\/+$/, "");
}

export function getXApiUserId(): string | null {
  loadEnv();
  const userId = process.env.X_USER_ID?.trim();
  return userId || null;
}

export function getXOAuthClientId(): string {
  loadEnv();
  const clientId = process.env.X_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("X_CLIENT_ID is required");
  }

  return clientId;
}

export function getXOAuthClientSecret(): string | null {
  loadEnv();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim() || process.env.X_SECRET_KEY?.trim();
  return clientSecret || null;
}

export function getAppBaseUrl(): string {
  loadEnv();
  const baseUrl = process.env.APP_BASE_URL?.trim() || "http://localhost:4105";
  return baseUrl.replace(/\/+$/, "");
}

export function getXOAuthRedirectUri(): string {
  loadEnv();
  const redirectUri = process.env.X_OAUTH_REDIRECT_URI?.trim();
  return redirectUri || `${getAppBaseUrl()}/api/x/oauth/callback`;
}
