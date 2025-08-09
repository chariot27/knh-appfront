// app/(tabs)/contatos/index.tsx
// Requer: expo-clipboard (expo install expo-clipboard)
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  Dimensions,
  RefreshControl,
  TouchableOpacity,
  Platform,
  ToastAndroid,
  Alert,
  TextInput,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const GUTTER = 14;
const CARD_W = Math.floor((width - GUTTER * 3) / 2);

// Altura da navbar fixa + respiro para não cobrir os cards
const NAVBAR_HEIGHT = 64;
const BOTTOM_INSET = NAVBAR_HEIGHT + 20;

export type MatchStatus = "mutuo" | "pendente";

export type ContactItem = {
  id: string;
  name: string;
  phone: string;
  avatarUrl: string;
  status: MatchStatus;
};

// ---- MOCK: gera bastante gente pra rolar a lista ----
function makeMock(total = 40): ContactItem[] {
  const out: ContactItem[] = [];
  for (let i = 1; i <= total; i++) {
    out.push({
      id: String(i),
      name:
        ["Alice", "Bruno", "Carla", "Diego", "Eva", "Felipe"][i % 6] +
        " " +
        (100 + i),
      phone: `+55 ${String(10 + (i % 19)).padStart(2, "0")} 9${String(
        1000 + (i % 9000)
      ).padStart(4, "0")}-${String(1000 + (i % 9000)).padStart(4, "0")}`,
      avatarUrl: `https://i.pravatar.cc/200?img=${(i % 70) + 1}`,
      status: i % 3 === 0 ? "pendente" : "mutuo",
    });
  }
  return out;
}

// normaliza para busca (remove acentos e caixa)
function norm(txt: string) {
  return txt
    .normalize("NFD")
    // @ts-ignore - \p{Diacritic} é suportado em motores modernos
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export default function ContatosScreen() {
  const [data, setData] = useState<ContactItem[]>(() => makeMock(40));
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // TODO: trocar por fetch da sua API
      await new Promise((r) => setTimeout(r, 600));
      setData(makeMock(40));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const onCopyPhone = useCallback(async (phone: string) => {
    try {
      await Clipboard.setStringAsync(phone);
      if (Platform.OS === "android") {
        ToastAndroid.show("Telefone copiado ✔", ToastAndroid.SHORT);
      } else {
        Alert.alert("Copiado", "Telefone copiado para a área de transferência.");
      }
    } catch {
      if (Platform.OS === "android") {
        ToastAndroid.show("Falha ao copiar", ToastAndroid.SHORT);
      } else {
        Alert.alert("Erro", "Não foi possível copiar o telefone.");
      }
    }
  }, []);

  const filtered = useMemo(() => {
    if (!query) return data;
    const q = norm(query);
    return data.filter((c) => norm(c.name).includes(q));
  }, [data, query]);

  const keyExtractor = useCallback((it: ContactItem) => it.id, []);

  const renderItem = useCallback(
    ({ item }: { item: ContactItem }) => {
      const isMutuo = item.status === "mutuo";
      const PhoneWrap = isMutuo ? TouchableOpacity : View;

      return (
        <View style={s.card}>
          <View style={s.avatarWrap}>
            <Image source={{ uri: item.avatarUrl }} style={s.avatar} />
            <View style={[s.badge, isMutuo ? s.badgeMutuo : s.badgePendente]}>
              <Feather
                name={isMutuo ? "check-circle" : "clock"}
                size={12}
                color="#fff"
              />
              <Text style={s.badgeText}>{isMutuo ? "Mútuo" : "Pendente"}</Text>
            </View>
          </View>

          <Text numberOfLines={1} style={s.name}>
            {item.name}
          </Text>

          <PhoneWrap
            {...(isMutuo
              ? { onPress: () => onCopyPhone(item.phone), activeOpacity: 0.8 }
              : {})}
            style={s.phoneRow}
          >
            {isMutuo ? (
              <>
                <Feather name="phone" size={14} />
                <Text style={s.phoneText}>{item.phone}</Text>
              </>
            ) : (
              <>
                <Feather name="lock" size={14} />
                <Text style={s.phoneLocked}>Visível após match mútuo</Text>
              </>
            )}
          </PhoneWrap>
        </View>
      );
    },
    [onCopyPhone]
  );

  const listContentStyle = useMemo(
    () => ({ padding: GUTTER, paddingBottom: BOTTOM_INSET }),
    []
  );

  return (
    <View style={s.screen}>
      {/* Barra de busca FORA da FlatList, mais para baixo */}
      <View style={s.searchWrap}>
        <Feather name="search" size={18} color="#aaa" />
        <TextInput
          placeholder="Pesquisar por nome..."
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          style={s.searchInput}
          returnKeyType="search"
          // garante que editar não feche o teclado
          blurOnSubmit={false}
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

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="users" size={20} color="#666" />
            <Text style={s.emptyTxt}>
              Nenhum contato encontrado para “{query}”.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00f2ea"
          />
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },

  // Barra de busca (mais para baixo do topo)
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
    marginHorizontal: GUTTER,
    marginTop: 60,      // ⇦ empurra mais para baixo
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 4,
  },
  clearBtn: {
    padding: 2,
    borderRadius: 8,
  },

  row: { gap: GUTTER, marginBottom: GUTTER },
  card: {
    width: CARD_W,
    backgroundColor: "#0b0b0b",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#141414",
  },
  avatarWrap: { alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: "#111",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    position: "absolute",
    bottom: -6,
  },
  badgeMutuo: { backgroundColor: "#1282f3" },
  badgePendente: { backgroundColor: "#555" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  name: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
    textAlign: "center",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  phoneText: { color: "#cfefff", fontSize: 13, fontWeight: "600" },
  phoneLocked: { color: "#aaa", fontSize: 12, fontStyle: "italic" },

  // vazio
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTxt: { color: "#888", fontSize: 13 },
});
