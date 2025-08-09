// app/(tabs)/fixed/dashboard.tsx
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

import PubsScreen from "../pubs";
import type { PubsScreenHandle, Decision, Pub } from "../pubs";

const { width } = Dimensions.get("window");

// Layout constants
const NAVBAR_HEIGHT = 64; // mantido só pra navbar
const H_PADDING = 16;
const BUTTON_GAP = 14;
const BUTTON_WIDTH = (width - H_PADDING * 2 - BUTTON_GAP) / 2;
const BUTTON_HEIGHT = Math.max(44, Math.round(BUTTON_WIDTH * 0.38));
// agora usamos só esse valor pra colar na borda da tela
const MATCH_PANEL_BOTTOM = 2; // 0–4px costuma ficar bom

type Tab = "pubs" | "contatos" | "add" | "novidades" | "perfil";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("pubs");
  const pubsRef = useRef<PubsScreenHandle>(null);
  const [currentName, setCurrentName] = useState<string>("");

  // animações dos botões
  const scaleNope = useRef(new Animated.Value(1)).current;
  const scaleLike = useRef(new Animated.Value(1)).current;

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

          {/* Painel de decisão — encostado na borda inferior (quase na navbar) */}
          <View style={s.matchPanel} pointerEvents="box-none">
            {/* Botão NÃO */}
            <TouchableWithoutFeedback
              onPressIn={() => animatePress(scaleNope)}
              onPressOut={() => onMatch("nope")}
            >
              <Animated.View style={[s.actionBtn, s.nope, { marginRight: BUTTON_GAP, transform: [{ scale: scaleNope }] }]}>
                <Feather name="thumbs-down" size={26} color="#fff" />
                <Text style={s.actionLabel}>Deslike</Text>
              </Animated.View>
            </TouchableWithoutFeedback>

            {/* Botão LEGAL (👍 azul) */}
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
      return (
        <View style={s.contentBox}>
          <Text style={s.contentTxt}>Contatos com consultores 💬</Text>
        </View>
      );
    }
    if (tab === "add") {
      return (
        <View style={s.contentBox}>
          <Text style={s.contentTxt}>Adicionar vídeo de pub ⬆️</Text>
        </View>
      );
    }
    if (tab === "novidades") {
      return (
        <View style={s.contentBox}>
          <Text style={s.contentTxt}>Novidades e atualizações 📰</Text>
        </View>
      );
    }
    return (
      <View style={s.contentBox}>
        <Text style={s.contentTxt}>Seu perfil 👤</Text>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.body}>{renderContent()}</View>

      {/* Navbar fixa no rodapé */}
      <SafeAreaView edges={["bottom"]} style={s.navbarSafe}>
        <View style={s.navbar}>
          <NavItem label="Pubs" icon="film" active={tab === "pubs"} onPress={() => setTab("pubs")} />
          <NavItem label="Contatos" icon="users" active={tab === "contatos"} onPress={() => setTab("contatos")} />
          <NavItem label="Add Pub" icon="plus-circle" active={tab === "add"} onPress={() => setTab("add")} big />
          <NavItem label="Novidades" icon="bell" active={tab === "novidades"} onPress={() => setTab("novidades")} />
          <NavItem label="Perfil" icon="user" active={tab === "perfil"} onPress={() => setTab("perfil")} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function NavItem({
  label,
  icon,
  active,
  onPress,
  big = false,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
  big?: boolean;
}) {
  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <View style={s.navItem}>
        <Feather name={icon} size={big ? 28 : 22} color={active ? "#00f2ea" : "#888"} />
        <Text style={[s.navLabel, { color: active ? "#00f2ea" : "#888" }]}>{label}</Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  body: { flex: 1 },

  contentFull: { flex: 1, backgroundColor: "#000" },

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

  // Painel de decisão — ABSOLUTE encostado na borda inferior
  matchPanel: {
    position: "absolute",
    left: H_PADDING,
    right: H_PADDING,
    bottom: MATCH_PANEL_BOTTOM, // <<< ajuste principal (sem NAVBAR_HEIGHT)
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
  like: { backgroundColor: "#2196f3" }, // azul

  // Navbar
  navbarSafe: { backgroundColor: "#000" },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: NAVBAR_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: "#111",
    paddingBottom: 6,
    paddingTop: 6,
  },
  navItem: { alignItems: "center", justifyContent: "center", minWidth: 60 },
  navLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
});
