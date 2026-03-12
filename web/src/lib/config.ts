/**
 * Shared URL configuration for API and WebSocket clients.
 * Handles OrbStack domains, Docker internal networking, and localhost fallback.
 */

function getHostname(): string | null {
  if (typeof window !== "undefined") {
    return window.location.hostname;
  }
  return null;
}

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  const hostname = getHostname();
  if (hostname) {
    if (hostname.endsWith(".orb.local")) {
      return "http://swe-api.swe.orb.local";
    }
    return "http://localhost:8080";
  }

  // Server-side: Docker internal network
  return "http://swe-api:8080";
}

export function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;

  const hostname = getHostname();
  if (hostname) {
    if (hostname.endsWith(".orb.local")) {
      return "ws://swe-api.swe.orb.local/ws/stream";
    }
    return "ws://localhost:8080/ws/stream";
  }

  return "ws://swe-api:8080/ws/stream";
}
