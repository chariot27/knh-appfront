// gateway/api.ts
import { routes, buildUrl } from "./routes";

export type RegisterPayload = {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
  tipo: "CONSULTOR" | "PROFISSIONAL" | "EMPRESA";
  bio?: string;
  tags?: string[];
  avatarUrl?: string; // data URL (temporário) ou URL
};

type RequestOpts = {
  timeoutMs?: number;
  retries?: number; // re-tenta apenas para timeout/5xx
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
) {
  const { timeoutMs = 20000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function logCompactPayload(label: string, payload: unknown) {
  const safe: any = payload ? JSON.parse(JSON.stringify(payload)) : payload;
  if (safe?.avatarUrl && typeof safe.avatarUrl === "string") {
    safe.avatarUrl = `<data-url: ${safe.avatarUrl.length} chars>`;
  }
  console.log(`${label} `, JSON.stringify(safe, null, 2));
}

async function postJson<TReq, TRes>(
  url: string,
  body: TReq,
  opts: RequestOpts = {}
): Promise<TRes> {
  const attemptMax = Math.max(1, opts.retries ?? 1);
  let lastErr: any = null;

  for (let attempt = 1; attempt <= attemptMax; attempt++) {
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logCompactPayload(`📤 [${reqId}] POST ${url} — payload:`, body);

    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: opts.timeoutMs ?? 20000,
      });

      const text = await res.text().catch(() => "");
      const parsed: any = (() => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return text || {};
        }
      })();

      console.log(
        `📥 [${reqId}] ${res.status} ${res.statusText} — resposta:`,
        typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)
      );

      if (!res.ok) {
        const serverMsg =
          (typeof parsed === "string" ? parsed : parsed?.message) ||
          `HTTP ${res.status}`;

        // não re-tenta 4xx
        if (res.status >= 400 && res.status < 500) {
          throw new Error(serverMsg);
        }
        throw new Error(serverMsg);
      }

      return parsed as TRes;
    } catch (err: any) {
      const isAbort = err?.name === "AbortError";
      lastErr = isAbort ? new Error("Timeout na requisição") : err;

      // só re-tenta timeout/5xx
      const shouldRetry = isAbort || /HTTP 5\d{2}/.test(lastErr?.message || "");
      console.warn(
        `⚠️ tentativa ${attempt}/${attemptMax} falhou: ${lastErr?.message || lastErr}`
      );

      if (!shouldRetry || attempt >= attemptMax) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  throw lastErr ?? new Error("Falha desconhecida");
}

export async function registerUser(payload: RegisterPayload) {
  const url = buildUrl(routes.users.register);
  return postJson<RegisterPayload, any>(url, payload, {
    timeoutMs: 25000,
    retries: 2, // ajuda em cold start no Render
  });
}
