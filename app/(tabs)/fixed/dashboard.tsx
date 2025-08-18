import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { VideoDTO } from "../gateway/api";
import {
  inviteMatchForTarget,
  isSubscriptionActiveCached,
  saveLastMatchedUserId,
} from "../gateway/api";
import PubsScreen, { type Decision, type PubsScreenHandle } from "../pubs/index";

import ContatosScreen from "../contatos";
import ConvitesScreen from "../convites";
import { isDevUnlock } from "../gateway/devUnlock";
import PerfilScreen from "../perfil";
import AddVideoScreen from "../video";

const { width } = Dimensions.get("window");

const ACCENT = "#6f63ff";
const BG_CARD = "#0c0c0f";
const BG_SCREEN = "#000";
const MUTED = "#8a8a8a";

const NAVBAR_HEIGHT = 72;
const H_PADDING = 16;
const BUTTON_GAP = 14;
const BUTTON_WIDTH = (width - H_PADDING * 2 - BUTTON_GAP) / 2;
const BUTTON_HEIGHT = Math.max(44, Math.round(BUTTON_WIDTH * 0.38));
const MATCH_PANEL_BOTTOM = 22;

type Tab = "pubs" | "contatos" | "add" | "novidades" | "perfil";

function displayName(pub: VideoDTO): string {
  const n = (pub as any)?.descricao as string | undefined;
  if (n && n.trim()) return n.trim();
  const uid = (pub.userId ?? "").toString();
  return uid ? `user-${uid.slice(0, 8)}` : "sem-nome";
}

