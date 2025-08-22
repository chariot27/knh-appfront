import {
  StripeProvider,
  initPaymentSheet,
  isPlatformPaySupported,
  presentPaymentSheet,
  retrieveSetupIntent,
} from "@stripe/stripe-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  confirmInitialInvoicePayment,
  getLastLoginEmail,
  getSubscriptionStatus,
  getUserIdFromToken,
  getUserSubscriptionId,
  isSubscriptionActiveCached,
  pollSubscriptionUntilActive,
  saveUserSubscriptionId,
  setLastKnownSubscription,
  startStripeSubscription,
  type SubscribeResponse,
  type SubscriptionBackendStatus,
} from "../gateway/api";

/** ======================= CONFIG ======================= */
const PRICE_ID = process.env.EXPO_PUBLIC_STRIPE_PRICE_ID ?? "price_1Rw5xXRXxX1XNxE59Gn5KzA3";
const MERCHANT_NAME = process.env.EXPO_PUBLIC_MERCHANT_NAME ?? "Ars";
const MERCHANT_COUNTRY = process.env.EXPO_PUBLIC_MERCHANT_COUNTRY ?? "BR"; // Google Pay
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PK; // usado se movermos o Provider para cá

/** ========== utils: retry com backoff + jitter + abort ========= */
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
async function withRetryAbortable<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  {
    signal,
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 3500,
    factor = 2,
    shouldRetry,
  }: {
    signal?: AbortSignal;
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    shouldRetry?: (e: any, attempt: number) => boolean;
  } = {}
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn(signal);
    } catch (e) {
      const can = (shouldRetry ? shouldRetry(e, attempt) : isRetryableError(e)) && attempt < retries;
      if (!can) throw e;
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt));
      await sleep(randJitter(delay));
      attempt++;
    }
  }
}

function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  return mounted;
}

