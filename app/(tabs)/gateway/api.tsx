import AsyncStorage from "@react-native-async-storage/async-storage";

/* =================== Polyfill base64 (RN) =================== */
let __b64decode: ((s: string) => string) | undefined;
try { const mod = require("base-64"); __b64decode = mod?.decode; } catch { __b64decode = undefined; }
if (typeof globalThis.atob === "undefined") {
  if (__b64decode) { // @ts-ignore
    globalThis.atob = __b64decode;
  } else {
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
  },
  matches: {
    invite:          { path: "/api/matches/invite",           method: "POST" } as RouteEntry,
    accept:          { path: "/api/matches/accept",           method: "POST" } as RouteEntry,
    listForUser:     { path: "/api/matches/user/:userId",     method: "GET"  } as RouteEntry,
    sentInvites:     { path: "/api/matches/invites/sent",     method: "GET"  } as RouteEntry,      // pode não existir
    receivedInvites: { path: "/api/matches/invites/received", method: "GET"  } as RouteEntry,      // pode não existir
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

/* ========== DEBUG HTTP (logs completos) ========== */
const DEBUG_HTTP = true;
let __reqSeq = 0;
const nextReqId = (p: string) => { __reqSeq = (__reqSeq + 1) % 1_000_000; return `${p}-${Date.now()}-${__reqSeq}`; };
const redactHeaders = (h?: Record<string, any>) => { if (!h) return h; const o = { ...h }; const k = Object.keys(o).find(x => x.toLowerCase() === "authorization"); if (k && typeof o[k] === "string") o[k] = "Bearer ****"; return o; };
const toPrintableBody = (b: any) => { try { return typeof b === "string" ? b : JSON.stringify(b); } catch { return String(b); } };
function logHttp(tag: "REQ" | "RES" | "ERR", payload: any) {
  if (!DEBUG_HTTP) return; try { console.log(`[HTTP][${tag}]`, JSON.stringify(payload, null, 2)); } catch { console.log(`[HTTP][${tag}]`, payload); }
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
export function clearAuthToken() { _authToken = null; _currentUser = null; _perfilCache.clear(); AsyncStorage.removeItem(AUTH_KEY).catch(() => {}); }
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
type RequestOpts = { timeoutMs?: number; retries?: number; auth?: boolean };
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 20000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json", ...(rest.headers || {}) };
    return await fetch(input, { ...rest, headers, signal: controller.signal });
  } finally { clearTimeout(id); }
}
// seguro mesmo se não houver atob
function b64urlToString(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
  if (typeof atob !== "function") return "";
  try { const raw = atob(b64); // eslint-disable-next-line deprecation/deprecation
    return decodeURIComponent(escape(raw)); } catch { return ""; }
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
  } catch { return null; }
}

async function getJson<TRes>(url: string, opts: RequestOpts = {}): Promise<TRes> {
  const attemptMax = Math.max(1, opts.retries ?? 1);
  const useAuth = opts.auth !== false; // default true
  let lastErr: any = null;

  for (let attempt = 1; attempt <= attemptMax; attempt++) {
    const reqId = nextReqId("GET");
    const t0 = Date.now();
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (useAuth && _authToken) headers.Authorization = `Bearer ${_authToken}`;

      logHttp("REQ", { reqId, method: "GET", url, headers: redactHeaders(headers) });

      const res = await fetchWithTimeout(url, { method: "GET", headers, timeoutMs: opts.timeoutMs ?? 20000 });
      const text = await res.text().catch(() => "");
      logHttp("RES", { reqId, url, status: res.status, ms: Date.now() - t0, body: text?.slice(0, 8000) });

      const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
      if (!res.ok) {
        if (res.status === 401 && _authToken) clearAuthToken();
        const err = new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
        (err as any).status = res.status;
        throw err;
      }
      return parsed as TRes;
    } catch (err: any) {
      lastErr = err;
      logHttp("ERR", { reqId, url, msg: err?.message || String(err), stack: err?.stack, attempt, ms: Date.now() - t0 });
      if (attempt >= attemptMax) break;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastErr ?? new Error("Falha desconhecida");
}

async function postMultipart<TRes>(url: string, form: FormData, opts: RequestOpts = {}) {
  const reqId = nextReqId("POST-MULTI");
  const t0 = Date.now();
  const useAuth = opts.auth !== false; // default true
  const headers: Record<string, string> = { Accept: "application/json" };
  if (useAuth && _authToken) headers.Authorization = `Bearer ${_authToken}`;

  logHttp("REQ", { reqId, method: "POST", url, headers: redactHeaders(headers), body: "<FormData>" });

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: form,
      timeoutMs: opts.timeoutMs ?? 25000,
    });
    const text = await res.text().catch(() => "");
    logHttp("RES", { reqId, url, status: res.status, ms: Date.now() - t0, body: text?.slice(0, 8000) });

    const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
    if (!res.ok) {
      if (res.status === 401 && _authToken) clearAuthToken();
      const err = new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return parsed as TRes;
  } catch (err: any) {
    logHttp("ERR", { reqId, url, msg: err?.message || String(err), stack: err?.stack, ms: Date.now() - t0 });
    throw err;
  }
}

