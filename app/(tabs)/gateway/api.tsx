// Ajustado para React Native: polyfill base64 (sem throw), token persistente, normalização "Bearer ",
// Authorization automático (exceto login/registro), preflight opcional no feed READY,
// suporte a upload com waitSeconds/reprocess e endpoint reprocess manual.

import AsyncStorage from "@react-native-async-storage/async-storage";

/* =================== Polyfill base64 para RN (require dinâmico SAFE) =================== */
let __b64decode: ((s: string) => string) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("base-64");
  __b64decode = mod?.decode;
} catch {
  __b64decode = undefined;
}

if (typeof globalThis.atob === "undefined") {
  if (__b64decode) {
    // @ts-ignore
    globalThis.atob = __b64decode;
  } else {
    // não derrube o app se faltar o polyfill
    // eslint-disable-next-line no-console
    console.warn("[api.tsx] 'atob' ausente e pacote 'base-64' não instalado. JWT não será decodificado.");
  }
}

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
    upload:    { path: "/api/videos/upload",        method: "POST" } as RouteEntry,
    list:      { path: "/api/videos",               method: "GET"  } as RouteEntry,
    ready:     { path: "/api/videos/ready",         method: "GET"  } as RouteEntry,
    status:    { path: "/api/videos/:id/status",    method: "GET"  } as RouteEntry,
    reprocess: { path: "/api/videos/:id/reprocess", method: "POST" } as RouteEntry,
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
const AUTH_KEY = "AUTH_TOKEN";

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

/* ===== Helpers de token ===== */
function normalizeToken(t?: string | null) {
  if (!t) return null;
  let v = t.trim();
  if (v.toLowerCase().startsWith("bearer ")) v = v.slice(7).trim();
  return v || null;
}

export function setAuthToken(token: string | null) { _authToken = normalizeToken(token); }
export function getAuthToken() { return _authToken; }
export function clearAuthToken() {
  _authToken = null;
  _currentUser = null;
  _perfilCache.clear();
  // fire-and-forget: remove do storage também
  AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
}
export function setCurrentUser(u: (PerfilResponse | User) | null) { _currentUser = u; }
export function getCurrentUser() { return _currentUser; }

export async function persistAuthToken(token: string | null) {
  _authToken = normalizeToken(token);
  if (_authToken) {
    await AsyncStorage.setItem(AUTH_KEY, _authToken);
  } else {
    await AsyncStorage.removeItem(AUTH_KEY);
  }
}

export async function restoreAuthToken() {
  const t = await AsyncStorage.getItem(AUTH_KEY);
  _authToken = normalizeToken(t);
  return _authToken;
}

export async function initAuthOnBoot() {
  await restoreAuthToken();
  try {
    if (_authToken) await initCurrentUserFromToken();
  } catch { /* opcionalmente logar */ }
}

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
  /** quando omitido, assume true (use Bearer) */
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
  } finally {
    clearTimeout(id);
  }
}

// seguro mesmo se não houver atob
function b64urlToString(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (b64url.length % 4)) % 4);
  if (typeof atob !== "function") return "";
  try {
    const raw = atob(b64);
    // eslint-disable-next-line deprecation/deprecation
    return decodeURIComponent(escape(raw));
  } catch {
    return "";
  }
}

/** Lê o userId (sub/userId/id) do payload do JWT atual */
export function getUserIdFromToken(): string | null {
  const raw = normalizeToken(_authToken);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadStr = b64urlToString(parts[1]);
    const payload = JSON.parse(payloadStr || "{}");
    return payload.sub || payload.userId || payload.id || null;
  } catch {
    return null;
  }
}

/** GET JSON com Bearer por padrão (auth=true) */
async function getJson<TRes>(url: string, opts: RequestOpts = {}): Promise<TRes> {
  const attemptMax = Math.max(1, opts.retries ?? 1);
  const useAuth = opts.auth !== false; // default true
  let lastErr: any = null;
  for (let attempt = 1; attempt <= attemptMax; attempt++) {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (useAuth && _authToken) headers.Authorization = `Bearer ${_authToken}`;
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

/* ====== Multipart helper (POST) — Bearer por padrão ====== */
async function postMultipart<TRes>(url: string, form: FormData, opts: RequestOpts = {}) {
  const useAuth = opts.auth !== false; // default true
  const headers: Record<string, string> = { Accept: "application/json" };
  if (useAuth && _authToken) headers.Authorization = `Bearer ${_authToken}`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: form,
    timeoutMs: opts.timeoutMs ?? 25000,
  });
  const text = await res.text().catch(() => "");
  const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
  if (!res.ok) {
    if (res.status === 401 && _authToken) clearAuthToken();
    throw new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
  }
  return parsed as TRes;
}

/* ====== POST JSON com Bearer ====== */
async function postJson<TRes>(url: string, body: any, opts: RequestOpts = {}) {
  const useAuth = opts.auth !== false; // default true
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (useAuth && _authToken) headers.Authorization = `Bearer ${_authToken}`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: opts.timeoutMs ?? 20000,
  });
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
  // registro NÃO envia Authorization
  return postMultipart<any>(url, form, { timeoutMs: 25000, retries: 2, auth: false });
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const url = buildUrl(routes.users.login);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  // login NÃO envia Authorization
  const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(payload), timeoutMs: 20000 });
  const text = await res.text().catch(() => "");
  const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
  if (!res.ok) throw new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);

  const tokenRaw = typeof parsed === "string" ? parsed : parsed?.token;
  const token = normalizeToken(tokenRaw);
  if (!token) throw new Error("Resposta de login inválida");

  setAuthToken(token);
  await persistAuthToken(token);

  return { token };
}

