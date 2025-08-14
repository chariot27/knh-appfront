import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  createPixCheckout,
  getPaymentStatus,
  verifyPayment,             // força verificação no backend/PSP
  getSubscriptionStatus,
  cancelSubscriptionAtPeriodEnd,
  confirmPaymentManual,      // DEV: simula o webhook
  getUserIdFromToken,
  initCurrentUserFromToken,
  type CheckoutResponse,
  type PaymentStatusResponse,
  type SubscriptionDTO,
  type VerifyResponse,
} from "../gateway/api";

const IS_DEV = typeof __DEV__ === "boolean" ? __DEV__ : false;
const APPROVAL_NOTICE =
  "Após a confirmação do pagamento pelo banco, seu perfil será analisado e poderá levar até 24 horas para ser aprovado. Caso passe de 24 horas, solicite novamente ou peça estorno pelo WhatsApp 54996321181.";

function fmtCountdown(expiresAt?: string) {
  if (!expiresAt) return "";
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  const ms = Math.max(0, end - now);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function AssinaturaScreen() {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubscriptionDTO | null>(null);

  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [status, setStatus] = useState<PaymentStatusResponse | null>(null);
  const [tick, setTick] = useState(0);

  type IntervalHandle = ReturnType<typeof setInterval>;
  const timerRef = useRef<IntervalHandle | null>(null);
  const pollRef = useRef<IntervalHandle | null>(null);

  const hasActive = sub?.status === "ACTIVE";
  const isPending = status?.paymentStatus === "PENDING" || (!!checkout && !status);
  const isConfirmed = status?.paymentStatus === "CONFIRMED";
  const isExpiredOrFailed = status?.paymentStatus === "EXPIRED" || status?.paymentStatus === "FAILED";

  const userIdPromise = useMemo(async () => {
    let uid = getUserIdFromToken();
    if (!uid) {
      const me = await initCurrentUserFromToken().catch(() => null);
      // @ts-ignore
      uid = me?.id ?? null;
    }
    if (!uid) throw new Error("Usuário não autenticado");
    return String(uid);
  }, []);

  const loadSub = useCallback(async () => {
    try {
      const uid = await userIdPromise;
      const s = await getSubscriptionStatus(uid); // atualiza cache local também
      setSub(s);
    } catch (e: any) {
      Alert.alert("Assinatura", e?.message || "Não foi possível carregar o status.");
    } finally {
      setLoading(false);
    }
  }, [userIdPromise]);

  useEffect(() => {
    loadSub();
    timerRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
      if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [loadSub]);

  const startCheckout = useCallback(async () => {
    try {
      setCheckout(null);
      setStatus(null);
      const uid = await userIdPromise;
      const c = await createPixCheckout(uid);
      setCheckout(c);

      // ⚠️ Aviso imediato sobre aprovação em até 24h
      Alert.alert("Prazo de aprovação", APPROVAL_NOTICE);

      // limpa polling anterior
      if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }

      // consulta imediata 1x
      verifyPayment(c.txid).then((v: VerifyResponse) => {
        setStatus({ txid: v.txid, paymentStatus: v.paymentStatus, subscriptionStatus: v.subscriptionStatus });
      }).catch(() => {
        getPaymentStatus(c.txid).then(setStatus).catch(() => {});
      });

      // inicia polling
      pollRef.current = setInterval(async () => {
        try {
          const v = await verifyPayment(c.txid);
          setStatus({ txid: v.txid, paymentStatus: v.paymentStatus, subscriptionStatus: v.subscriptionStatus });
          if (["CONFIRMED", "FAILED", "EXPIRED"].includes(v.paymentStatus)) {
            if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
            if (v.paymentStatus === "CONFIRMED") {
              const updated = await getSubscriptionStatus(await userIdPromise); // atualiza cache
              setSub(updated);
            }
          }
        } catch {
          try {
            const s = await getPaymentStatus(c.txid);
            setStatus(s);
            if (["CONFIRMED", "FAILED", "EXPIRED"].includes(s.paymentStatus)) {
              if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
              if (s.paymentStatus === "CONFIRMED") {
                const updated = await getSubscriptionStatus(await userIdPromise); // atualiza cache
                setSub(updated);
              }
            }
          } catch { /* silêncio */ }
        }
      }, 5000);
    } catch (e: any) {
      Alert.alert("Checkout PIX", e?.message || "Falha ao criar a cobrança.");
    }
  }, [userIdPromise]);

  const doCancelAtEnd = useCallback(async () => {
    try {
      const uid = await userIdPromise;
      await cancelSubscriptionAtPeriodEnd(uid);
      Alert.alert("Assinatura", "Cancelamento ao fim do período atual foi agendado.");
      await loadSub();
    } catch (e: any) {
      Alert.alert("Assinatura", e?.message || "Não foi possível cancelar.");
    }
  }, [userIdPromise, loadSub]);

  const copyPayload = useCallback(async () => {
    const payload = checkout?.copiaECola;
    if (!payload) return;
    try {
      await Clipboard.setStringAsync(payload);
      Alert.alert("PIX", "Código copia e cola copiado!");
    } catch {
      Alert.alert("PIX", "Não foi possível copiar o código.");
    }
  }, [checkout]);

  // DEV helper
  const confirmDev = useCallback(async () => {
    if (!checkout?.txid) return;
    try {
      await confirmPaymentManual(checkout.txid);
      const v = await verifyPayment(checkout.txid);
      setStatus({ txid: v.txid, paymentStatus: v.paymentStatus, subscriptionStatus: v.subscriptionStatus });
      if (v.paymentStatus === "CONFIRMED") {
        const updated = await getSubscriptionStatus(await userIdPromise);
        setSub(updated);
        Alert.alert("PIX", "Pagamento confirmado (DEV).");
      } else {
        Alert.alert("PIX", `Status atual: ${v.paymentStatus}`);
      }
    } catch (e: any) {
      Alert.alert("PIX", e?.message || "Falha ao confirmar manualmente.");
    }
  }, [checkout, userIdPromise]);

  const expired = useMemo(() => {
    if (!checkout?.expiresAt) return false;
    return new Date(checkout.expiresAt).getTime() <= Date.now();
  }, [checkout, tick]);

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.container}>
      <View style={styles.topSpacer} />
      <Text style={styles.title}>Assinatura Premium</Text>

      {loading ? (
        <View style={[styles.card, styles.centerItems, styles.cardShadow]}>
          <ActivityIndicator />
          <Text style={styles.help}>Carregando status...</Text>
        </View>
      ) : (
        <>
          <View style={[styles.card, styles.centerItems, styles.cardShadow]}>
            <Text style={styles.label}>Status da assinatura</Text>
            <Text style={[styles.value, hasActive ? styles.ok : styles.warn]}>
              {sub?.status ?? "INACTIVE"}
            </Text>

            {!!sub?.currentPeriodEnd && (
              <Text style={styles.help}>Válida até: {new Date(sub.currentPeriodEnd).toLocaleString()}</Text>
            )}

            {hasActive && (
              <TouchableOpacity style={[styles.secondaryBtn, styles.fullBtn]} onPress={doCancelAtEnd}>
                <Text style={styles.secondaryBtnText}>Cancelar ao fim do período</Text>
              </TouchableOpacity>
            )}
          </View>

          {!hasActive && (
            <View style={[styles.card, styles.centerItems, styles.cardShadow]}>
              <Text style={styles.label}>Plano mensal</Text>
              <Text style={styles.price}>R$ 49,90</Text>
              <TouchableOpacity style={[styles.primaryBtn, styles.fullBtn]} onPress={startCheckout}>
                <Text style={styles.primaryBtnText}>Pagar com PIX</Text>
              </TouchableOpacity>
            </View>
          )}

          {!!checkout && (
            <View style={[styles.card, styles.centerItems, styles.cardShadow]}>
              {/* 🔔 Aviso fixo de aprovação em até 24h */}
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={TEXT} />
                <Text style={styles.infoText}>{APPROVAL_NOTICE}</Text>
              </View>

              <Text style={styles.label}>Pague com PIX (QR)</Text>
              <Image style={styles.qr} source={{ uri: `data:image/png;base64,${checkout.qrPngBase64}` }} />
              <TouchableOpacity style={[styles.secondaryBtn, styles.fullBtn]} onPress={copyPayload}>
                <Text style={styles.secondaryBtnText}>Copiar código copia e cola</Text>
              </TouchableOpacity>

              <View style={[styles.row, styles.centerRow]}>
                <Text style={styles.help}>TXID: {checkout.txid}</Text>
              </View>
              <View style={[styles.row, styles.centerRow]}>
                <Text style={styles.help}>Expira em: {fmtCountdown(checkout.expiresAt)}</Text>
                {expired && <Text style={[styles.help, styles.warn]}> (expirado)</Text>}
              </View>
              <View style={[styles.row, styles.centerRow]}>
                <Text style={styles.help}>Valor: R$ {checkout.amount}</Text>
              </View>

              {isPending && (
                <View style={styles.badgePending}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.badgeText}>Aguardando confirmação do banco...</Text>
                </View>
              )}
              {isConfirmed && (
                <View style={styles.badgeOk}>
                  <Text style={styles.badgeText}>Pagamento confirmado! Assinatura ativada.</Text>
                </View>
              )}
              {isExpiredOrFailed && (
                <View style={styles.badgeWarn}>
                  <Text style={styles.badgeText}>Pagamento não confirmado. Gere um novo QR.</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.link} onPress={loadSub}>
            <Text style={styles.linkText}>Atualizar status</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => router.back()} style={styles.backWrap}>
              <View style={styles.backBtn}>
                <Ionicons name="arrow-back" size={18} color={TEXT} />
                <Text style={styles.backText}>Voltar</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </>
      )}
    </ScrollView>
  );
}

