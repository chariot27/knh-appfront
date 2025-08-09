import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import PubsScreen, { PubsScreenHandle, Decision } from "../pubs/index"; // importa o feed

type Tab = "pubs" | "contatos" | "add" | "novidades" | "perfil";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("pubs");
  const pubsRef = useRef<PubsScreenHandle>(null);

  function onMatch(decision: Decision) {
    pubsRef.current?.decide(decision);
  }

  function renderContent() {
    if (tab === "pubs") {
      return (
        <View style={s.contentFull}>
          <PubsScreen
            ref={pubsRef}
            onDecision={(pub, decision) => {
              // Aqui você registra a ação (like/nope) no backend quando quiser
              console.log("DECISION:", decision, "PUB:", pub.id);
            }}
          />

          {/* Botões Tinder-like, acima da navbar */}
          <View style={s.matchBar}>
            <TouchableOpacity
              style={[s.circleBtn, s.nope]}
              onPress={() => onMatch("nope")}
              activeOpacity={0.85}
            >
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.circleBtn, s.like]}
              onPress={() => onMatch("like")}
              activeOpacity={0.85}
            >
              <Feather name="heart" size={28} color="#fff" />
            </TouchableOpacity>
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
          <NavItem
            label="Pubs"
            icon="film"
            active={tab === "pubs"}
            onPress={() => setTab("pubs")}
          />
          <NavItem
            label="Contatos"
            icon="users"
            active={tab === "contatos"}
            onPress={() => setTab("contatos")}
          />
          <NavItem
            label="Add Pub"
            icon="plus-circle"
            active={tab === "add"}
            onPress={() => setTab("add")}
            big
          />
          <NavItem
            label="Novidades"
            icon="bell"
            active={tab === "novidades"}
            onPress={() => setTab("novidades")}
          />
          <NavItem
            label="Perfil"
            icon="user"
            active={tab === "perfil"}
            onPress={() => setTab("perfil")}
          />
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
    <TouchableOpacity style={s.navItem} onPress={onPress} activeOpacity={0.8}>
      <Feather
        name={icon}
        size={big ? 28 : 22}
        color={active ? "#00f2ea" : "#888"}
      />
      <Text style={[s.navLabel, { color: active ? "#00f2ea" : "#888" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
  },
  body: {
    flex: 1,
  },
  contentFull: {
    flex: 1,
    backgroundColor: "#000",
  },
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

  // Botões Tinder acima da navbar
  matchBar: {
    position: "absolute",
    bottom: 76, // fica acima da navbar de ~64 + padding
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 24,
  },
  circleBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  nope: { backgroundColor: "#ff4d4f" },
  like: { backgroundColor: "#00c853" },

  // Navbar
  navbarSafe: {
    backgroundColor: "#000",
  },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: 64,
    borderTopWidth: 1,
    borderTopColor: "#111",
    paddingBottom: 6,
    paddingTop: 6,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
