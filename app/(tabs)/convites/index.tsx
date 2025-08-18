// ConvitesScreen.tsx
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import {
  InviteDTO, InviteStatus, acceptInvite,
  getUserIdFromToken, initCurrentUserFromToken,
  isSubscriptionActiveCached,
  listInvitesReceived,
} from "../gateway/api";
import { isDevUnlock } from "../gateway/devUnlock";

const { width } = Dimensions.get("window");
const GUTTER = 14;
const CARD_W = width - GUTTER * 2;
const NAVBAR_HEIGHT = 72;
const BOTTOM_INSET = NAVBAR_HEIGHT + 16;

type ConviteItem = {
  id: string;
  inviterId: string;
  targetId: string;
  name: string;
  avatarUrl?: string;
  message?: string;
  createdAt: number;
};

const norm = (t: string) =>
  t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/* function BlockedInline() {
  return (
    <View style={b.wrap}>
      <Feather name="lock" size={24} color="#bbb" />
      <Text style={b.title}>Recurso Premium</Text>
      <Text style={b.msg}>Assine o Premium para ver seus convites.</Text>
      <TouchableOpacity style={b.btn} onPress={() => router.push("/assinatura")}>
        <Feather name="zap" size={16} color="#fff" />
        <Text style={b.btnText}>Assinar Premium</Text>
      </TouchableOpacity>
    </View>
  );
} */

export default function ConvitesScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [dev, setDev] = useState(false);
  const [data, setData] = useState<ConviteItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const toast = (m: string) =>
    Platform.OS === "android" ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert(m);

  const checkAllowed = useCallback(async () => {
    const d = await isDevUnlock();
    setDev(d);
    if (d) {
      setAllowed(true);
      return;
    }
    setAllowed(await isSubscriptionActiveCached());
  }, []);

  useEffect(() => { checkAllowed(); }, [checkAllowed]);
  useFocusEffect(useCallback(() => { checkAllowed(); }, [checkAllowed]));

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

      const rows: InviteDTO[] = await listInvitesReceived(meId, "PENDING" as InviteStatus);

      const items: ConviteItem[] = rows.map((inv) => ({
        id: inv.id,
        inviterId: inv.inviterId,
        targetId: inv.targetId,
        name: inv.inviterName || `Usuário ${inv.inviterId.slice(0, 6)}`,
        avatarUrl:
          (inv.inviterAvatar && inv.inviterAvatar.length > 3)
            ? inv.inviterAvatar
            : `https://i.pravatar.cc/200?u=${encodeURIComponent(inv.inviterId)}`,
        message: "Curtiu seu pub e quer conectar",
        createdAt: Date.parse(inv.createdAt || new Date().toISOString()),
      }));

      setData(items);
    } catch (e: any) {
      toast(e?.message || "Falha ao carregar convites.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);
  const onRefresh = useCallback(() => { if (allowed) load(); }, [allowed, load]);

  const onAccept = useCallback(async (inviteId: string) => {
    try {
      await acceptInvite(inviteId);
      setData((prev) => prev.filter((c) => c.id !== inviteId));
      toast("Match confirmado ✔");
    } catch (e: any) {
      toast(`Falha ao aceitar: ${e?.message || "erro"}`);
    }
  }, []);

  const onDecline = useCallback((inviteId: string) => {
    setData((prev) => prev.filter((c) => c.id !== inviteId));
    toast("Convite removido");
  }, []);

  const filtered = useMemo(() => {
    if (!query) return data;
    return data.filter((c) => norm(c.name).includes(norm(query)));
  }, [data, query]);

  if (allowed === null) {
    return <View style={{flex:1,alignItems:"center",justifyContent:"center"}}><ActivityIndicator color="#7B61FF" /></View>;
  }
  //if (!allowed) return <BlockedInline />;

  return (
    <View style={s.screen}>
      {dev && (
        <View style={s.devPill}>
          <Text style={s.devPillTxt}>DESBLOQUEIO DEV ATIVO</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(it: any) => it.id}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.row}>
              <Image source={{ uri: item.avatarUrl }} style={s.avatar} />
              <View style={s.info}>
                <Text numberOfLines={1} style={s.name}>{item.name}</Text>
                {!!item.message && <Text numberOfLines={2} style={s.msg}>{item.message}</Text>}
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
        )}
        contentContainerStyle={{ padding: GUTTER, paddingBottom: BOTTOM_INSET }}
        ListHeaderComponent={(
          <View style={s.headerWrap}>
            <View style={s.topbar}>
              <Text style={s.title}>Convites</Text>
              <View style={s.counter}>
                <Feather name="inbox" size={14} color="#bdbdbd" />
                <Text style={s.counterTxt}>
                  {filtered.length} {filtered.length === 1 ? "convite" : "convites"}
                </Text>
              </View>
            </View>

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
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="inbox" size={20} color="#666" />
            <Text style={s.emptyTxt}>
              {query ? `Sem resultados para “${query}”.` : "Sem convites por enquanto."}
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B61FF" />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const b = StyleSheet.create({
  wrap: { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:24, gap:8, backgroundColor:"#000" },
  title: { color:"#fff", fontSize:18, fontWeight:"800" },
  msg: { color:"#bdbdbd", fontSize:13, textAlign:"center" },
  btn: { backgroundColor:"#6f63ff", borderRadius:12, paddingHorizontal:16, paddingVertical:10, flexDirection:"row", gap:6, alignItems:"center" },
  btnText: { color:"#fff", fontWeight:"800" },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  devPill: {
    alignSelf: "flex-start",
    marginTop: 8,
    marginLeft: GUTTER,
    backgroundColor: "rgba(123,97,255,0.18)",
    borderColor: "#7B61FF",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  devPillTxt: { color: "#cfc4ff", fontWeight: "800", fontSize: 12 },

  headerWrap: { marginBottom: 12, marginTop: 40 },
  topbar: { flexDirection: "row", alignItems: "center", marginBottom: 14 },

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
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 4 },
  clearBtn: { padding: 2, borderRadius: 8 },

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
  btnGhost: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "#1a1a1a" },
  btnGhostText: { fontSize: 14, fontWeight: "800" },
  btnPrimary: { backgroundColor: "#6f63ff", borderWidth: 1, borderColor: "#6f63ff" },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 8 },
  emptyTxt: { color: "#888", fontSize: 13 },
});
