/**
 * Where the browser talks to the API.
 * Local and Docker: unset, so requests go through the Next.js rewrites (/api/nexus/*).
 * Vercel: set NEXT_PUBLIC_API_URL to the API's public URL so requests (and the event stream) go straight to it.
 */
const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

export const API_BASE = raw ? `${raw}/api` : "/api/nexus";
export const EVENT_STREAM_URL = raw ? `${raw}/api/events/stream` : "/api/events/stream";