export async function getUserById(id: string) {
  const url = buildUrl(routes.users.getById, { id });
  // auth=true por padrão
  return getJson<User>(url, { timeoutMs: 15000, retries: 1 });
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
  // auth=true por padrão
  const perfil = await getJson<PerfilResponse>(url, { timeoutMs: 15000, retries: 1 });
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

/* ========== Vídeos (upload + reprocess + feed READY) ========== */
export type VideoStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type VideoDTO = {
  id: string;
  userId: string;
  descricao?: string | null;
  hlsMasterUrl: string | null;   // CDN HLS .m3u8 (ideal: já assinada pelo backend)
  streamVideoId?: string | null;
  status: VideoStatus;
  dataUpload?: string | null;
};

export type UploadVideoInput = {
  descricao: string;
  file: UploadFile;
  /** segundos para o backend esperar a HLS (0 = não esperar) */
  waitSeconds?: number;
  /** forçar reprocess imediatamente após o upload (default true no backend) */
  reprocess?: boolean;
};

function guessMime(uri?: string) {
  if (!uri) return "application/octet-stream";
  const u = uri.toLowerCase();
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".mov")) return "video/quicktime";
  if (u.endsWith(".mkv")) return "video/x-matroska";
  return "video/mp4";
}

const UPLOAD_TIMEOUT_MS = 5 * 60_000;

export async function uploadVideo(input: UploadVideoInput): Promise<VideoDTO> {
  // Tenta extrair o userId do JWT; se falhar, tenta carregar do backend; se ainda falhar, prossegue sem
  let userId = getUserIdFromToken();

  if (!userId) {
    try {
      const me = await initCurrentUserFromToken();
      userId = me?.id ?? (null as any);
    } catch { /* ignora */ }
  }

  // Passe os novos parâmetros para o backend
  const url = buildUrl(routes.videos.upload, undefined, {
    waitSeconds: input.waitSeconds ?? 0,
    reprocess: input.reprocess ?? true,
  });

  const form = new FormData();

  const data: any = { descricao: input.descricao };
  if (userId) data.userId = userId; // backend pode inferir pelo JWT se ausente
  form.append("data", JSON.stringify(data) as any);

  form.append("file", {
    uri: input.file.uri,
    name: input.file.name || "video.mp4",
    type: input.file.type || guessMime(input.file.uri),
  } as any);

  // auth=true por padrão
  try {
    return await postMultipart<VideoDTO>(url, form, { timeoutMs: UPLOAD_TIMEOUT_MS, retries: 0 });
  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("network request failed") || msg.includes("abort") || msg.includes("networkerror")) {
      throw new Error("Falha de rede/timeout durante upload. Tente novamente em uma conexão estável.");
    }
    throw e;
  }
}

/** Dispara reprocess no backend e pode pedir para ele esperar alguns segundos pela HLS */
export async function reprocessVideo(id: string, waitSeconds = 10): Promise<VideoDTO> {
  const url = buildUrl(routes.videos.reprocess, { id }, { waitSeconds });
  return postJson<VideoDTO>(url, null, { timeoutMs: 25_000 });
}

/* ===== Preflight util para HLS (.m3u8) ===== */
async function preflightUrl(url: string, timeoutMs = 7000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1" }, signal: ctrl.signal as any });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

/* cache do feed prontos (READY) */
const FEED_CACHE_KEY = "FEED_CACHE_V2";
const FEED_TTL_MS = 15_000;

/** Busca do endpoint /api/videos/ready.
 *  Por padrão envia Authorization. Preflight é opcional (default true). */
export async function fetchFeedReady(
  limit = 12,
  opts?: { preflight?: boolean }
): Promise<VideoDTO[]> {
  const url = buildUrl(routes.videos.ready, undefined, { limit });
  try {
    // auth=true por padrão
    const list = await getJson<VideoDTO[]>(url, { timeoutMs: 15_000, retries: 1 });
    let ready = (list || []).filter(v => typeof v.hlsMasterUrl === "string" && !!v.hlsMasterUrl);

    const doPreflight = opts?.preflight !== false; // default true
    if (doPreflight && ready.length) {
      // valida em paralelo (limite simples)
      const checks = await Promise.all(
        ready.map(async (v) => ({ v, ok: await preflightUrl(v.hlsMasterUrl as string, 7000) }))
      );
      ready = checks.filter(c => c.ok).map(c => c.v);
    }

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

/* ========== Cache do último match (userId do dono do vídeo) ========== */
const LAST_MATCH_USER_ID_KEY = "LAST_MATCH_USER_ID";

export async function saveLastMatchedUserId(userId: string | null | undefined) {
  if (!userId) return;
  try { await AsyncStorage.setItem(LAST_MATCH_USER_ID_KEY, String(userId)); } catch {}
}

export async function getLastMatchedUserId(): Promise<string | null> {
  try { return (await AsyncStorage.getItem(LAST_MATCH_USER_ID_KEY)) || null; } catch { return null; }
}

export async function clearLastMatchedUserId(): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_MATCH_USER_ID_KEY); } catch {}
}

/* -----------------------------------------------------------------------
   ⚠️ Se este arquivo estiver dentro de `app/`, o Expo Router tenta tratá-lo
   como rota e mostra um WARN sobre default export. Ideal é mover para
   `src/gateway/api.ts` e ajustar imports. Enquanto isso:
------------------------------------------------------------------------- */
const __noop = {} as never;
export default __noop;
