// app/(tabs)/convites/index.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ToastAndroid,
  Alert,
  TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const GUTTER = 14;
const CARD_W = width - GUTTER * 2; // coluna única full width
const NAVBAR_HEIGHT = 72;
const BOTTOM_INSET = NAVBAR_HEIGHT + 16;

export type Convite = {
  id: string;
  name: string;
  avatarUrl: string;
  message?: string;
  createdAt: number;
};

// --- MOCK: convites pendentes ---
function makeInvites(total = 12): Convite[] {
  const baseNames = ["Alice", "Bruno", "Carla", "Diego", "Érica", "Felipe", "Gabi", "Heitor"];
  return Array.from({ length: total }).map((_, i) => ({
    id: String(1000 + i),
    name: `${baseNames[i % baseNames.length]} ${120 + i}`,
    avatarUrl: `https://i.pravatar.cc/200?img=${(i % 70) + 1}`,
    message:
      i % 2 === 0 ? "Curtiu seu pub e quer conectar" : "Quer match mútuo pra trocar uma ideia",
    createdAt: Date.now() - i * 3600_000,
  }));
}

// normaliza para busca (remove acentos e caixa)
function norm(txt: string) {
  return txt
    .normalize("NFD")
    // @ts-ignore \p{Diacritic} suportado nos motores modernos
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export default function ConvitesScreen() {
  const [data, setData] = useState<Convite[]>(() => makeInvites(12));
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // TODO: trocar por fetch real
      await new Promise((r) => setTimeout(r, 600));
      setData(makeInvites(12));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const toast = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert(msg);
  };

  const onAccept = useCallback((id: string) => {
    // TODO: chamar API de aceitar -> criar match e mover pra contatos
    setData((prev) => prev.filter((c) => c.id !== id));
    toast("Match confirmado ✔");
  }, []);

  const onDecline = useCallback((id: string) => {
    // TODO: chamar API de recusar convite
    setData((prev) => prev.filter((c) => c.id !== id));
    toast("Convite recusado");
  }, []);

  const filtered = useMemo(() => {
    if (!query) return data;
    const q = norm(query);
    return data.filter((c) => norm(c.name).includes(q));
  }, [data, query]);

  const keyExtractor = useCallback((it: Convite) => it.id, []);
  const contentStyle = useMemo(
    () => ({ padding: GUTTER, paddingBottom: BOTTOM_INSET }),
    []
  );

  const ListHeader = useCallback(() => {
    return (
      <View style={s.headerWrap}>
        {/* Topbar: título + contador */}
        <View style={s.topbar}>
          <Text style={s.title}>Convites</Text>
          <View style={s.counter}>
            <Feather name="inbox" size={14} color="#bdbdbd" />
            <Text style={s.counterTxt}>
              {filtered.length} {filtered.length === 1 ? "convite" : "convites"}
            </Text>
          </View>
        </View>

        {/* Busca */}
        <View style={s.searchWrap}>
          <Feather name="search" size={18} color="#aaa" />
          <TextInput
            placeholder="Pesquisar por nome..."
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            style={s.searchInput}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              style={s.clearBtn}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Feather name="x" size={18} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [filtered.length, query]);

  const renderItem = useCallback(
    ({ item }: { item: Convite }) => {
      return (
        <View style={s.card}>
          <View style={s.row}>
            <Image source={{ uri: item.avatarUrl }} style={s.avatar} />
            <View style={s.info}>
              <Text numberOfLines={1} style={s.name}>
                {item.name}
              </Text>
              {!!item.message && (
                <Text numberOfLines={2} style={s.msg}>
                  {item.message}
                </Text>
              )}
            </View>
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => onDecline(item.id)}>
              <Feather name="x" size={16} color="#ff6b6b" />
              <Text style={[s.btnGhostText, { color: "#ff6b6b" }]}>Recusar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => onAccept(item.id)}>
              <Feather name="check" size={16} color="#fff" />
              <Text style={s.btnPrimaryText}>Aceitar</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [onAccept, onDecline]
  );

  return (
    <View style={s.screen}>
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={contentStyle}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="inbox" size={20} color="#666" />
            <Text style={s.emptyTxt}>
              {query ? `Sem resultados para “${query}”.` : "Sem convites por enquanto."}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B61FF" />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },

  // Header (título + contador + busca)
  headerWrap: { 
    marginBottom: 12, 
    marginTop: 40 // ⬅️ aumente esse valor para descer mais
    },
    topbar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14, // um pouco mais de espaço abaixo do título
    },

  title: { color: "#fff", fontSize: 18, fontWeight: "800", flex: 1 },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: "#161616",
  },
  counterTxt: { color: "#bdbdbd", fontSize: 12, fontWeight: "700" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#161616",
    backgroundColor: "#0c0c0c",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 4,
  },
  clearBtn: { padding: 2, borderRadius: 8 },

  // Cards
  card: {
    width: CARD_W,
    borderRadius: 16,
    backgroundColor: "#0b0b0b",
    borderWidth: 1,
    borderColor: "#141414",
    padding: 12,
    marginTop: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#111" },
  info: { flex: 1, gap: 2 },
  name: { color: "#fff", fontSize: 15, fontWeight: "800" },
  msg: { color: "#bdbdbd", fontSize: 12 },

  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  btnGhostText: { fontSize: 14, fontWeight: "800" },
  btnPrimary: {
    backgroundColor: "#6f63ff",
    borderWidth: 1,
    borderColor: "#6f63ff",
  },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  // vazio
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 8 },
  emptyTxt: { color: "#888", fontSize: 13 },
});
