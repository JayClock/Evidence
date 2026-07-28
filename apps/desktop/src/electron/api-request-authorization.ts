export function authorizedApiRequestHeaders(
  requestUrl: string,
  requestHeaders: Record<string, string>,
  apiBaseUrl: string,
  authorization: string | undefined,
): Record<string, string> {
  if (!authorization || !isWithinApiRoot(requestUrl, apiBaseUrl)) {
    return requestHeaders;
  }

  const headers = Object.fromEntries(
    Object.entries(requestHeaders).filter(
      ([name]) => name.toLowerCase() !== 'authorization',
    ),
  );
  headers.Authorization = authorization;
  return headers;
}

function isWithinApiRoot(requestUrl: string, apiBaseUrl: string): boolean {
  const request = new URL(requestUrl);
  const api = new URL(apiBaseUrl);
  if (request.origin !== api.origin) {
    return false;
  }
  const apiPath = api.pathname.replace(/\/+$/, '') || '/';
  return (
    request.pathname === apiPath || request.pathname.startsWith(`${apiPath}/`)
  );
}
