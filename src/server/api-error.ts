function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getRequestLabel(request: Request | undefined): string {
  if (!request) {
    return "unknown request";
  }

  try {
    const url = new URL(request.url);
    return `${request.method} ${url.pathname}`;
  } catch {
    return request.method;
  }
}

export function logRouteError(
  routeId: string,
  request: Request | undefined,
  error: unknown,
  fallback: string
): string {
  const message = getErrorMessage(error, fallback);
  const requestLabel = getRequestLabel(request);

  console.error(`[api:${routeId}] ${requestLabel} failed: ${message}`, error);
  return message;
}
