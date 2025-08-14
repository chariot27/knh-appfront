import AsyncStorage from "@react-native-async-storage/async-storage";

/* =================== Polyfill base64 (RN) =================== */
let __b64decode: ((s: string) => string) | undefined;
try { const mod = require("base-64"); __b64decode = mod?.decode; } catch { __b64decode = undefined; }
if (typeof globalThis.atob === "undefined") {
  if (__b64decode) { // @ts-ignore
    globalThis.atob = __b64decode;
  } else {
    console.warn("[api.ts] 'atob' ausente e pacote 'base-64' não instalado. JWT não será decodificado.");
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
  },
  matches: {
    invite:          { path: "/api/matches/invite",           method: "POST" } as RouteEntry,
    accept:          { path: "/api/matches/accept",           method: "POST" } as RouteEntry,
    listForUser:     { path: "/api/matches/user/:userId",     method: "GET"  } as RouteEntry,
    sentInvites:     { path: "/api/matches/invites/sent",     method: "GET"  } as RouteEntry,
    receivedInvites: { path: "/api/matches/invites/received", method: "GET"  } as RouteEntry,
  },
  payments: {
    checkout: { path: "/api/payments/checkout",      method: "POST" } as RouteEntry,
    status:   { path: "/api/payments/status/:txid",  method: "GET"  } as RouteEntry,
    confirm:  { path: "/api/payments/confirm/:txid", method: "POST" } as RouteEntry, // DEV
    verify:   { path: "/api/payments/verify/:txid",  method: "POST" } as RouteEntry, // força checagem no backend/PSP
  },
  subscriptions: {
    status:            { path: "/api/subscriptions/:userId/status",               method: "GET"  } as RouteEntry,
    cancelAtPeriodEnd: { path: "/api/subscriptions/:userId/cancel-at-period-end", method: "POST" } as RouteEntry,
  }
} as const;

/* =================== Segurança defensiva (cliente) =================== */
const BASE = new URL(BASE_URL);
const INTERNAL_HOST_RE = /^(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d+){2}|169\.254(?:\.\d+){2})$/;

function isInternalHost(host: string) { return INTERNAL_HOST_RE.test(host); }
function assertSameOrigin(u: URL) {
  if (u.host !== BASE.host) throw new Error("URL não permitida (origem diferente)");
  if (u.protocol !== BASE.protocol) throw new Error("Protocolo não permitido");
  if (isInternalHost(u.hostname)) throw new Error("Destino interno bloqueado");
}
function cleanPath(p: string) {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) throw new Error("URL absoluta não permitida");
  if (p.includes("..")) throw new Error("Path inválido");
  return (p.startsWith("/") ? p : "/" + p).replace(/\/+$/g, "");
}
function clampStr(v: unknown, max = 1024) { const s = String(v ?? ""); return s.length > max ? s.slice(0, max) : s; }

export function buildUrl(
  entry: RouteEntry | string,
  pathParams?: Record<string, string | number>,
  query?: Record<string, string | number | boolean | undefined | null>
) {
  let path = typeof entry === "string" ? entry : entry.path;
  path = cleanPath(path);

  if (pathParams) {
    Object.entries(pathParams).forEach(([k, v]) => {
      const safe = encodeURIComponent(String(v));
      path = path.replace(`:${k}`, safe);
    });
  }

  const u = new URL(BASE.href);
  const basePath = BASE.pathname.replace(/\/+$/g, "");
  u.pathname = (basePath + path).replace(/\/{2,}/g, "/");

  if (query) {
    const usp = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) usp.append(k, clampStr(v));
    });
    const qs = usp.toString();
    if (qs) u.search = qs;
  }

  assertSameOrigin(u);
  return u.toString();
}

/* =================== Ajustes de performance =================== */
const DEBUG_HTTP = false;

const DEFAULT_TIMEOUT = 20_000;
const timeouts: Record<string, number> = {
  "GET /api/users/perfil": 18_000,
  "POST /api/users/login": 35_000,
  "POST /api/users/register": 45_000,
  "POST /api/videos/upload": 5 * 60_000,
  "POST /api/videos/:id/reprocess": 30_000,
  "GET /api/payments/status/:txid": 20_000,
  "POST /api/payments/verify/:txid": 25_000,
  "POST /api/payments/checkout": 35_000,
  "GET /api/subscriptions/:userId/status": 20_000,
  "POST /api/subscriptions/:userId/cancel-at-period-end": 25_000,
};

const retries: Record<string, number> = {
  "GET": 2,
  "POST": 1,
  "POST /api/users/login": 2,
  "POST /api/payments/verify/:txid": 3,
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function backoffDelay(attempt: number) {
  const base = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
  const jitter = Math.floor(Math.random() * 300);
  return base + jitter;
}

const MAX_CONCURRENCY = 6;
let _active = 0; const _queue: Array<() => void> = [];
async function withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  if (_active >= MAX_CONCURRENCY) await new Promise<void>(res => _queue.push(res));
  _active++;
  try { return await fn(); }
  finally { _active--; const next = _queue.shift(); if (next) next(); }
}

