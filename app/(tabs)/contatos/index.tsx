// Requer: expo-clipboard (expo install expo-clipboard)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, Image, FlatList, StyleSheet, Dimensions, RefreshControl,
  TouchableOpacity, Platform, ToastAndroid, Alert, TextInput,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import {
  getUserIdFromToken, initCurrentUserFromToken,
  listMyMatches, listInvitesSent, listInvitesReceived,
  InviteStatus,
} from "../gateway/api";

const { width } = Dimensions.get("window");
const GUTTER = 14;
const CARD_W = Math.floor((width - GUTTER * 3) / 2);

// Altura da navbar fixa + respiro para não cobrir os cards
const NAVBAR_HEIGHT = 64;
const BOTTOM_INSET = NAVBAR_HEIGHT + 20;

export type MatchStatus = "mutuo" | "pendente";

export type ContactItem = {
  id: string;           // prefixado p_/m_/a_ para não colidir
  userId: string;       // id do contato (não o seu)
  name: string;
  phone: string;        // vazio quando pendente
  avatarUrl: string;
  status: MatchStatus;
};

const norm = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export default function ContatosScreen() {
  const [data, setData] = useState<ContactItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const toast = (m: string) =>
    Platform.OS === "android" ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert(m);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      // descobre meu userId
      let meId = getUserIdFromToken();
      if (!meId) {
        const me = await initCurrentUserFromToken().catch(() => null);
        // @ts-ignore
        meId = me?.id || null;
      }
      if (!meId) throw new Error("Usuário não autenticado.");

      /** 1) Contatos mútuos — preferimos invites RECEBIDOS/ACCEPTED
       *    (vem com nome/avatar/telefone do remetente, perfeito p/ UI) */
      const accepted = await listInvitesReceived(meId, "ACCEPTED" as InviteStatus);
      const mutuosFromAccepted: ContactItem[] = accepted.map((inv) => ({
        id: `a_${inv.id}`,
        userId: inv.inviterId,
        name: inv.inviterName || `Usuário ${inv.inviterId.slice(0, 6)}`,
        phone: inv.inviterPhone || "",
        avatarUrl:
          (inv.inviterAvatar && inv.inviterAvatar.length > 3)
            ? inv.inviterAvatar
            : `https://i.pravatar.cc/200?u=${encodeURIComponent(inv.inviterId)}`,
        status: "mutuo",
      }));

      /** 2) Pendentes que EU enviei (telefone oculto) */
      const sentPend = await listInvitesSent(meId, "PENDING" as InviteStatus);
      const pend: ContactItem[] = sentPend.map((inv) => ({
        id: `p_${inv.id}`,
        userId: inv.targetId,
        name: `Usuário ${inv.targetId.slice(0, 6)}`,
        phone: "",
        avatarUrl: `https://i.pravatar.cc/200?u=${encodeURIComponent(inv.targetId)}`,
        status: "pendente",
      }));

      /** 3) Fallback adicional: se não houver nenhum ACEITO no cache/servidor,
       *    usa /matches para não deixar a tela vazia (sem telefone garantido). */
      let mutuos = mutuosFromAccepted;
      if (mutuos.length === 0) {
        const matches = await listMyMatches(meId);
        mutuos = matches.map((m) => {
          const otherId = m.userA === meId ? m.userB : m.userA;
          return {
            id: `m_${m.id}`,
            userId: otherId,
            name: `Usuário ${otherId.slice(0, 6)}`,
            phone: "", // sem dados do convite; deixamos vazio
            avatarUrl: `https://i.pravatar.cc/200?u=${encodeURIComponent(otherId)}`,
            status: "mutuo",
          } as ContactItem;
        });
      }

      setData([...mutuos, ...pend]);
    } catch (e: any) {
      toast(e?.message || "Falha ao carregar contatos.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(load, [load]);

  const onCopyPhone = useCallback(async (phone: string) => {
    try {
      await Clipboard.setStringAsync(phone);
      Platform.OS === "android"
        ? ToastAndroid.show("Telefone copiado ✔", ToastAndroid.SHORT)
        : Alert.alert("Copiado", "Telefone copiado para a área de transferência.");
    } catch {
      Platform.OS === "android"
        ? ToastAndroid.show("Falha ao copiar", ToastAndroid.SHORT)
        : Alert.alert("Erro", "Não foi possível copiar o telefone.");
    }
  }, []);

  const filtered = useMemo(() => {
    if (!query) return data;
    return data.filter((c) => norm(c.name).includes(norm(query)));
  }, [data, query]);

  const keyExtractor = useCallback((it: ContactItem) => it.id, []);

  const renderItem = useCallback(
    ({ item }: { item: ContactItem }) => {
      const isMutuo = item.status === "mutuo";
      const PhoneWrap: any = isMutuo ? TouchableOpacity : View;

      return (
        <View style={s.card}>
          <View style={s.avatarWrap}>
            <Image source={{ uri: item.avatarUrl }} style={s.avatar} />
            <View style={[s.badge, isMutuo ? s.badgeMutuo : s.badgePendente]}>
              <Feather name={isMutuo ? "check-circle" : "clock"} size={12} color="#fff" />
              <Text style={s.badgeText}>{isMutuo ? "Mútuo" : "Pendente"}</Text>
            </View>
          </View>

          <Text numberOfLines={1} style={s.name}>{item.name}</Text>

          <PhoneWrap
            {...(isMutuo ? { onPress: () => onCopyPhone(item.phone), activeOpacity: 0.8 } : {})}
            style={s.phoneRow}
          >
            {isMutuo ? (
              <>
                <Feather name="phone" size={14} />
                <Text style={s.phoneText}>{item.phone || "Sem telefone"}</Text>
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
          blurOnSubmit={false}
        />
        {!!query && (
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
              {query ? `Nenhum contato para “${query}”.` : "Sem contatos ainda."}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00f2ea" />
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
    marginTop: 60,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 4,
  },
  clearBtn: { padding: 2, borderRadius: 8 },

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