async function postJson<TRes>(url: string, body: any, opts: RequestOpts = {}) {
  const reqId = nextReqId("POST");
  const t0 = Date.now();
  const useAuth = opts.auth !== false; // default true
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (useAuth && _authToken) headers.Authorization = `Bearer ${_authToken}`;

  logHttp("REQ", { reqId, method: "POST", url, headers: redactHeaders(headers), body: toPrintableBody(body) });

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: opts.timeoutMs ?? 20000,
    });
    const text = await res.text().catch(() => "");
    logHttp("RES", { reqId, url, status: res.status, ms: Date.now() - t0, body: text?.slice(0, 8000) });

    const parsed: any = (() => { try { return text ? JSON.parse(text) : {}; } catch { return text || {}; } })();
    if (!res.ok) {
      if (res.status === 401 && _authToken) clearAuthToken();
      const err = new Error(typeof parsed === "string" ? parsed : parsed?.message || `HTTP ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return parsed as TRes;
  } catch (err: any) {
    logHttp("ERR", { reqId, url, body: toPrintableBody(body), msg: err?.message || String(err), stack: err?.stack, ms: Date.now() - t0 });
    throw err;
  }
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
    form.append("avatar", {
      uri: file.uri,
      name: file.name || "upload",
      type: file.type || "application/octet-stream",
    } as any);
  }
  return postMultipart<any>(url, form, { timeoutMs: 25000, retries: 2, auth: false });
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const url = buildUrl(routes.users.login);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };

  const reqId = nextReqId("POST-LOGIN");
  const t0 = Date.now();
  logHttp("REQ", { reqId, method: "POST", url, headers, body: toPrintableBody(payload) });

  const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(payload), timeoutMs: 20000 });
  const text = await res.text().catch(() => "");
  logHttp("RES", { reqId, url, status: res.status, ms: Date.now() - t0, body: text?.slice(0, 8000) });

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
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

export async function uploadVideo(input: UploadVideoInput): Promise<VideoDTO> {
  let userId = getUserIdFromToken();
  if (!userId) { try { const me = await initCurrentUserFromToken(); userId = me?.id ?? (null as any); } catch {} }

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
    return await postMultipart<VideoDTO>(url, form, { timeoutMs: UPLOAD_TIMEOUT_MS, retries: 0 });
  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("network request failed") || msg.includes("abort") || msg.includes("networkerror")) {
      throw new Error("Falha de rede/timeout durante upload. Tente novamente em uma conexão estável.");
    }
    throw e;
  }
}

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
  } catch { return false; }
}

/* cache do feed prontos (READY) */
const FEED_CACHE_KEY = "FEED_CACHE_V2";
const FEED_TTL_MS = 15_000;
export async function fetchFeedReady(limit = 12, opts?: { preflight?: boolean }): Promise<VideoDTO[]> {
  const url = buildUrl(routes.videos.ready, undefined, { limit });
  try {
    const list = await getJson<VideoDTO[]>(url, { timeoutMs: 15_000, retries: 1 });
    let ready = (list || []).filter(v => typeof v.hlsMasterUrl === "string" && !!v.hlsMasterUrl);

    const doPreflight = opts?.preflight !== false;
    if (doPreflight && ready.length) {
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

/* ======================= MATCH/INVITE: Tipos ======================= */
export type UUID = string;
/** Alinhado com o backend (enum) */
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
  inviterAvatar?: string;   // URL CDN (renderizar direto)
  status: InviteStatus;
  createdAt: string;
};

export type InviteResponse = {
  matched: boolean;
  matchId?: UUID;
  invite?: InviteDTO;
};

export type AcceptRequest = { inviteId?: UUID; inviterId?: UUID; targetId?: UUID; };
export type AcceptDTO = { id: UUID; inviteId: UUID; inviterName?: string; inviterPhone?: string; inviterAvatar?: string; createdAt: string; };
export type MatchDTO = { id: UUID; userA: UUID; userB: UUID; conviteMutuo: boolean; createdAt: string; };

/* ======================= INVITES: CACHE LOCAL =======================
   Estrutura:
   - INV_SENT_V1:<inviterId>  -> InviteDTO[] (convites que EU ENVIEI)
   - INV_RECV_V1:<targetId>   -> InviteDTO[] (convites que EU RECEBI)
   - INV_IDX_V1:<inviteId>    -> {inviterId, targetId} (índice para updates)
==================================================================== */
const INV_SENT_PREFIX = "INV_SENT_V1:";
const INV_RECV_PREFIX = "INV_RECV_V1:";
const INV_INDEX_PREFIX = "INV_IDX_V1:";

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

/** Escreve o convite nas caixas corretas (enviados do remetente + recebidos do alvo) */
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

/** Atualiza status do convite nas duas caixas (usando índice por inviteId) */
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

/** Listas do cache local */
async function listInvitesSentLocal(userId: string, status?: InviteStatus): Promise<InviteDTO[]> {
  const list = await _readList(INV_SENT_PREFIX + userId);
  return status ? list.filter(i => i.status === status) : list;
}
async function listInvitesReceivedLocal(userId: string, status?: InviteStatus): Promise<InviteDTO[]> {
  const list = await _readList(INV_RECV_PREFIX + userId);
  return status ? list.filter(i => i.status === status) : list;
}

/* ======================= MATCH: Helpers ======================= */
async function ensureMe() {
  if (!_currentUser) await initCurrentUserFromToken().catch(() => null);
  if (!_currentUser) throw new Error("Usuário não autenticado");
  return _currentUser as User | PerfilResponse;
}

/** Monta InviteRequest com seu perfil e targetId do dono do vídeo */
export async function buildInvitePayloadFromProfile(targetId: string): Promise<InviteRequest> {
  const me = await ensureMe();
  const meId = (me as any).id || getUserIdFromToken();
  if (!meId) throw new Error("Não foi possível obter seu userId");
  return {
    inviterId: String(meId),
    targetId: String(targetId),
    inviterName: me.nome,
    inviterPhone: me.telefone,
    inviterAvatar: (me as any).avatarUrl ?? undefined,
  };
}

/** POST /api/matches/invite + grava em cache local (enviado e recebido) */
export async function inviteMatchForTarget(targetId: string): Promise<InviteResponse> {
  const body = await buildInvitePayloadFromProfile(targetId);
  const url = buildUrl(routes.matches.invite);
  const res = await postJson<InviteResponse>(url, body);
  // Salva o convite nas caixas locais (se não virou match imediato)
  if (!res.matched && res.invite) {
    await _cacheAddInviteBoth(res.invite);
  }
  return res;
}

/** POST /api/matches/accept com inviteId (preferível na tela de convites) + atualiza cache */
export async function acceptInvite(inviteId: string): Promise<AcceptDTO> {
  const url = buildUrl(routes.matches.accept);
  const out = await postJson<AcceptDTO>(url, { inviteId } as AcceptRequest);
  await _cacheUpdateInviteStatus(inviteId, "ACCEPTED");
  return out;
}

/** (ainda disponível) POST /api/matches/accept com par (inviterId, targetId) */
export async function acceptMatchByPair(inviterId: string, targetId: string): Promise<AcceptDTO> {
  const url = buildUrl(routes.matches.accept);
  const out = await postJson<AcceptDTO>(url, { inviterId, targetId } as AcceptRequest);
  return out;
}

/** GET /api/matches/user/:userId */
export async function listMyMatches(userId?: string): Promise<MatchDTO[]> {
  let uid = userId || getUserIdFromToken();
  if (!uid) {
    const me = await ensureMe();
    // @ts-ignore
    uid = me?.id;
  }
  const url = buildUrl(routes.matches.listForUser, { userId: String(uid) });
  return getJson<MatchDTO[]>(url, { timeoutMs: 15000, retries: 1 });
}

/** GET /api/matches/invites/sent?userId=...&status=...  (404 => fallback cache) */
export async function listInvitesSent(userId?: string, status?: InviteStatus): Promise<InviteDTO[]> {
  let uid = userId || getUserIdFromToken();
  if (!uid) {
    const me = await initCurrentUserFromToken().catch(() => null);
    // @ts-ignore
    uid = me?.id;
  }
  const url = buildUrl(routes.matches.sentInvites, undefined, { userId: String(uid), status });
  try {
    return await getJson<InviteDTO[]>(url, { timeoutMs: 15000, retries: 1 });
  } catch (e: any) {
    if (e?.status === 404) {
      console.warn("[listInvitesSent] endpoint ausente (404) — usando cache local");
      return listInvitesSentLocal(String(uid), status);
    }
    // também faz fallback para cache em falhas de rede
    return listInvitesSentLocal(String(uid), status);
  }
}

/** GET /api/matches/invites/received?userId=...&status=...  (404 => fallback cache) */
export async function listInvitesReceived(userId?: string, status?: InviteStatus): Promise<InviteDTO[]> {
  let uid = userId || getUserIdFromToken();
  if (!uid) {
    const me = await initCurrentUserFromToken().catch(() => null);
    // @ts-ignore
    uid = me?.id;
  }
  const url = buildUrl(routes.matches.receivedInvites, undefined, { userId: String(uid), status });
  try {
    return await getJson<InviteDTO[]>(url, { timeoutMs: 15000, retries: 1 });
  } catch (e: any) {
    if (e?.status === 404) {
      console.warn("[listInvitesReceived] endpoint ausente (404) — usando cache local");
      return listInvitesReceivedLocal(String(uid), status);
    }
    // também faz fallback para cache em falhas de rede
    return listInvitesReceivedLocal(String(uid), status);
  }
}

/* -----------------------------------------------------------------------
   ⚠️ Se este arquivo estiver dentro de `app/`, o Expo Router tenta tratá-lo
   como rota e mostra um WARN sobre default export. Enquanto isso:
------------------------------------------------------------------------- */
const __noop = {} as never;
export default __noop;
