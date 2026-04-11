function normalizeUrl(value: string | undefined, fallback: string) {
  const normalized = (value || fallback).trim();
  return normalized.replace(/\/+$/, "");
}

export const apiOrigin = normalizeUrl(
  import.meta.env.VITE_API_URL,
  "http://localhost:4000",
);

export const socketOrigin = normalizeUrl(
  import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL,
  "http://localhost:4000",
);

export const apiBaseUrl = `${apiOrigin}/api`;