const inflight = new Map<string, Promise<any>>();
function stableStringify(x: any): string { try { return JSON.stringify(x, Object.keys(x).sort()); } catch { return ""; } }
function makeKey(method: string, url: string, body?: any) { return method + " " + url + (body ? (":" + stableStringify(body)) : ""); }

/* =================== Erros amigáveis =================== */
export class ApiError extends Error { status?: number; code?: string; isNetwork?: boolean; causeRaw?: any; friendly?: string; }
function toApiError(err: any, status?: number): ApiError {
  const e = new ApiError(typeof err?.message === "string" ? err.message : String(err));
  e.status = status ?? (err?.status ?? undefined);
  e.isNetwork = (err?.name === "AbortError") || /Network request failed/i.test(String(err?.message || ""));
  e.causeRaw = err; e.friendly = friendlyMessage(e);
  return e;
}
export function friendlyMessage(e: Partial<ApiError> | any): string {
  const status = (e?.status ?? 0) as number;
  if (e?.isNetwork) return "Sem conexão ou tempo esgotado. Verifique sua internet e tente novamente.";
  if (status === 401) return "Sessão expirada ou não autorizada. Faça login novamente.";
  if (status === 403) return "Acesso negado para esta operação.";
  if (status === 404) return "Recurso não encontrado. Tente atualizar a tela.";
  if (status === 409) return "Conflito de dados. A operação já foi realizada ou há um conflito de estado.";
  if (status === 429) return "Muitas solicitações. Aguarde alguns segundos e tente novamente.";
  if (status >= 500) return "Estamos iniciando os motores do servidor. Tente novamente em alguns instantes.";
  return "Não foi possível concluir a ação agora. Tente novamente.";
}

/* ========== DEBUG HTTP (logs sucintos) ========== */
let __reqSeq = 0;
const nextReqId = (p: string) => { __reqSeq = (__reqSeq + 1) % 1_000_000; return `${p}-${Date.now()}-${__reqSeq}`; };
const redactHeaders = (h?: Record<string, any>) => { if (!h) return h; const o = { ...h }; const k = Object.keys(o).find(x => x.toLowerCase() === "authorization"); if (k && typeof o[k] === "string") o[k] = "Bearer ****"; return o; };
const toPrintableBody = (b: any) => { try { return typeof b === "string" ? b : JSON.stringify(b); } catch { return String(b); } };
function logHttp(tag: "REQ" | "RES" | "ERR", payload: any) {
  if (!DEBUG_HTTP) return; try { console.log(`[HTTP][${tag}]`, JSON.stringify(payload, null, 2)); } catch { console.log(`[HTTP][${tag}]`, payload); }
}

/* ========== DEBUG DE PAGAMENTOS (seguro) ========== */
const DEBUG_PAYMENTS = true; // habilita logs de pagamentos/assinaturas

const SENSITIVE_KEYS_RE = /^(authorization|token|qrPngBase64|copiaECola)$/i;
function _redactor(k: string, v: any) {
  if (SENSITIVE_KEYS_RE.test(k)) {
    const key = k.toLowerCase();
    if (key === "qrpngbase64") return `[base64:${typeof v === "string" ? v.length : 0} bytes]`;
    if (key === "copiaecola")  return typeof v === "string" ? `${v.slice(0, 12)}…${v.slice(-12)}` : v;
    return "****";
  }
  if (typeof v === "string" && v.length > 600) return `${v.slice(0, 300)}…${v.slice(-80)}`;
  return v;
}
function _safeClone<T>(obj: T): T {
  try { return JSON.parse(JSON.stringify(obj, _redactor)); } catch { return obj; }
}
function logPay(phase: "REQ" | "RES" | "ERR", payload: any) {
  if (!DEBUG_PAYMENTS) return;
  try { console.log(`[PAY][${phase}]`, JSON.stringify(_safeClone(payload), null, 2)); }
  catch { console.log(`[PAY][${phase}]`, payload); }
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
export type User = PerfilResponse & { id: string };

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
  _authToken = null; _currentUser = null; _perfilCache.clear();
  AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
  // limpa cache de assinatura ao sair
  _subsCacheMemory = null;
  AsyncStorage.removeItem(SUBS_CACHE_KEY).catch(() => {});
}
export function setCurrentUser(u: (PerfilResponse | User) | null) { _currentUser = u; }
export function getCurrentUser() { return _currentUser; }

export async function persistAuthToken(token: string | null) {
  _authToken = normalizeToken(token);
  if (_authToken) await AsyncStorage.setItem(AUTH_KEY, _authToken);
  else await AsyncStorage.removeItem(AUTH_KEY);
}
export async function restoreAuthToken() { const t = await AsyncStorage.getItem(AUTH_KEY); _authToken = normalizeToken(t); return _authToken; }
export async function initAuthOnBoot() { await restoreAuthToken(); try { if (_authToken) await initCurrentUserFromToken(); } catch {} }

