// src/lib/api.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ========== Base/rotas/helpers ========== */
export const BASE_URL = "https://gateway-service-civz.onrender.com" as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RouteEntry = { path: string; method: HttpMethod };

export const routes = {
  users: {
    register:  { path: "/api/users/register",  method: "POST" } as RouteEntry,
    login:     { path: "/api/users/login",     method: "POST" } as RouteEntry,
    getById:   { path: "/api/users/:id",       method: "GET"  } as RouteEntry,
    getPerfil: { path: "/api/users/perfil",    method: "GET"  } as RouteEntry,
  },
  videos: {
    upload: { path: "/api/videos/upload",       method: "POST" } as RouteEntry,
    list:   { path: "/api/videos",              method: "GET"  } as RouteEntry,
    status: { path: "/api/videos/:id/status",   method: "GET"  } as RouteEntry,
  }
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

/* ========== Auth token & user cache ========== */
let _authToken: string | null = null;

export type PerfilResponse = {
  nome: string;
  email: string;
  telefone: string;
  tipo: "CONSULTOR" | "PROFISSIONAL";
  bio?: string | null;
  tags?: string[] | null;
  avatarUrl?: string | null;
  data_criacao?: string | null;
};

export type User = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  tipo: "CONSULTOR" | "PROFISSIONAL";
  bio?: string | null;
  tags?: string[] | null;
  avatarUrl?: string | null;
  data_criacao?: string | null;
};

let _currentUser: (PerfilResponse | User) | null = null;

type PerfilCacheEntry = { data: PerfilResponse; ts: number };
const _perfilCache = new Map<string, PerfilCacheEntry>();
const PERFIL_CACHE_TTL_MS = 5 * 60 * 1000;

export function setAuthToken(token: string | null) { _authToken = token; }
export function getAuthToken() { return _authToken; }
export function clearAuthToken() { _authToken = null; _currentUser = null; _perfilCache.clear(); }
export function setCurrentUser(u: (PerfilResponse | User) | null) { _currentUser = u; }
export function getCurrentUser() { return _currentUser; }

/* ========== Tipos de payloads ========== */
export type RegisterPayload = {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
  tipo: "CONSULTOR" | "PROFISSIONAL";
  bio?: string;
  tags?: string[];
  avatarUrl?: string;
};

export type UploadFile = {
  uri: string;
  name?: string;
  type?: string;
};

export type LoginPayload = { email: string; password: string };
export type LoginResponse = { token: string };

type RequestOpts = {
  timeoutMs?: number;
  retries?: number;
  auth?: boolean;
};

/* ========== Utils HTTP ========== */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
) {
  const { timeoutMs = 20000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try { 
    const headers = { Accept: "application/json", ...(rest.headers || {}) };
    return await fetch(input, { ...rest, headers, signal: controller.signal });
  }
  finally { clearTimeout(id); }
}

function b64urlToString(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (b64url.length % 4)) % 4);
  if (typeof atob === "function") return decodeURIComponent(escape(atob(b64)));
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
    return payload.sub || payload.userId || payload.id || null;
  } catch { return null; }
}

async function getJson<TRes>(url: string, opts: RequestOpts = {}): Promise<TRes> {
  const attemptMax = Math.max(1, opts.retries ?? 1);
  let lastErr: any = null;
  for (let attempt = 1; attempt <= attemptMax; attempt++) {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
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
  // IMPORTANTE: não setar Content-Type manualmente (RN define boundary)
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.auth && _authToken) headers.Authorization = `Bearer ${_authToken}`;

  const res = await fetchWithTimeout(url, { method: "POST", headers, body: form, timeoutMs: opts.timeoutMs ?? 25000 });
  const text = await res.text().catch(() => "");
  const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
  if (!res.ok) {
    if (res.status === 401 && _authToken) clearAuthToken();
    throw new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
  }
  return parsed as TRes;
}