function BlockedPage() {
  return (
    <View style={s.blockedWrap}>
      <Feather name="lock" size={28} color="#bbb" />
      <Text style={s.blockedTitle}>Recurso Premium</Text>
      <Text style={s.blockedMsg}>
        Assine o Premium para desbloquear Convites, Contatos e Adicionar vídeo.
      </Text>
      <TouchableOpacity style={s.blockedBtn} onPress={() => router.push("/assinatura")}>
        <Feather name="zap" size={16} color="#fff" />
        <Text style={s.blockedBtnText}>Assinar Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("pubs");
  const [subActive, setSubActive] = useState<boolean>(false);
  const [devUnlock, setDevUnlockState] = useState<boolean>(false);

  const pubsRef = useRef<PubsScreenHandle>(null);
  const scaleNope = useRef(new Animated.Value(1)).current;
  const scaleLike = useRef(new Animated.Value(1)).current;

  // Pode usar botões e TAMBÉM ver abas se tiver assinatura ou DEV
  const canMatch = subActive || devUnlock;
  const canUseTabs = subActive || devUnlock;

  const refreshGate = useCallback(async () => {
    const [sub, dev] = await Promise.all([
      isSubscriptionActiveCached(),
      isDevUnlock(),
    ]);
    setSubActive(sub);
    setDevUnlockState(dev);
  }, []);

  useEffect(() => { refreshGate(); }, [refreshGate]);

  function animatePress(anim: Animated.Value) {
    Animated.sequence([
      Animated.spring(anim, { toValue: 0.9, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 3, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  function askToSubscribe() {
    Alert.alert("Premium", "Assine o Premium para desbloquear essa ação.");
  }

  async function onMatch(decision: Decision) {
    if (!canMatch) return askToSubscribe();
    pubsRef.current?.decide(decision);
  }

  async function onDecision(pub: VideoDTO, decision: Decision) {
    if (!canMatch) return;
    if (decision === "like") {
      await saveLastMatchedUserId(pub.userId);
      try {
        const res = await inviteMatchForTarget(pub.userId);
        if (!res?.invite && !res?.matched) {
          console.log("[MATCH] Sem resposta do backend.");
        }
      } catch (err: any) {
        console.warn("[MATCH] Falha ao enviar convite:", err?.message || err);
      }
    }
  }

  function renderContent() {
    if (tab === "pubs") {
      return (
        <View style={s.contentFull}>
          <PubsScreen
            ref={pubsRef}
            onDecision={(pub, d) => onDecision(pub, d)}
            onActive={(pub: VideoDTO) => { const _ = displayName(pub); }}
          />

          {/* Painel de decisão */}
          <View style={s.matchPanel} pointerEvents="box-none">
            <TouchableWithoutFeedback
              onPressIn={() => animatePress(scaleNope)}
              onPressOut={() => (!canMatch ? askToSubscribe() : onMatch("nope"))}
            >
              <Animated.View
                style={[
                  s.actionBtn,
                  canMatch ? s.nope : s.nopeLocked,
                  { marginRight: BUTTON_GAP, transform: [{ scale: scaleNope }] },
                ]}
              >
                <Feather name="thumbs-down" size={26} color="#fff" />
                <Text style={s.actionLabel}>Deslike</Text>
              </Animated.View>
            </TouchableWithoutFeedback>

            <TouchableWithoutFeedback
              onPressIn={() => animatePress(scaleLike)}
              onPressOut={() => (!canMatch ? askToSubscribe() : onMatch("like"))}
            >
              <Animated.View
                style={[
                  s.actionBtn,
                  canMatch ? s.like : s.likeLocked,
                  { transform: [{ scale: scaleLike }] },
                ]}
              >
                <Feather name="thumbs-up" size={26} color="#fff" />
                <Text style={s.actionLabel}>Match</Text>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </View>
      );
    }

    // >>> AGORA as abas respeitam DEV unlock também
    if (tab === "contatos") return canUseTabs ? <ContatosScreen /> : <BlockedPage />;
    if (tab === "add")      return canUseTabs ? <AddVideoScreen />  : <BlockedPage />;
    if (tab === "novidades")return canUseTabs ? <ConvitesScreen /> : <BlockedPage />;
    return <PerfilScreen />;
  }

  const handleTabPress = async (next: Tab) => {
    await refreshGate();
    setTab(next);
  };

  return (
    <View style={s.screen}>
      <View style={s.body}>{renderContent()}</View>

      {/* Navbar fixa em estilo pill */}
      <SafeAreaView edges={["bottom"]} style={s.navbarSafe}>
        <View style={s.homeIndicator} />
        <View style={s.navbarShadowWrap}>
          <View style={s.navbarCard}>
            <NavIcon icon="film"        active={tab === "pubs"}      onPress={() => handleTabPress("pubs")} />
            <NavIcon icon="users"       active={tab === "contatos"}  onPress={() => handleTabPress("contatos")} />
            <NavIcon icon="plus-circle" active={tab === "add"}       onPress={() => handleTabPress("add")} big />
            <NavIcon icon="bell"        active={tab === "novidades"} onPress={() => handleTabPress("novidades")} />
            <NavIcon icon="user"        active={tab === "perfil"}    onPress={() => handleTabPress("perfil")} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function NavIcon({
  icon,
  active,
  onPress,
  big = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
  big?: boolean;
}) {
  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <View style={s.navItem}>
        <View style={[s.iconWrap, big && s.iconWrapBig]}>
          <Feather name={icon} size={big ? 26 : 22} color={active ? ACCENT : MUTED} />
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG_SCREEN },
  body: { flex: 1 },
  contentFull: { flex: 1, backgroundColor: BG_SCREEN },

  matchPanel: {
    position: "absolute",
    left: H_PADDING,
    right: H_PADDING,
    bottom: MATCH_PANEL_BOTTOM,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 20,
  },
  actionBtn: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  nope: { backgroundColor: "#ff4d4f" },
  like: { backgroundColor: "#2196f3" },
  nopeLocked: { backgroundColor: "#3a3434" },
  likeLocked: { backgroundColor: "#2a3442" },

  navbarSafe: { backgroundColor: "transparent" },
  homeIndicator: {
    alignSelf: "center",
    width: 90,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2a2a2a",
    marginBottom: 8,
  },
  navbarShadowWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  navbarCard: {
    height: NAVBAR_HEIGHT,
    backgroundColor: BG_CARD,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: "#141418",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  navItem: { alignItems: "center", justifyContent: "center", minWidth: 64 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  iconWrapBig: { width: 46, height: 46, borderRadius: 23 },

  blockedWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  blockedTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 6 },
  blockedMsg: { color: "#bdbdbd", fontSize: 13, textAlign: "center" },
  blockedBtn: {
    marginTop: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blockedBtnText: { color: "#fff", fontWeight: "800" },
});
