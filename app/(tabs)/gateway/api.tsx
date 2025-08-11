// gateway/api.ts
/* ========== Rotas e helpers ========== */
export const BASE_URL = "https://gateway-service-civz.onrender.com" as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RouteEntry = { path: string; method: HttpMethod };

export const routes = {
  users: {
    register: { path: "/api/users/register", method: "POST" } as RouteEntry,
    login:    { path: "/api/users/login",    method: "POST" } as RouteEntry,
    getById:  { path: "/api/users/:id",      method: "GET"  } as RouteEntry,
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

/* ========== Auth token & user cache ==========: */
let _authToken: string | null = null;
let _currentUser: User | null = null;

export function setAuthToken(token: string | null) { _authToken = token; }
export function getAuthToken() { return _authToken; }
export function clearAuthToken() { _authToken = null; _currentUser = null; }

export function setCurrentUser(u: User | null) { _currentUser = u; }
export function getCurrentUser() { return _currentUser; }

/* ========== Tipos ========== */
export type RegisterPayload = {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
  // alinhado ao backend: apenas estes dois valores
  tipo: "CONSULTOR" | "PROFISSIONAL";
  bio?: string;
  tags?: string[];
  /**
   * SUGESTÃO de nome base (sem extensão). O backend usa o NOME p/ gerar
   * <primeiroNome><uuid>.webp, e converte a imagem para .webp.
   */
  avatarUrl?: string;
};

export type UploadFile = {
  uri: string;      // file:/// ou content://
  name?: string;    // opcional (server renomeia)
  type?: string;    // image/jpeg, image/png, image/webp...
};

export type LoginPayload = { email: string; password: string };
export type LoginResponse = { token: string };

export type User = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  tipo: "CONSULTOR" | "PROFISSIONAL";
  bio?: string | null;
  tags?: string[] | null;
  avatarUrl?: string | null; // URL final no CDN (termina com .webp)
  data_criacao?: string;
};

type RequestOpts = {
  timeoutMs?: number;
  retries?: number;
  auth?: boolean;
};

/* ========== Utils ==========: */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
) {
  const { timeoutMs = 20000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...rest, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

function b64urlToString(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (b64url.length % 4)) % 4);
  if (typeof atob === "function") return decodeURIComponent(escape(atob(b64)));
  // @ts-ignore - RN fallback
  const buf = typeof Buffer !== "undefined" ? Buffer.from(b64, "base64") : null;
  return buf ? buf.toString("utf8") : "";
}

export function getUserIdFromToken(): string | null {
  if (!_authToken) return null;
  const parts = _authToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadStr = b64urlToString(parts[1]);
    const payload = JSON.parse(payloadStr || "{}");
    return payload.sub || payload.userId || payload.id || null;
  } catch { return null; }
}

async function getJson<TRes>(url: string, opts: RequestOpts = {}): Promise<TRes> {
  const attemptMax = Math.max(1, opts.retries ?? 1);
  let lastErr: any = null;
  for (let attempt = 1; attempt <= attemptMax; attempt++) {
    try {
      const headers: Record<string, string> = {};
      if (opts.auth && _authToken) headers.Authorization = `Bearer ${_authToken}`;
      const res = await fetchWithTimeout(url, { method: "GET", headers, timeoutMs: opts.timeoutMs ?? 20000 });
      const text = await res.text().catch(() => "");
      const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
      if (!res.ok) {
        if (res.status === 401 && _authToken) clearAuthToken();
        throw new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
      }
      return parsed as TRes;
    } catch (err) {
      lastErr = err;
      if (attempt >= attemptMax) break;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastErr ?? new Error("Falha desconhecida");
}

/* ====== Multipart helper ====== */
async function postMultipart<TRes>(url: string, form: FormData, opts: RequestOpts = {}): Promise<TRes> {
  const headers: Record<string, string> = {};
  if (opts.auth && _authToken) headers.Authorization = `Bearer ${_authToken}`;
  // NÃO setar Content-Type manualmente (RN define com boundary)
  const res = await fetchWithTimeout(url, { method: "POST", headers, body: form, timeoutMs: opts.timeoutMs ?? 25000 });
  const text = await res.text().catch(() => "");
  const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
  if (!res.ok) {
    if (res.status === 401 && _authToken) clearAuthToken();
    throw new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
  }
  return parsed as TRes;
}

/* ========== Endpoints ========== */
export async function registerUser(payload: RegisterPayload, file?: UploadFile) {
  const url = buildUrl(routes.users.register);

  // Envia SEMPRE multipart: "data" (JSON) + "avatar" (opcional)
  const form = new FormData();
  form.append("data", JSON.stringify(payload) as any);

  if (file?.uri) {
    form.append("avatar", {
      uri: file.uri,
      name: file.name || "upload",
      type: file.type || "application/octet-stream",
    } as any);
  }

  return postMultipart<any>(url, form, { timeoutMs: 25000, retries: 2 });
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const url = buildUrl(routes.users.login);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(payload), timeoutMs: 20000 });
  const text = await res.text().catch(() => "");
  const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
  if (!res.ok) throw new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
  const token = typeof parsed === "string" ? parsed : parsed?.token;
  if (!token) throw new Error("Resposta de login inválida");
  setAuthToken(token);
  await initCurrentUserFromToken().catch(() => void 0);
  return { token };
}

export async function getUserById(id: string) {
  const url = buildUrl(routes.users.getById, { id });
  return getJson<User>(url, { auth: true, timeoutMs: 15000, retries: 1 });
}

/** Decodifica o JWT, extrai o userId e popula o cache _currentUser */
export async function initCurrentUserFromToken(): Promise<User | null> {
  const id = getUserIdFromToken();
  if (!id) return null;
  const user = await getUserById(id);
  setCurrentUser(user);
  return user;
}