/* ========== Endpoints de Users ========== */
export async function registerUser(payload: RegisterPayload, file?: UploadFile) {
  const url = buildUrl(routes.users.register);
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
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(payload), timeoutMs: 20000 });
  const text = await res.text().catch(() => "");
  const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
  if (!res.ok) throw new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
  const token = typeof parsed === "string" ? parsed : parsed?.token;
  if (!token) throw new Error("Resposta de login inválida");
  setAuthToken(token);
  return { token };
}

export async function getUserById(id: string) {
  const url = buildUrl(routes.users.getById, { id });
  return getJson<User>(url, { auth: true, timeoutMs: 15000, retries: 1 });
}

export async function getPerfilByEmail(email: string): Promise<PerfilResponse> {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const cached = _perfilCache.get(key);
  if (cached && (now - cached.ts) < PERFIL_CACHE_TTL_MS) {
    setCurrentUser(cached.data);
    return cached.data;
  }
  const url = buildUrl(routes.users.getPerfil, undefined, { email: key });
  const perfil = await getJson<PerfilResponse>(url, { auth: true, timeoutMs: 15000, retries: 1 });
  _perfilCache.set(key, { data: perfil, ts: now });
  setCurrentUser(perfil);
  return perfil;
}

export async function initCurrentUserFromToken(): Promise<User | null> {
  const id = getUserIdFromToken();
  if (!id) return null;
  const user = await getUserById(id);
  setCurrentUser(user);
  return user;
}

/* ========== Vídeos (upload + feed READY) ========== */
export type VideoStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type VideoDTO = {
  id: string;
  userId: string;
  descricao?: string | null;
  hlsMasterUrl: string | null;   // CDN HLS .m3u8
  streamVideoId?: string | null;
  status: VideoStatus;
  dataUpload?: string | null;
};

export type UploadVideoInput = { descricao: string; file: UploadFile };

function guessMime(uri?: string) {
  if (!uri) return "application/octet-stream";
  const u = uri.toLowerCase();
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".mov")) return "video/quicktime";
  if (u.endsWith(".mkv")) return "video/x-matroska";
  return "video/mp4";
}

const UPLOAD_TIMEOUT_MS = 5 * 60_000; // 5 min pra uploads mais parrudos

export async function uploadVideo(input: UploadVideoInput): Promise<VideoDTO> {
  const userId = getUserIdFromToken();
  if (!userId) throw new Error("Faça login para publicar.");

  const url = buildUrl(routes.videos.upload);
  const form = new FormData();
  form.append("data", JSON.stringify({ userId, descricao: input.descricao }) as any);
  form.append("file", {
    uri: input.file.uri,
    name: input.file.name || "video.mp4",
    type: input.file.type || guessMime(input.file.uri),
  } as any);

  try {
    return await postMultipart<VideoDTO>(url, form, { auth: true, timeoutMs: UPLOAD_TIMEOUT_MS, retries: 0 });
  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("network request failed") || msg.includes("abort") || msg.includes("networkerror")) {
      throw new Error("Falha de rede/timeout durante upload. Tente novamente em uma conexão estável.");
    }
    throw e;
  }
}

const FEED_CACHE_KEY = "FEED_CACHE_V1";
const FEED_TTL_MS = 15_000;

export async function fetchFeedReady(): Promise<VideoDTO[]> {
  const url = buildUrl(routes.videos.list);
  try {
    const list = await getJson<VideoDTO[]>(url, { auth: true, timeoutMs: 15_000, retries: 1 });
    const ready = (list || []).filter(v => v.status === "READY" && !!v.hlsMasterUrl);
    try { await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: ready })); } catch {}
    return ready;
  } catch (err) {
    const raw = await AsyncStorage.getItem(FEED_CACHE_KEY);
    if (raw) {
      try {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < FEED_TTL_MS) return data as VideoDTO[];
      } catch {}
    }
    throw err;
  }
}
