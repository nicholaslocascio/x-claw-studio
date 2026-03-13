export function normalizeXStatusUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (host !== "x.com" && host !== "twitter.com" && host !== "www.x.com" && host !== "www.twitter.com") {
      return null;
    }

    const path = url.pathname.replace(/\/+$/, "");
    if (!/^\/[^/]+\/status\/\d+$/.test(path)) {
      return null;
    }

    return `https://x.com${path}`;
  } catch {
    return null;
  }
}

export function isXStatusUrl(value: string | null | undefined): boolean {
  return normalizeXStatusUrl(value) !== null;
}

export function getPreferredXStatusUrl(value: string | null | undefined): string | null {
  const normalized = normalizeXStatusUrl(value);
  if (normalized) {
    return normalized;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function extractTweetIdFromStatusUrl(value: string | null | undefined): string | null {
  const normalized = normalizeXStatusUrl(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/\/status\/(\d+)$/);
  return match?.[1] ?? null;
}
