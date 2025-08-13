import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import PubsScreen, { type PubsScreenHandle, type Decision } from "../pubs/index";
import type { VideoDTO } from "../gateway/api";
import { saveLastMatchedUserId, inviteMatchForTarget } from "../gateway/api";

import ContatosScreen from "../contatos";
import AddVideoScreen from "../video";
import ConvitesScreen from "../convites";
import PerfilScreen from "../perfil";

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

// nome exibido rápido
function displayName(pub: VideoDTO): string {
  const n = (pub as any)?.descricao as string | undefined;
  if (n && n.trim()) return n.trim();
  const uid = (pub.userId ?? "").toString();
  return uid ? `user-${uid.slice(0, 8)}` : "sem-nome";
}

// log com cor
function logHighlight(label: string) {
  console.log(`%c${label}`, "color:#00f2ea; font-weight:700");
  console.log("\x1b[36m%s\x1b[0m", label);
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("pubs");
  const pubsRef = useRef<PubsScreenHandle>(null);

  const scaleNope = useRef(new Animated.Value(1)).current;
  const scaleLike = useRef(new Animated.Value(1)).current;

  function animatePress(anim: Animated.Value) {
    Animated.sequence([
      Animated.spring(anim, { toValue: 0.9, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 3, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  async function onMatch(decision: Decision) {
    pubsRef.current?.decide(decision);
  }

  function renderContent() {
    if (tab === "pubs") {
      return (
        <View style={s.contentFull}>
          <PubsScreen
            ref={pubsRef}
            onDecision={async (pub: VideoDTO, decision: Decision) => {
              console.log("DECISION:", decision, "PUB:", pub.id);
              if (decision === "like") {
                // 1) salva quem foi o "alvo" do match (fallback para tela de aceitar)
                await saveLastMatchedUserId(pub.userId);
                logHighlight(`[MATCH-CACHE] userId salvo: ${pub.userId}`);

                // 2) envia convite ao backend com SEU perfil + targetId = dono do vídeo
                try {
                  const res = await inviteMatchForTarget(pub.userId);
                  if (res.matched && res.matchId) {
                    logHighlight(`[MATCH] Mútuo! matchId=${res.matchId}`);
                    // exemplo: navegar para o chat
                    // router.push(`/chat/${res.matchId}`);
                  } else {
                    console.log("[MATCH] Convite enviado, aguardando aceite. inviteId=", res.invite?.id);
                  }
                } catch (err: any) {
                  console.warn("[MATCH] Falha ao enviar convite:", err?.message || err);
                }
              }
            }}
            onActive={(pub: VideoDTO) => {
              const _ = displayName(pub);
            }}
          />

          {/* Painel de decisão */}
          <View style={s.matchPanel} pointerEvents="box-none">
            <TouchableWithoutFeedback
              onPressIn={() => animatePress(scaleNope)}
              onPressOut={() => onMatch("nope")}
            >
              <Animated.View
                style={[
                  s.actionBtn,
                  s.nope,
                  { marginRight: BUTTON_GAP, transform: [{ scale: scaleNope }] },
                ]}
              >
                <Feather name="thumbs-down" size={26} color="#fff" />
                <Text style={s.actionLabel}>Deslike</Text>
              </Animated.View>
            </TouchableWithoutFeedback>

            <TouchableWithoutFeedback
              onPressIn={() => animatePress(scaleLike)}
              onPressOut={() => onMatch("like")}
            >
              <Animated.View style={[s.actionBtn, s.like, { transform: [{ scale: scaleLike }] }]}>
                <Feather name="thumbs-up" size={26} color="#fff" />
                <Text style={s.actionLabel}>Match</Text>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </View>
      );
    }

    if (tab === "contatos") return <ContatosScreen />;
    if (tab === "add") return <AddVideoScreen />;
    if (tab === "novidades") return <ConvitesScreen />;
    return <PerfilScreen />;
  }

  return (
    <View style={s.screen}>
      <View style={s.body}>{renderContent()}</View>

      {/* Navbar fixa em estilo pill */}
      <SafeAreaView edges={["bottom"]} style={s.navbarSafe}>
        <View style={s.homeIndicator} />
        <View style={s.navbarShadowWrap}>
          <View style={s.navbarCard}>
            <NavIcon icon="film"        active={tab === "pubs"}      onPress={() => setTab("pubs")} />
            <NavIcon icon="users"       active={tab === "contatos"}  onPress={() => setTab("contatos")} />
            <NavIcon icon="plus-circle" active={tab === "add"}       onPress={() => setTab("add")} big />
            <NavIcon icon="bell"        active={tab === "novidades"} onPress={() => setTab("novidades")} />
            <NavIcon icon="user"        active={tab === "perfil"}    onPress={() => setTab("perfil")} />
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

  // Painel de decisão
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

  // Navbar (pill)
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
});
