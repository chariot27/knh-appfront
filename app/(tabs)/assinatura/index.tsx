import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  Alert,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { StripeProvider, initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";
import {
  getUserIdFromToken,
  getLastLoginEmail,
  startStripeSubscription,
  getSubscriptionStatus,
  pollSubscriptionUntilActive,
  isSubscriptionActiveCached,
  getUserSubscriptionId,
  saveUserSubscriptionId,
  setLastKnownSubscription,
  type SubscriptionBackendStatus,
  type SubscribeResponse,
} from "../gateway/api";

// === CONFIG ===
const PRICE_ID = "price_1Rw5xXRXxX1XNxE59Gn5KzA3";
const MERCHANT_NAME = "Sua Empresa";
const MERCHANT_COUNTRY = "BR"; // usado dentro do googlePay

/* ---------------- utils: retry com backoff + jitter ---------------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randJitter = (ms: number) => {
  const delta = ms * 0.25;
  return Math.max(0, ms + (Math.random() * 2 - 1) * delta);
};
function isRetryableError(e: any) {
  const status = e?.status ?? e?.response?.status;
  const code = e?.code ?? e?.stripeError?.code ?? e?.error?.code;
  const msg = (e?.message ?? e?.error?.message ?? "").toString().toLowerCase();
  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  if (code && ["rate_limit", "api_connection_error", "api_error", "lock_timeout", "idempotency_error"].includes(code)) return true;
  if (
    msg.includes("network request failed") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("temporarily") ||
    msg.includes("unavailable")
  )
    return true;
  return false;
}
async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 3500,
    factor = 2,
    shouldRetry,
  }: {
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    shouldRetry?: (e: any, attempt: number) => boolean;
  } = {}
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const can = (shouldRetry ? shouldRetry(e, attempt) : isRetryableError(e)) && attempt < retries;
      if (!can) throw e;
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt));
      await sleep(randJitter(delay));
      attempt++;
    }
  }
}

/* ----------------------------- componente ----------------------------- */

export default function AssinaturaScreen() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SubscriptionBackendStatus | "UNKNOWN">("UNKNOWN");
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const [flow, setFlow] = useState<null | { publishableKey: string; sub: SubscribeResponse }>(null);

  const busyRef = useRef(false);
  const canManage = useMemo(() => status === "ACTIVE" || status === "TRIALING", [status]);

  const boot = useCallback(async () => {
    const cachedActive = await isSubscriptionActiveCached();
    if (cachedActive) setStatus("ACTIVE");

    const uid = getUserIdFromToken();
    if (!uid) return;

    const sid = await getUserSubscriptionId(uid);
    if (!sid) return;

    setSubscriptionId(sid);

    if (!cachedActive && status !== "TRIALING") {
      try {
        const st = await withRetry(() => getSubscriptionStatus(sid), { retries: 2, baseDelayMs: 400, maxDelayMs: 2000 });
        setStatus(st.status);
      } catch {
        /* silencioso */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function startFlowGooglePay() {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const uid = getUserIdFromToken();
      const email = await getLastLoginEmail();

      const sub = await withRetry(
        () =>
          startStripeSubscription({
            userId: uid || undefined,
            email: email || undefined,
            priceId: PRICE_ID,
            pmMode: "auto",
          }),
        { retries: 3, baseDelayMs: 500, maxDelayMs: 3500, shouldRetry: (e) => isRetryableError(e) }
      );

      setSubscriptionId(sub.subscriptionId);
      if (uid) await saveUserSubscriptionId(uid, sub.subscriptionId);

      setFlow({ publishableKey: sub.publishableKey, sub });
    } catch (e: any) {
      const msg = e?.friendly || e?.message || "Não foi possível iniciar a assinatura.";
      Alert.alert("Erro", msg);
      busyRef.current = false;
      setLoading(false);
    }
  }

  function handleRunnerDone(finalStatus?: SubscriptionBackendStatus) {
    if (finalStatus) setStatus(finalStatus);
    setFlow(null);
    busyRef.current = false;
    setLoading(false);
  }

  async function handleChecarStatus() {
    if (!subscriptionId) {
      Alert.alert("Assinatura", "Nenhuma assinatura em andamento.");
      return;
    }
    setLoading(true);
    try {
      const st = await withRetry(() => getSubscriptionStatus(subscriptionId), { retries: 2, baseDelayMs: 400, maxDelayMs: 2000 });
      setStatus(st.status);
      Alert.alert("Status", `Assinatura: ${st.status}`);
    } catch (e: any) {
      Alert.alert("Erro", e?.friendly || e?.message || "Falha ao consultar status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0f14" }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 }}>
          <View style={{ width: "100%", maxWidth: 440, alignItems: "center" }}>
            <Text style={{ color: "white", fontSize: 24, fontWeight: "800", textAlign: "center" }}>Plano Premium</Text>
            <Text style={{ color: "#b6c2cf", fontSize: 16, marginTop: 8, textAlign: "center" }}>
              Acesse todos os recursos avançados e suporte prioritário.
            </Text>

            <View
              style={{
                backgroundColor: "#111827",
                borderRadius: 16,
                padding: 18,
                width: "100%",
                marginTop: 16,
                borderWidth: 1,
                borderColor: "#1f2937",
              }}
            >
              <Text style={{ color: "white", fontSize: 20, fontWeight: "800", textAlign: "center" }}>R$ 49,90 / mês</Text>
              <Text style={{ color: "#9CA3AF", marginTop: 6, textAlign: "center" }}>Cancele quando quiser. Sem fidelidade.</Text>
              {subscriptionId ? (
                <Text style={{ color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>ID da assinatura: {subscriptionId}</Text>
              ) : null}
              <Text style={{ color: "#D1FAE5", marginTop: 8, textAlign: "center" }}>
                Status: {status === "UNKNOWN" ? "—" : status}
              </Text>
            </View>

            {/* ÚNICO BOTÃO: Google Pay (via PaymentSheet) */}
            <TouchableOpacity
              onPress={startFlowGooglePay}
              disabled={loading}
              style={{
                backgroundColor: loading ? "#374151" : "#22c55e",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
                width: "100%",
                maxWidth: 440,
                marginTop: 16,
              }}
            >
              {loading ? (
                <ActivityIndicator />
              ) : (
                <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
                  {canManage ? "Gerir pagamento" : Platform.OS === "android" ? "Assinar com Google Pay" : "Assinar"}
                </Text>
              )}
            </TouchableOpacity>

            {/* Ver status */}
            <TouchableOpacity
              onPress={handleChecarStatus}
              disabled={loading}
              style={{
                backgroundColor: "#111827",
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#1f2937",
                width: "100%",
                maxWidth: 440,
                marginTop: 12,
              }}
            >
              <Text style={{ color: "white", fontSize: 15 }}>Checar status</Text>
            </TouchableOpacity>

            <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 12, textAlign: "center" }}>
              Dica: toques repetidos são consolidados para evitar erros de idempotência.
            </Text>
          </View>
        </View>
      </ScrollView>

      {flow && (
        <StripeProvider publishableKey={flow.publishableKey}>
          <PaymentSheetRunner sub={flow.sub} onDone={handleRunnerDone} />
        </StripeProvider>
      )}
    </SafeAreaView>
  );
}

/** Runner: confirma PI/SI via PaymentSheet (ativa Google Pay no Android) */
function PaymentSheetRunner({
  sub,
  onDone,
}: {
  sub: SubscribeResponse;
  onDone: (finalStatus?: SubscriptionBackendStatus) => void;
}) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const hasPI = !!sub.paymentIntentClientSecret;
      const hasSI = !!sub.setupIntentClientSecret;

      if (!hasPI && !hasSI) {
        if (sub.hostedInvoiceUrl) {
          try {
            await Linking.openURL(sub.hostedInvoiceUrl);
          } catch {}
        } else {
          Alert.alert("Pagamento", "Nenhum client secret recebido.");
        }
        onDone();
        return;
      }

      // 1) init PaymentSheet (com Google Pay ligado no Android + customer)
      try {
        await withRetry(
          async () => {
            const initRes = await initPaymentSheet({
              merchantDisplayName: MERCHANT_NAME,
              customerId: sub.customerId,
              customerEphemeralKeySecret: sub.ephemeralKeySecret,
              googlePay: {
                merchantCountryCode: MERCHANT_COUNTRY,
                testEnv: !!__DEV__,
              },
              ...(hasPI
                ? { paymentIntentClientSecret: sub.paymentIntentClientSecret! }
                : { setupIntentClientSecret: sub.setupIntentClientSecret! }),
            });
            if ((initRes as any)?.error) throw (initRes as any).error;
          },
          { retries: 3, baseDelayMs: 500, maxDelayMs: 4000 }
        );
      } catch (e: any) {
        Alert.alert("Pagamento", e?.message || "Falha ao inicializar pagamento.");
        onDone();
        return;
      }

      // 2) Apresenta a PaymentSheet
      try {
        await withRetry(
          async () => {
            const res = await presentPaymentSheet();
            if ((res as any)?.error) {
              const code = (res as any).error?.code;
              if (code === "Canceled" || code === "CanceledByUser") {
                throw Object.assign(new Error("Canceled"), { retryable: false });
              }
              throw (res as any).error;
            }
          },
          { retries: 1, baseDelayMs: 600, maxDelayMs: 2000, shouldRetry: (e) => e?.retryable !== false && isRetryableError(e) }
        );
      } catch (e: any) {
        if (e?.message !== "Canceled") {
          Alert.alert("Pagamento", e?.message || "Não foi possível concluir o pagamento.");
        }
        onDone();
        return;
      }

      // 3) poll até ACTIVE/TRIALING
      try {
        const finalSt = await pollSubscriptionUntilActive(sub.subscriptionId, { intervalMs: 1500, maxMs: 60_000 });

        const uid = getUserIdFromToken();
        if (uid) {
          await setLastKnownSubscription({
            userId: uid,
            status: finalSt.status,
            currentPeriodEnd: finalSt.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: finalSt.cancelAtPeriodEnd,
          });
        }

        Alert.alert("Assinatura", finalSt.status === "ACTIVE" ? "Assinatura ativa!" : "Assinatura iniciada (período de teste).");
        onDone(finalSt.status);
      } catch {
        Alert.alert("Assinatura", "Pagamento confirmado, mas não deu para confirmar o status agora. Tente checar mais tarde.");
        onDone();
      }
    })();
  }, [sub, onDone]);

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.35)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator />
      <Text style={{ color: "white", marginTop: 8 }}>
        {Platform.OS === "android" ? "Abrindo Google Pay…" : "Abrindo pagamento…"}
      </Text>
    </View>
  );
}
