// gateway/api.ts
import { routes, buildUrl } from "./routes";

/* ========== Auth token & user cache (estado de módulo) ========== */
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
  tipo: "CONSULTOR" | "PROFISSIONAL" | "EMPRESA";
  bio?: string;
  tags?: string[];
  avatarUrl?: string;
};

export type LoginPayload = { email: string; password: string };
export type LoginResponse = { token: string };

export type User = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  tipo: "CONSULTOR" | "PROFISSIONAL" | "EMPRESA";
  bio?: string | null;
  tags?: string[] | null;
  avatar?: string | null; // base64 data URL ou URL; ajuste ao seu model
  data_criacao?: string;
};

type RequestOpts = {
  timeoutMs?: number;
  retries?: number;
  auth?: boolean;
};

/* ========== Utils: fetch/JSON/decoder ========== */
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
  // RN não tem atob por padrão; usa Buffer se disponível
  // @ts-ignore
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
    return payload.sub || payload.userId || payload.id || null; // tenta várias claims
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

async function postJson<TReq, TRes>(url: string, body: TReq, opts: RequestOpts = {}): Promise<TRes> {
  const attemptMax = Math.max(1, opts.retries ?? 1);
  let lastErr: any = null;
  for (let attempt = 1; attempt <= attemptMax; attempt++) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (opts.auth && _authToken) headers.Authorization = `Bearer ${_authToken}`;
      const res = await fetchWithTimeout(url, {
        method: "POST", headers, body: JSON.stringify(body), timeoutMs: opts.timeoutMs ?? 20000
      });
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

/* ========== Endpoints ========== */
export async function registerUser(payload: RegisterPayload) {
  const url = buildUrl(routes.users.register);
  return postJson<RegisterPayload, any>(url, payload, { timeoutMs: 25000, retries: 2 });
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const url = buildUrl(routes.users.login);
  const res = await postJson<LoginPayload, any>(url, payload, { timeoutMs: 20000, retries: 1 });
  const token = typeof res === "string" ? res : res?.token;
  if (!token) throw new Error("Resposta de login inválida");
  setAuthToken(token);
  // pós-login: tenta preencher _currentUser
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