/** ======================= TELA PRINCIPAL (somente visual ajustado p/ centralizar) ======================= */
export default function AssinaturaScreen() {
  const mounted = useMountedRef();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SubscriptionBackendStatus | "UNKNOWN">("UNKNOWN");
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [platformPaySupported, setPlatformPaySupported] = useState<boolean | null>(null);

  const [flow, setFlow] = useState<null | { publishableKey: string; sub: SubscribeResponse }>(null);

  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const canManage = useMemo(() => status === "ACTIVE" || status === "TRIALING", [status]);

  useEffect(() => {
    (async () => {
      try {
        const supported = await isPlatformPaySupported();
        if (mounted.current) setPlatformPaySupported(!!supported);
      } catch {
        if (mounted.current) setPlatformPaySupported(null); // desconhecido
      }
    })();
  }, [mounted]);

  const boot = useCallback(async () => {
    const cachedActive = await isSubscriptionActiveCached();
    if (cachedActive && mounted.current) setStatus("ACTIVE");

    const uid = getUserIdFromToken();
    if (!uid) return;

    const sid = await getUserSubscriptionId(uid);
    if (!sid) return;
    if (mounted.current) setSubscriptionId(sid);

    try {
      const st = await withRetryAbortable(() => getSubscriptionStatus(sid), { retries: 2, baseDelayMs: 400, maxDelayMs: 2000 });
      if (!mounted.current) return;
      if (st.status === "ACTIVE" || st.status === "TRIALING") {
        setStatus(st.status);
      } else {
        setStatus((prev) => (prev === "UNKNOWN" ? st.status : prev));
      }
    } catch {
      /* silencioso */
    }
  }, [mounted]);

  useEffect(() => {
    void boot();
    return () => {
      abortRef.current?.abort();
    };
  }, [boot]);

  async function startFlowGooglePay() {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    try {
      const uid = getUserIdFromToken();
      const email = await getLastLoginEmail();

      const sub = await withRetryAbortable(
        () =>
          startStripeSubscription({
            userId: uid || undefined,
            email: email || undefined,
            priceId: PRICE_ID,
            pmMode: "auto",
          }),
        { retries: 3, baseDelayMs: 500, maxDelayMs: 3500, shouldRetry: (e) => isRetryableError(e), signal: ctrl.signal }
      );

      if (!mounted.current) return;

      setSubscriptionId(sub.subscriptionId);
      if (uid) await saveUserSubscriptionId(uid, sub.subscriptionId);

      setFlow({ publishableKey: sub.publishableKey, sub });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      const msg = e?.friendly || e?.message || "Não foi possível iniciar a assinatura.";
      Alert.alert("Erro", msg);
      busyRef.current = false;
      setLoading(false);
    }
  }

  function handleRunnerDone(finalStatus?: SubscriptionBackendStatus) {
    if (finalStatus && mounted.current) setStatus(finalStatus);
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
      const st = await withRetryAbortable(() => getSubscriptionStatus(subscriptionId), { retries: 2, baseDelayMs: 400, maxDelayMs: 2000 });
      if (!mounted.current) return;
      if (st.status === "ACTIVE" || st.status === "TRIALING") {
        setStatus(st.status);
      } else {
        setStatus((prev) => (prev === "UNKNOWN" ? st.status : prev));
      }
      Alert.alert("Status", `Assinatura: ${st.status}`);
    } catch (e: any) {
      if (e?.name !== "AbortError") Alert.alert("Erro", e?.friendly || e?.message || "Falha ao consultar status.");
    } finally {
      setLoading(false);
    }
  }

  const label = canManage
    ? "Gerir pagamento"
    : Platform.OS === "android" && platformPaySupported
      ? "Pay with Google Pay"
      : "Subscribe";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0f14" }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingVertical: 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Header centralizado */}
        <View style={{ width: "100%", maxWidth: 440, alignItems: "center", alignSelf: "center" }}>
          <Text style={{ color: "#E5E7EB", fontSize: 12, marginBottom: 6, textAlign: "center" }}>Premium Plans</Text>
          <Text style={{ color: "white", fontSize: 28, fontWeight: "800", textAlign: "center" }}>Upgrade Now</Text>
          <Text style={{ color: "#b6c2cf", fontSize: 14, marginTop: 6, textAlign: "center" }}>
            Get access to all premium features and unlock your full potential
          </Text>
        </View>

        {/* Card: Pro Plan (borda violeta) centralizado */}
        <View
          style={{
            borderWidth: 1,
            borderColor: "#7c3aed",
            borderRadius: 16,
            padding: 16,
            marginTop: 20,
            width: "100%",
            maxWidth: 440,
            alignSelf: "center",
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Plano Starter</Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12 }}>Mensal</Text>
            </View>
            <Text style={{ color: "#a78bfa", fontSize: 20, fontWeight: "800" }}>R$49,90</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: "#9CA3AF" }}>✓ Publicações ilimitadas</Text>
            <Text style={{ color: "#9CA3AF" }}>✓ Conexões ilimitadas</Text>
            <Text style={{ color: "#9CA3AF" }}>✓ Convites ilimitados</Text>
          </View>
        </View>

        {/* Botão centralizado */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ busy: loading, disabled: loading || (Platform.OS === "android" && platformPaySupported === false) }}
          onPress={startFlowGooglePay}
          disabled={loading || (Platform.OS === "android" && platformPaySupported === false)}
          style={{
            backgroundColor: "#374151",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 24,
            width: "100%",
            maxWidth: 440,
            alignSelf: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: "#E5E7EB", fontSize: 15, fontWeight: "700", textAlign: "center" }}>
              {Platform.OS === "android" && platformPaySupported ? "Pay with Google Pay" : "Continue"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Termos no rodapé centralizados */}
        <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 12, textAlign: "center", alignSelf: "center", maxWidth: 440 }}>
          By subscribing, you agree to our Terms of Service and Privacy Policy.
        </Text>

        {/* Debug opcional em DEV centralizado */}
        {__DEV__ && (
          <View style={{ marginTop: 10, alignItems: "center", alignSelf: "center", width: "100%", maxWidth: 440 }}>
            {subscriptionId ? <Text style={{ color: "#9CA3AF", textAlign: "center" }}>ID da assinatura: {subscriptionId}</Text> : null}
            <Text style={{ color: "#D1FAE5", marginTop: 4, textAlign: "center" }}>Status: {status === "UNKNOWN" ? "—" : status}</Text>
          </View>
        )}
      </ScrollView>

      {/* Provider local: se você já tiver no App.tsx, remova este bloco e use o modal diretamente */}
      {flow && (
        <StripeProvider publishableKey={flow.publishableKey || PUBLISHABLE_KEY || ""}>
          <PaymentSheetRunnerModal visible={!!flow} sub={flow.sub} onDone={handleRunnerDone} />
        </StripeProvider>
      )}
    </SafeAreaView>
  );
}

