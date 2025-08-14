// Requer: expo-clipboard (expo install expo-clipboard)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, Image, FlatList, StyleSheet, Dimensions, RefreshControl,
  TouchableOpacity, Platform, ToastAndroid, Alert, TextInput,
  ActivityIndicator,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  getUserIdFromToken, initCurrentUserFromToken,
  listMyMatches, listInvitesSent, listInvitesReceived,
  InviteStatus, isSubscriptionActiveCached,
} from "../gateway/api";



const { width } = Dimensions.get("window");
const GUTTER = 14;
const CARD_W = Math.floor((width - GUTTER * 3) / 2);

// Altura da navbar fixa + respiro para não cobrir os cards
const NAVBAR_HEIGHT = 64;
const BOTTOM_INSET = NAVBAR_HEIGHT + 20;

export type MatchStatus = "mutuo" | "pendente";

export type ContactItem = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  avatarUrl: string;
  status: MatchStatus;
};

const norm = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

function BlockedInline() {
  return (
    <View style={s2.wrap}>
      <Feather name="lock" size={24} color="#bbb" />
      <Text style={s2.title}>Recurso Premium</Text>
      <Text style={s2.msg}>Assine o Premium para visualizar seus contatos.</Text>
      <TouchableOpacity style={s2.btn} onPress={() => router.push("/assinatura")}>
        <Feather name="zap" size={16} color="#fff" />
        <Text style={s2.btnText}>Assinar Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ContatosScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<ContactItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => { (async () => setAllowed(await isSubscriptionActiveCached()))(); }, []);
  const toast = (m: string) =>
    Platform.OS === "android" ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert(m);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      let meId = getUserIdFromToken();
      if (!meId) {
        const me = await initCurrentUserFromToken().catch(() => null);
        // @ts-ignore
        meId = me?.id || null;
      }
      if (!meId) throw new Error("Usuário não autenticado.");

      const accepted = await listInvitesReceived(meId, "ACCEPTED" as InviteStatus);
      const mutuosFromAccepted: ContactItem[] = accepted.map((inv) => ({
        id: `a_${inv.id}`,
        userId: inv.inviterId,
        name: inv.inviterName || `Usuário ${inv.inviterId.slice(0, 6)}`,
        phone: inv.inviterPhone || "",
        avatarUrl:
          (inv.inviterAvatar && inv.inviterAvatar.length > 3)
            ? inv.inviterAvatar
            : `https://cdn.pixabay.com/photo/2013/07/13/10/44/man-157699_1280.png`,
        status: "mutuo",
      }));

      const sentPend = await listInvitesSent(meId, "PENDING" as InviteStatus);
      const pend: ContactItem[] = sentPend.map((inv) => ({
        id: `p_${inv.id}`,
        userId: inv.targetId,
        name: `Usuário ${inv.targetId.slice(0, 6)}`,
        phone: "",
        avatarUrl: `https://cdn.pixabay.com/photo/2013/07/13/10/44/man-157699_1280.png`,
        status: "pendente",
      }));

      let mutuos = mutuosFromAccepted;
      if (mutuos.length === 0) {
        const matches = await listMyMatches(meId);
        mutuos = matches.map((m) => {
          const otherId = m.userA === meId ? m.userB : m.userA;
          return {
            id: `m_${m.id}`,
            userId: otherId,
            name: `Usuário ${otherId.slice(0, 6)}`,
            phone: "",
            avatarUrl: `https://cdn.pixabay.com/photo/2013/07/13/10/44/man-157699_1280.png`,
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

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  const onRefresh = useCallback(() => { if (allowed) load(); }, [allowed, load]);
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

  if (allowed === null) {
    return <View style={{flex:1,alignItems:"center",justifyContent:"center"}}><ActivityIndicator color="#7B61FF" /></View>;
  }
  if (!allowed) return <BlockedInline />;

  return (
    <View style={s.screen}>
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
        renderItem={({ item }) => {
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
        }}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={{ padding: GUTTER, paddingBottom: BOTTOM_INSET }}
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

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTxt: { color: "#888", fontSize: 13 },
});

const s2 = StyleSheet.create({
  wrap: { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:24, gap:8, backgroundColor:"#000" },
  title: { color:"#fff", fontSize:18, fontWeight:"800" },
  msg: { color:"#bdbdbd", fontSize:13, textAlign:"center" },
  btn: { backgroundColor:"#6f63ff", borderRadius:12, paddingHorizontal:16, paddingVertical:10, flexDirection:"row", gap:6, alignItems:"center" },
  btnText: { color:"#fff", fontWeight:"800" },
});
