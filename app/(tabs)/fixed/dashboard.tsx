// app/(tabs)/fixed/dashboard.tsx
import { useRef, useState, useEffect } from "react";
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

import PubsScreen from "../pubs";
import ContatosScreen from "../contatos";
import AddVideoScreen from "../video";
import type { PubsScreenHandle, Decision, Pub } from "../pubs";
import ConvitesScreen from "../convites";
import PerfilScreen from "../perfil";

const { width } = Dimensions.get("window");

// THEME
const ACCENT = "#6f63ff";      // roxo (ativo)
const BG_CARD = "#0c0c0f";     // fundo do card da navbar
const BG_SCREEN = "#000";      // fundo geral
const MUTED = "#8a8a8a";       // cinza inativo

// Layout constants
const NAVBAR_HEIGHT = 72;
const H_PADDING = 16;
const BUTTON_GAP = 14;
const BUTTON_WIDTH = (width - H_PADDING * 2 - BUTTON_GAP) / 2;
const BUTTON_HEIGHT = Math.max(44, Math.round(BUTTON_WIDTH * 0.38));
const MATCH_PANEL_BOTTOM = 22;

type Tab = "pubs" | "contatos" | "add" | "novidades" | "perfil";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("pubs");
  const pubsRef = useRef<PubsScreenHandle>(null);
  const [currentName, setCurrentName] = useState<string>("");

  // animações dos botões de decisão
  const scaleNope = useRef(new Animated.Value(1)).current;
  const scaleLike = useRef(new Animated.Value(1)).current;

  // name plate (sem animação de aparecer)
  const nameAnim = useRef(new Animated.Value(1)).current;

  function animatePress(anim: Animated.Value) {
    Animated.sequence([
      Animated.spring(anim, { toValue: 0.9, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 3, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  function onMatch(decision: Decision) {
    pubsRef.current?.decide(decision);
  }

  function renderContent() {
    if (tab === "pubs") {
      return (
        <View style={s.contentFull}>
          <PubsScreen
            ref={pubsRef}
            onDecision={(pub: Pub, decision: Decision) => {
              console.log("DECISION:", decision, "PUB:", pub.id);
            }}
            onActive={(pub: Pub) => setCurrentName(pub?.user?.name ?? "")}
          />

          {/* Name plate — sem animação */}
          {currentName ? (
            <Animated.View
              pointerEvents="none"
              style={[
                s.namePlate,
                {
                  bottom: MATCH_PANEL_BOTTOM + BUTTON_HEIGHT + 10,
                  opacity: nameAnim,
                },
              ]}
            >
              <Text style={s.nameText} numberOfLines={1} ellipsizeMode="tail">
                {currentName}
              </Text>
            </Animated.View>
          ) : null}

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

    if (tab === "contatos") {
      return <ContatosScreen />;
    }
    if (tab === "add") {
      return <AddVideoScreen />;
    }
    if (tab === "novidades") {
      return <ConvitesScreen />
    }
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

/** Ícone puro (sem label e sem animação de aparecer); só troca cor quando ativo */
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

  contentBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1b1b1b",
    borderRadius: 16,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    margin: 16,
  },
  contentTxt: { color: "#fff", fontSize: 16 },

  // Name plate
  namePlate: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 21,
  },
  nameText: {
    color: "#ddd",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    overflow: "hidden",
  },

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

  navItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapBig: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
});