/* ========== HTTP utils ========== */
type RequestOpts = { timeoutMs?: number; retries?: number; auth?: boolean; idempotentKey?: string };

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = DEFAULT_TIMEOUT, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...(rest.headers || {}) } as Record<string, string>;
    const s = String(input);
    const u = new URL(s, BASE.href);
    assertSameOrigin(u);
    return await fetch(s, { ...rest, headers, signal: controller.signal });
  } finally { clearTimeout(id); }
}

function b64urlToString(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
  if (typeof atob !== "function") return "";
  try { const raw = atob(b64);
    // eslint-disable-next-line deprecation/deprecation
    return decodeURIComponent(escape(raw)); } catch { return ""; }
}

export function getUserIdFromToken(): string | null {
  const raw = normalizeToken(_authToken);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadStr = b64urlToString(parts[1]);
    const payload = JSON.parse(payloadStr || "{}");
    return payload.sub || payload.userId || payload.id || null;
  } catch { return null; }
}

/* ---- Core com retries, backoff, coalescência e mensagens amigáveis ---- */
async function coreRequest<T>(method: HttpMethod, url: string, init: RequestInit & { timeoutMs?: number }, opt: RequestOpts = {}): Promise<T> {
  const keyBase = `${method} ${url}`;
  const timeout = opt.timeoutMs ?? timeouts[keyBase] ?? timeouts[method + " " + url.split("?")[0]] ?? DEFAULT_TIMEOUT;
  const maxRetries = Math.max(0, opt.retries ?? retries[keyBase] ?? retries[method] ?? 0);

  const canCoalesce = method === "GET" || !!opt.idempotentKey;
  const inflightKey = canCoalesce ? (opt.idempotentKey || makeKey(method, url, (init as any)?.body)) : undefined;
  if (inflightKey && inflight.has(inflightKey)) return inflight.get(inflightKey) as Promise<T>;

  const exec = async (): Promise<T> => {
    const useAuth = opt.auth !== false;
    const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...(init.headers as any) };
    if (useAuth && _authToken) headers.Authorization = `Bearer ${_authToken}`;

    const reqId = nextReqId(method);
    const attemptMax = Math.max(1, maxRetries + 1);
    let lastErr: any = null;

    for (let attempt = 1; attempt <= attemptMax; attempt++) {
      const t0 = Date.now();
      try {
        logHttp("REQ", { reqId, method, url, headers: redactHeaders(headers) });
        const res = await fetchWithTimeout(url, { ...init, method, headers, timeoutMs: timeout });
        const text = await res.text().catch(() => "");
        logHttp("RES", { reqId, url, status: res.status, ms: Date.now() - t0, body: DEBUG_HTTP ? text?.slice(0, 2000) : undefined });

        const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
        if (!res.ok) {
          if (res.status === 401 && _authToken) clearAuthToken();
          const err = toApiError(new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`), res.status);
          const retryable = err.isNetwork || res.status >= 500 || res.status === 429;
          if (attempt < attemptMax && retryable) { await sleep(backoffDelay(attempt)); continue; }
          throw err;
        }
        return parsed as T;
      } catch (err: any) {
        lastErr = toApiError(err);
        logHttp("ERR", { reqId, url, msg: lastErr?.message, status: lastErr?.status, attempt, ms: Date.now() - t0 });
        const retryable = lastErr?.isNetwork;
        if (attempt < attemptMax && retryable) { await sleep(backoffDelay(attempt)); continue; }
        break;
      }
    }
    throw lastErr ?? toApiError(new Error("Falha desconhecida"));
  };

  const runner = withConcurrency(exec);
  if (inflightKey) inflight.set(inflightKey, runner);
  try { return await runner; }
  finally { if (inflightKey) inflight.delete(inflightKey); }
}

async function getJson<TRes>(url: string, opts: RequestOpts = {}): Promise<TRes> {
  return coreRequest<TRes>("GET", url, {}, opts);
}

async function postMultipart<TRes>(url: string, form: FormData, opts: RequestOpts = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  return coreRequest<TRes>("POST", url, { body: form, headers }, opts);
}

async function postJson<TRes>(url: string, body: any, opts: RequestOpts = {}) {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  return coreRequest<TRes>("POST", url, { body: body ? JSON.stringify(body) : undefined, headers }, opts);
}

/* ========== Users ========== */
export type RegisterPayload = {
  nome: string; email: string; telefone: string; senha: string; tipo: "CONSULTOR" | "PROFISSIONAL";
  bio?: string; tags?: string[]; avatarUrl?: string;
};
export type UploadFile = { uri: string; name?: string; type?: string; };
export type LoginPayload = { email: string; password: string };
export type LoginResponse = { token: string };

export async function registerUser(payload: RegisterPayload, file?: UploadFile) {
  const url = buildUrl(routes.users.register);
  const form = new FormData();
  form.append("data", JSON.stringify(payload) as any);
  if (file?.uri) {
    if (!/^(file|content|ph):/i.test(file.uri)) throw toApiError(new Error("Arquivo inválido"));
    form.append("avatar", {
      uri: file.uri,
      name: file.name || "upload",
      type: file.type || "application/octet-stream",
    } as any);
  }
  try {
    return await postMultipart<any>(url, form, { timeoutMs: timeouts["POST /api/users/register"], retries: 1, auth: false });
  } catch (e: any) { throw toApiError(e); }
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const url = buildUrl(routes.users.login);
  try {
    const parsed = await postJson<any>(url, payload, { timeoutMs: timeouts["POST /api/users/login"], retries: retries["POST /api/users/login"], auth: false, idempotentKey: makeKey("POST", url, payload) });
    const tokenRaw = typeof parsed === "string" ? parsed : parsed?.token;
    const token = normalizeToken(tokenRaw);
    if (!token) throw toApiError(new Error("Resposta de login inválida"));
    setAuthToken(token);
    await persistAuthToken(token);
    return { token };
  } catch (e: any) {
    const er = toApiError(e);
    if (er.status === 400 || er.status === 401) er.friendly = "E-mail ou senha incorretos.";
    throw er;
  }
}

export async function getUserById(id: string) {
  const url = buildUrl(routes.users.getById, { id });
  try { return await getJson<User>(url, { timeoutMs: 15_000, retries: 1 }); }
  catch (e) { throw toApiError(e); }
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
  try {
    const perfil = await getJson<PerfilResponse>(url, { timeoutMs: timeouts["GET /api/users/perfil"], retries: 1, idempotentKey: makeKey("GET", url) });
    _perfilCache.set(key, { data: perfil, ts: now });
    setCurrentUser(perfil);
    return perfil;
  } catch (e) { throw toApiError(e); }
}

export async function initCurrentUserFromToken(): Promise<User | null> {
  const id = getUserIdFromToken();
  if (!id) return null;
  try {
    const user = await getUserById(id);
    setCurrentUser(user);
    return user;
  } catch { return null; }
}

/* ========== Vídeos (upload + ready) ========== */
export type VideoStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type VideoDTO = {
  id: string; userId: string; descricao?: string | null; hlsMasterUrl: string | null;
  streamVideoId?: string | null; status: VideoStatus; dataUpload?: string | null;
};
export type UploadVideoInput = { descricao: string; file: UploadFile; waitSeconds?: number; reprocess?: boolean; };

function guessMime(uri?: string) {
  if (!uri) return "application/octet-stream";
  const u = uri.toLowerCase();
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".mov")) return "video/quicktime";
  if (u.endsWith(".mkv")) return "video/x-matroska";
  return "video/mp4";
}
const UPLOAD_TIMEOUT_MS = timeouts["POST /api/videos/upload"];

export async function uploadVideo(input: UploadVideoInput): Promise<VideoDTO> {
  let userId = getUserIdFromToken();
  if (!userId) { try { const me = await initCurrentUserFromToken(); userId = (me as any)?.id ?? (null as any); } catch {} }

  const url = buildUrl(routes.videos.upload, undefined, {
    waitSeconds: input.waitSeconds ?? 0,
    reprocess: input.reprocess ?? true,
  });

  const form = new FormData();
  const data: any = { descricao: input.descricao };
  if (userId) data.userId = userId;
  form.append("data", JSON.stringify(data) as any);
  form.append("file", {
    uri: input.file.uri,
    name: input.file.name || "video.mp4",
    type: input.file.type || guessMime(input.file.uri),
  } as any);

  try {
    return await postMultipart<VideoDTO>(url, form, { timeoutMs: UPLOAD_TIMEOUT_MS, retries: 0, idempotentKey: makeKey("POST", url, { meta: data }) });
  } catch (e: any) {
    const er = toApiError(e);
    if (er.isNetwork) er.friendly = "Falha de rede durante upload. Tente novamente em uma conexão estável.";
    throw er;
  }
}

export async function reprocessVideo(id: string, waitSeconds = 10): Promise<VideoDTO> {
  const url = buildUrl(routes.videos.reprocess, { id }, { waitSeconds });
  try { return await postJson<VideoDTO>(url, null, { timeoutMs: timeouts["POST /api/videos/:id/reprocess"] }); }
  catch (e) { throw toApiError(e); }
}

async function preflightUrl(url: string, timeoutMs = 7000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1" }, signal: ctrl.signal as any });
    clearTimeout(id);
    return res.ok;
  } catch { return false; }
}

const FEED_CACHE_KEY = "FEED_CACHE_V2";
const FEED_TTL_MS = 15_000;
export async function fetchFeedReady(limit = 12, opts?: { preflight?: boolean }): Promise<VideoDTO[]> {
  const url = buildUrl(routes.videos.ready, undefined, { limit });
  try {
    let list = await getJson<VideoDTO[]>(url, { timeoutMs: 20_000, retries: 1, idempotentKey: makeKey("GET", url) });
    let ready = (list || []).filter(v => typeof v.hlsMasterUrl === "string" && !!v.hlsMasterUrl);

    const doPreflight = opts?.preflight !== false;
    if (doPreflight && ready.length) {
      const checks = await Promise.all(
        ready.map(async (v) => ({ v, ok: await preflightUrl(v.hlsMasterUrl as string, 7000) } ))
      );
      ready = checks.filter(c => c.ok).map(c => c.v);
    }

    try { await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: ready })); } catch {}
    return ready;
  } catch {
    const raw = await AsyncStorage.getItem(FEED_CACHE_KEY);
    if (raw) {
      try {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < FEED_TTL_MS) return data as VideoDTO[];
      } catch {}
    }
    throw toApiError(new Error("Não foi possível carregar o feed."));
  }
}

/* ======================= MATCH/INVITES ======================= */
export type UUID = string;
export type InviteStatus = "PENDING" | "ACCEPTED";

export type InviteRequest = {
  inviterId: UUID;
  targetId: UUID;
  inviterName?: string;
  inviterPhone?: string;
  inviterAvatar?: string;
};
export type InviteDTO = {
  id: UUID;
  inviterId: UUID;
  targetId: UUID;
  inviterName?: string;
  inviterPhone?: string;
  inviterAvatar?: string;
  status: InviteStatus;
  createdAt: string;
};
export type InviteResponse = { matched: boolean; matchId?: UUID; invite?: InviteDTO; };
export type AcceptRequest = { inviteId?: UUID; inviterId?: UUID; targetId?: UUID; };
export type AcceptDTO = { id: UUID; inviteId: UUID; inviterName?: string; inviterPhone?: string; inviterAvatar?: string; createdAt: string; };
export type MatchDTO = { id: UUID; userA: UUID; userB: UUID; conviteMutuo: boolean; createdAt: string; };

const INV_SENT_PREFIX = "INV_SENT_V1:";
const INV_RECV_PREFIX = "INV_RECV_V1:";
const INV_INDEX_PREFIX = "INV_IDX_V1:";

// ======= Helpers de cache local dos convites/matches =======
async function _readList(key: string): Promise<InviteDTO[]> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? (JSON.parse(raw) as InviteDTO[]) : []; }
  catch { return []; }
}
async function _writeList(key: string, list: InviteDTO[]) {
  try { await AsyncStorage.setItem(key, JSON.stringify(list)); } catch {}
}
async function _indexSave(invite: InviteDTO) {
  try { await AsyncStorage.setItem(INV_INDEX_PREFIX + invite.id, JSON.stringify({ inviterId: invite.inviterId, targetId: invite.targetId })); } catch {}
}
async function _cacheAddInviteBoth(inv: InviteDTO) {
  const sentKey = INV_SENT_PREFIX + inv.inviterId;
  const recvKey = INV_RECV_PREFIX + inv.targetId;
  const [sent, recv] = await Promise.all([_readList(sentKey), _readList(recvKey)]);
  const upsert = (arr: InviteDTO[]) => {
    const i = arr.findIndex(x => x.id === inv.id);
    if (i >= 0) arr[i] = inv; else arr.unshift(inv);
    return arr;
  };
  await Promise.all([_writeList(sentKey, upsert(sent)), _writeList(recvKey, upsert(recv)), _indexSave(inv)]);
}
async function _cacheUpdateInviteStatus(inviteId: string, status: InviteStatus) {
  const idxRaw = await AsyncStorage.getItem(INV_INDEX_PREFIX + inviteId);
  if (!idxRaw) return;
  const { inviterId, targetId } = JSON.parse(idxRaw);
  const sentKey = INV_SENT_PREFIX + inviterId;
  const recvKey = INV_RECV_PREFIX + targetId;

  const [sent, recv] = await Promise.all([_readList(sentKey), _readList(recvKey)]);
  const patch = (arr: InviteDTO[]) => {
    const i = arr.findIndex(x => x.id === inviteId);
    if (i >= 0) arr[i] = { ...arr[i], status };
    return arr;
  };
  await Promise.all([_writeList(sentKey, patch(sent)), _writeList(recvKey, patch(recv))]);
}

// ======= Export: cache simples do último usuário curtido (para TS2614) =======
const LAST_MATCHED_USER_ID_KEY = "LAST_MATCHED_USER_ID_V1";
export async function saveLastMatchedUserId(userId: string): Promise<void> {
  try { await AsyncStorage.setItem(LAST_MATCHED_USER_ID_KEY, String(userId)); } catch {}
}
export async function getLastMatchedUserId(): Promise<string | null> {
  try { return await AsyncStorage.getItem(LAST_MATCHED_USER_ID_KEY); } catch { return null; }
}
export async function popLastMatchedUserId(): Promise<string | null> {
  const v = await getLastMatchedUserId();
  try { await AsyncStorage.removeItem(LAST_MATCHED_USER_ID_KEY); } catch {}
  return v;
}

// ======= APIs de convite/match =======
async function ensureMe() {
  if (!_currentUser) await initCurrentUserFromToken().catch(() => null);
  if (!_currentUser) throw toApiError(new Error("Usuário não autenticado"), 401);
  return _currentUser as User | PerfilResponse;
}
export async function buildInvitePayloadFromProfile(targetId: string): Promise<InviteRequest> {
  const me = await ensureMe();
  const meId = (me as any).id || getUserIdFromToken();
  if (!meId) throw toApiError(new Error("Não foi possível obter seu userId"));
  return {
    inviterId: String(meId),
    targetId: String(targetId),
    inviterName: me.nome,
    inviterPhone: me.telefone,
    inviterAvatar: (me as any).avatarUrl ?? undefined,
  };
}
export async function inviteMatchForTarget(targetId: string): Promise<InviteResponse> {
  const body = await buildInvitePayloadFromProfile(targetId);
  const url = buildUrl(routes.matches.invite);
  try {
    const res = await postJson<InviteResponse>(url, body, { timeoutMs: 20_000, retries: 1 });
    if (!res.matched && res.invite) await _cacheAddInviteBoth(res.invite);
    return res;
  } catch (e) { throw toApiError(e); }
}
export async function acceptInvite(inviteId: string): Promise<AcceptDTO> {
  const url = buildUrl(routes.matches.accept);
  try {
    const out = await postJson<AcceptDTO>(url, { inviteId } as AcceptRequest, { timeoutMs: 20_000, retries: 1 });
    await _cacheUpdateInviteStatus(inviteId, "ACCEPTED");
    return out;
  } catch (e) { throw toApiError(e); }
}
export async function acceptMatchByPair(inviterId: string, targetId: string): Promise<AcceptDTO> {
  const url = buildUrl(routes.matches.accept);
  try { return await postJson<AcceptDTO>(url, { inviterId, targetId } as AcceptRequest, { timeoutMs: 20_000, retries: 1 }); }
  catch (e) { throw toApiError(e); }
}
export async function listMyMatches(userId?: string): Promise<MatchDTO[]> {
  let uid = userId || getUserIdFromToken();
  if (!uid) { const me = await ensureMe(); uid = (me as any)?.id; }
  const url = buildUrl(routes.matches.listForUser, { userId: String(uid) });
  try { return await getJson<MatchDTO[]>(url, { timeoutMs: 15_000, retries: 1, idempotentKey: makeKey("GET", url) }); }
  catch (e) { throw toApiError(e); }
}
export async function listInvitesSent(userId?: string, status?: InviteStatus): Promise<InviteDTO[]> {
  let uid = userId || getUserIdFromToken();
  if (!uid) { const me = await initCurrentUserFromToken().catch(() => null); uid = (me as any)?.id; }
  const url = buildUrl(routes.matches.sentInvites, undefined, { userId: String(uid), status });
  try {
    return await getJson<InviteDTO[]>(url, { timeoutMs: 15_000, retries: 1, idempotentKey: makeKey("GET", url) });
  } catch (e: any) {
    if (e?.status === 404) {
      console.warn("[listInvitesSent] endpoint ausente (404) — usando cache local");
      return listInvitesSentLocal(String(uid), status);
    }
    return listInvitesSentLocal(String(uid), status);
  }
}
export async function listInvitesReceived(userId?: string, status?: InviteStatus): Promise<InviteDTO[]> {
  let uid = userId || getUserIdFromToken();
  if (!uid) { const me = await initCurrentUserFromToken().catch(() => null); uid = (me as any)?.id; }
  const url = buildUrl(routes.matches.receivedInvites, undefined, { userId: String(uid), status });
  try {
    return await getJson<InviteDTO[]>(url, { timeoutMs: 15_000, retries: 1, idempotentKey: makeKey("GET", url) });
  } catch (e: any) {
    if (e?.status === 404) {
      console.warn("[listInvitesReceived] endpoint ausente (404) — usando cache local");
      return listInvitesReceivedLocal(String(uid), status);
    }
    return listInvitesReceivedLocal(String(uid), status);
  }
}

// Fallbacks 100% locais (usam o cache em AsyncStorage)
async function listInvitesSentLocal(userId: string, status?: InviteStatus): Promise<InviteDTO[]> {
  const list = await _readList(INV_SENT_PREFIX + userId);
  return status ? list.filter(i => i.status === status) : list;
}

async function listInvitesReceivedLocal(userId: string, status?: InviteStatus): Promise<InviteDTO[]> {
  const list = await _readList(INV_RECV_PREFIX + userId);
  return status ? list.filter(i => i.status === status) : list;
}


/* ===================== PAGAMENTO & ASSINATURA ===================== */
export type PaymentStatus = "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";
export type SubscriptionStatus = "ACTIVE" | "INACTIVE" | "PAST_DUE" | "CANCELED";

export type CheckoutResponse = {
  txid: string;
  copiaECola: string;
  qrPngBase64: string;
  amount: string;
  expiresAt: string; // ISO
};
export type PaymentStatusResponse = {
  txid: string;
  paymentStatus: PaymentStatus;
  subscriptionStatus: SubscriptionStatus;
};
export type VerifyResponse = PaymentStatusResponse & { changed: boolean; };

export type SubscriptionDTO = {
  userId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
};

/** ===== Cache local da assinatura (não faz requisição de rede) ===== */
const SUBS_CACHE_KEY = "SUBS_LAST_KNOWN_V1";
export type SubscriptionCache = {
  userId: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  updatedAt: number;
};
let _subsCacheMemory: SubscriptionCache | null = null;

export async function setLastKnownSubscription(dto: SubscriptionDTO): Promise<void> {
  const entry: SubscriptionCache = {
    userId: dto.userId,
    status: dto.status,
    currentPeriodEnd: dto.currentPeriodEnd ?? null,
    updatedAt: Date.now(),
  };
  _subsCacheMemory = entry;
  try { await AsyncStorage.setItem(SUBS_CACHE_KEY, JSON.stringify(entry)); } catch {}
}
export async function getLastKnownSubscription(): Promise<SubscriptionCache | null> {
  if (_subsCacheMemory) return _subsCacheMemory;
  try {
    const raw = await AsyncStorage.getItem(SUBS_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as SubscriptionCache;
    _subsCacheMemory = entry;
    return entry;
  } catch { return null; }
}
/** Retorna true se o último status conhecido for ACTIVE (sem chamar backend). */
export async function isSubscriptionActiveCached(): Promise<boolean> {
  const entry = await getLastKnownSubscription();
  return !!entry && entry.status === "ACTIVE";
}

async function ensureUserId(): Promise<string> {
  let uid = getUserIdFromToken();
  if (!uid) {
    const me = await initCurrentUserFromToken().catch(() => null);
    uid = (me as any)?.id || null;
  }
  if (!uid) throw toApiError(new Error("Usuário não autenticado"), 401);
  return String(uid);
}

export async function createPixCheckout(userId?: string): Promise<CheckoutResponse> {
  const uid = userId || await ensureUserId();
  const url = buildUrl(routes.payments.checkout);
  const reqId = nextReqId("PAY");
  logPay("REQ", { reqId, op: "checkout", url, body: { userId: uid } });

  try {
    const out = await postJson<CheckoutResponse>(url, { userId: uid }, {
      timeoutMs: timeouts["POST /api/payments/checkout"], retries: 1
    });
    logPay("RES", {
      reqId, op: "checkout",
      txid: out?.txid,
      amount: out?.amount,
      expiresAt: out?.expiresAt,
      preview: {
        copiaECola: out?.copiaECola ? `${out.copiaECola.slice(0, 12)}…` : null,
        qrPngBase64Bytes: out?.qrPngBase64 ? out.qrPngBase64.length : 0
      }
    });
    return out;
  } catch (e: any) {
    const er = toApiError(e);
    logPay("ERR", { reqId, op: "checkout", status: er.status, message: er.message, friendly: er.friendly });
    throw er;
  }
}

export async function getPaymentStatus(txid: string): Promise<PaymentStatusResponse> {
  const url = buildUrl(routes.payments.status, { txid });
  const reqId = nextReqId("PAY");
  logPay("REQ", { reqId, op: "status", url, txid });

  try {
    const out = await getJson<PaymentStatusResponse>(url, {
      timeoutMs: timeouts["GET /api/payments/status/:txid"], retries: 1, idempotentKey: makeKey("GET", url)
    });
    logPay("RES", { reqId, op: "status", txid: out?.txid, paymentStatus: out?.paymentStatus, subscriptionStatus: out?.subscriptionStatus });
    return out;
  } catch (e: any) {
    const er = toApiError(e);
    logPay("ERR", { reqId, op: "status", txid, status: er.status, message: er.message, friendly: er.friendly });
    throw er;
  }
}

/**
 * Tenta POST /verify; se o servidor não aceitar (405/404/501),
 * faz fallback para GET /status/:txid e retorna changed:false.
 */
export async function verifyPayment(txid: string): Promise<VerifyResponse> {
  const url = buildUrl(routes.payments.verify, { txid });
  const reqId = nextReqId("PAY");
  logPay("REQ", { reqId, op: "verify", url, txid });

  try {
    const out = await postJson<VerifyResponse>(url, null, {
      timeoutMs: timeouts["POST /api/payments/verify/:txid"],
      retries: retries["POST /api/payments/verify/:txid"],
      idempotentKey: makeKey("POST", url)
    });
    logPay("RES", { reqId, op: "verify", txid: out?.txid, paymentStatus: out?.paymentStatus, subscriptionStatus: out?.subscriptionStatus, changed: out?.changed });
    return out;
  } catch (e: any) {
    const er = toApiError(e);
    if (er.status === 405 || er.status === 404 || er.status === 501) {
      const s = await getPaymentStatus(txid);
      logPay("RES", { reqId, op: "verify->status-fallback", txid: s?.txid, paymentStatus: s?.paymentStatus, subscriptionStatus: s?.subscriptionStatus });
      return { ...s, changed: false };
    }
    logPay("ERR", { reqId, op: "verify", txid, status: er.status, message: er.message, friendly: er.friendly });
    throw er;
  }
}

export async function confirmPaymentManual(txid: string): Promise<void> {
  const url = buildUrl(routes.payments.confirm, { txid });
  const reqId = nextReqId("PAY");
  logPay("REQ", { reqId, op: "confirm", url, txid });

  try {
    await postJson<void>(url, null, { timeoutMs: 15_000 });
    logPay("RES", { reqId, op: "confirm", txid, ok: true });
  } catch (e: any) {
    if (e?.status === 404) {
      logPay("RES", { reqId, op: "confirm", txid, note: "endpoint 404 (ambiente DEV?) — ignorado" });
      return;
    }
    const er = toApiError(e);
    logPay("ERR", { reqId, op: "confirm", txid, status: er.status, message: er.message, friendly: er.friendly });
    throw er;
  }
}

export async function getSubscriptionStatus(userId?: string): Promise<SubscriptionDTO> {
  const uid = userId || await ensureUserId();
  const url = buildUrl(routes.subscriptions.status, { userId: uid });
  const reqId = nextReqId("PAY");
  logPay("REQ", { reqId, op: "subs.status", url, userId: uid });

  try {
    const out = await getJson<SubscriptionDTO>(url, {
      timeoutMs: timeouts["GET /api/subscriptions/:userId/status"], retries: 1, idempotentKey: makeKey("GET", url)
    });
    // Atualiza cache local para gating no app, sem novas requisições
    await setLastKnownSubscription(out);
    logPay("RES", { reqId, op: "subs.status", userId: uid, status: out?.status, currentPeriodEnd: out?.currentPeriodEnd });
    return out;
  } catch (e: any) {
    const er = toApiError(e);
    logPay("ERR", { reqId, op: "subs.status", userId: uid, statusCode: er.status, message: er.message, friendly: er.friendly });
    throw er;
  }
}

export async function cancelSubscriptionAtPeriodEnd(userId?: string): Promise<void> {
  const uid = userId || await ensureUserId();
  const url = buildUrl(routes.subscriptions.cancelAtPeriodEnd, { userId: uid });
  const reqId = nextReqId("PAY");
  logPay("REQ", { reqId, op: "subs.cancelAtPeriodEnd", url, userId: uid });

  try {
    await postJson<void>(url, null, { timeoutMs: timeouts["POST /api/subscriptions/:userId/cancel-at-period-end"], retries: 1 });
    logPay("RES", { reqId, op: "subs.cancelAtPeriodEnd", userId: uid, ok: true });
  } catch (e: any) {
    const er = toApiError(e);
    logPay("ERR", { reqId, op: "subs.cancelAtPeriodEnd", userId: uid, status: er.status, message: er.message, friendly: er.friendly });
    throw er;
  }
}

export async function pollPaymentUntilConfirmed(
  txid: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<PaymentStatusResponse> {
  const intervalMs = Math.max(1000, opts.intervalMs ?? 5000);
  const timeoutMs = Math.max(intervalMs, opts.timeoutMs ?? 15 * 60_000);
  const t0 = Date.now();
  const corrId = nextReqId("POLL");

  logPay("REQ", { corrId, op: "poll", txid, intervalMs, timeoutMs, startAt: new Date(t0).toISOString() });

  // 1ª leitura via STATUS (curta-circuita se já confirmado)
  let last: PaymentStatusResponse = await getPaymentStatus(txid);
  let lastSeen = last.paymentStatus;

  if (last.paymentStatus === "CONFIRMED") {
    logPay("RES", { corrId, op: "poll", txid, final: last.paymentStatus, tookMs: Date.now() - t0 });
    return last;
  }

  while (Date.now() - t0 < timeoutMs) {
    await sleep(intervalMs + Math.floor(Math.random() * 400));
    try {
      const v = await verifyPayment(txid); // possui fallback interno para STATUS em 405/404/501
      last = { txid: v.txid, paymentStatus: v.paymentStatus, subscriptionStatus: v.subscriptionStatus };
    } catch (e: any) {
      const er = toApiError(e);
      logPay("ERR", { corrId, op: "poll.verify", txid, status: er.status, message: er.message, friendly: er.friendly });
      // Fallback adicional: mesmo se verify falhar por outro motivo, consultar STATUS
      last = await getPaymentStatus(txid);
    }

    if (last.paymentStatus !== lastSeen) {
      logPay("RES", { corrId, op: "poll.tick", txid, state: last.paymentStatus });
      lastSeen = last.paymentStatus;
    }
    if (last.paymentStatus === "CONFIRMED" || last.paymentStatus === "FAILED" || last.paymentStatus === "EXPIRED") {
      logPay("RES", { corrId, op: "poll", txid, final: last.paymentStatus, tookMs: Date.now() - t0 });
      return last;
    }
  }

  logPay("RES", { corrId, op: "poll", txid, final: last.paymentStatus, timedOut: true, tookMs: Date.now() - t0 });
  return last;
}

/* -----------------------------------------------------------------------
   ⚠️ Este arquivo está em `app/`. O Expo Router tenta tratá-lo como rota.
   O "noop" abaixo impede isso sem afetar os named exports.
------------------------------------------------------------------------- */
const __noop = {} as never;
export default __noop;
