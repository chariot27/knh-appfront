export const BASE_URL = "https://gateway-service-civz.onrender.com" as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteEntry = {
  path: string;
  method: HttpMethod;
};

export const routes = {
  users: {
    register: { path: "/api/users/register", method: "POST" } as RouteEntry,
  },
} as const;

export function buildUrl(
  entry: RouteEntry | string,
  pathParams?: Record<string, string | number>,
  query?: Record<string, string | number | boolean | undefined | null>
) {
  let full = typeof entry === "string" ? entry : entry.path;

  if (pathParams) {
    Object.entries(pathParams).forEach(([k, v]) => {
      full = full.replace(`:${k}`, encodeURIComponent(String(v)));
    });
  }

  if (query) {
    const usp = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) usp.append(k, String(v));
    });
    const qs = usp.toString();
    if (qs) full += (full.includes("?") ? "&" : "?") + qs;
  }

  return `${BASE_URL}${full}`.replace(/([^:]\/)\/+/g, "$1");
}

export function getRouteMethod(entry: RouteEntry | string): HttpMethod {
  return typeof entry === "string" ? "GET" : entry.method;
}