/** =================== MODAL: init/present PaymentSheet (lógica intacta) =================== */
function PaymentSheetRunnerModal({
  visible,
  sub,
  onDone,
}: {
  visible: boolean;
  sub: SubscribeResponse;
  onDone: (finalStatus?: SubscriptionBackendStatus) => void;
}) {
  const ranRef = useRef(false);
  const mounted = useMountedRef();

  useEffect(() => {
    if (!visible || ranRef.current) return;
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

      const secret = sub.paymentIntentClientSecret ?? sub.setupIntentClientSecret ?? "";
      const looksLikePI = /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/i.test(secret);
      const looksLikeSI = /^(seti|si)_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/i.test(secret);
      if (!looksLikePI && !looksLikeSI) {
        Alert.alert("Pagamento", "Segredo de pagamento inválido recebido do servidor.");
        onDone();
        return;
      }

      // 1) init PaymentSheet
      try {
        await withRetryAbortable(
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
        await withRetryAbortable(
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

      // 3) Se SetupIntent, tentar pagar fatura inicial
      if (!hasPI && hasSI) {
        try {
          const si = await retrieveSetupIntent(sub.setupIntentClientSecret!);
          const pmId = (si as any)?.paymentMethodId || (si as any)?.paymentMethod?.id || (si as any)?.paymentMethod || null;
          if (pmId) {
            await withRetryAbortable(
              () =>
                confirmInitialInvoicePayment({
                  subscriptionId: sub.subscriptionId,
                  paymentMethodId: String(pmId),
                }),
              { retries: 2, baseDelayMs: 600, maxDelayMs: 2500 }
            );
          }
        } catch {
          // silencioso; webhook + poll podem confirmar depois
        }
      }

      // 4) Refresh / Poll até ACTIVE/TRIALING
      try {
        try {
          const stNow = await withRetryAbortable(() => getSubscriptionStatus(sub.subscriptionId), { retries: 2, baseDelayMs: 400, maxDelayMs: 2000 });
          if ((stNow.status === "ACTIVE" || stNow.status === "TRIALING") && mounted.current) {
            const uid = getUserIdFromToken();
            if (uid) {
              await setLastKnownSubscription({
                userId: uid,
                status: stNow.status,
                currentPeriodEnd: stNow.currentPeriodEnd ?? null,
                cancelAtPeriodEnd: stNow.cancelAtPeriodEnd,
              });
            }
            Alert.alert("Assinatura", stNow.status === "ACTIVE" ? "Assinatura ativa!" : "Assinatura iniciada (período de teste).");
            onDone(stNow.status);
            return;
          }
        } catch {}

        const finalSt = await pollSubscriptionUntilActive(sub.subscriptionId, { intervalMs: 1500, maxMs: 60_000 });

        const uid = getUserIdFromToken();
        if (uid && (finalSt.status === "ACTIVE" || finalSt.status === "TRIALING")) {
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
  }, [visible, sub, onDone, mounted]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View
        pointerEvents="auto"
        style={{
          flex: 1,
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
    </Modal>
  );
}