const ACCENT = "#7C3AED";
const ACCENT_SOFT = "#9F67FF";
const BG = "#0A0F1A";
const SURFACE = "#0F1624";
const BORDER = "rgba(255,255,255,0.06)";
const TEXT = "#E8EAED";
const MUTED = "#9aa0a6";

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: BG },

  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
    alignItems: "center",
    justifyContent: "flex-start",
  },

  topSpacer: { height: 28 },

  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginBottom: 14,
    textAlign: "center",
    color: TEXT,
  },

  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  centerItems: { alignItems: "center" },

  label: { color: MUTED, fontSize: 13, marginBottom: 6, textAlign: "center" },
  value: { color: TEXT, fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  price: { color: TEXT, fontSize: 22, fontWeight: "900", marginBottom: 8, textAlign: "center" },

  help: { color: MUTED, fontSize: 12, textAlign: "center" },

  ok: { color: "#45d483" },
  warn: { color: "#ffb74d" },

  qr: {
    width: 280,
    height: 280,
    alignSelf: "center",
    marginVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  primaryBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  primaryBtnText: { color: "white", fontWeight: "800", letterSpacing: 0.3 },

  secondaryBtn: {
    backgroundColor: "#131B2B",
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryBtnText: { color: TEXT, fontWeight: "700" },

  fullBtn: { width: "100%", maxWidth: 380 },

  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  centerRow: { justifyContent: "center", alignSelf: "center" },

  // Banner de informação
  infoBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#172033",
    borderLeftWidth: 4,
    borderLeftColor: ACCENT_SOFT,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  infoText: { color: TEXT, flex: 1, fontSize: 12, lineHeight: 16 },

  badgePending: {
    backgroundColor: "#172033",
    borderLeftWidth: 4,
    borderLeftColor: ACCENT_SOFT,
    padding: 10,
    borderRadius: 10,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    alignSelf: "center",
  },
  badgeOk: {
    backgroundColor: "#143225",
    borderLeftWidth: 4,
    borderLeftColor: "#45d483",
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    alignSelf: "center",
  },
  badgeWarn: {
    backgroundColor: "#332419",
    borderLeftWidth: 4,
    borderLeftColor: "#ffb74d",
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    alignSelf: "center",
  },
  badgeText: { color: TEXT, textAlign: "center" },

  link: { alignItems: "center", marginTop: 6 },
  linkText: { color: ACCENT_SOFT, fontWeight: "700" },

  footer: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    marginTop: 10,
    alignItems: "center",
  },

  backWrap: {
    padding: 2,
    borderRadius: 999,
    backgroundColor: "rgba(124,58,237,0.35)",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#131B2B",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.45)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  backText: { color: TEXT, fontWeight: "800", letterSpacing: 0.2 },
});
