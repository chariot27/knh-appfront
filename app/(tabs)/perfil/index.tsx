// Perfil.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCurrentUser, getPerfilByEmail } from "../gateway/api";
import { clearDevUnlock, isDevUnlock, setDevUnlock } from "../gateway/devUnlock";

const DEFAULT_AVATAR_URL = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const LOGIN_ROUTE = "/(tabs)/fixed/login";

// ===== Paleta unificada com telas anteriores =====
const BG = "#0B0B10";
const CARD = "#151519";
const INPUT = "#1C1D22";
const BORDER = "#2A2B34";
const TEXT = "#FFFFFF";
const SUBTEXT = "#B7BAC8";
const PLACEHOLDER = "#9AA0AE";
const PURPLE = "#9333EA";
const PURPLE_DIM = "#7E22CE";
const PURPLE_SOFT = "#A78BFA";

export default function Perfil() {
  const [locked, setLocked] = useState(true);
  const [feedFilter, setFeedFilter] = useState("ambos");
  const [loading, setLoading] = useState(true);

  const [nome, setNome] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [email, setEmail] = useState<string>("");

  const [unlockText, setUnlockText] = useState("");
  const [devUnlocked, setDevUnlocked] = useState(false);

  const itemColor = Platform.OS === "android" ? "#000" : "#fff";

  const readDev = useCallback(async () => {
    const on = await isDevUnlock();
    setDevUnlocked(on);
    if (on) setLocked(false);
  }, []);

  useEffect(() => {
    const cached = getCurrentUser();
    if (cached) hydrate(cached);
    readDev().finally(() => setLoading(false));
  }, [readDev]);

  useFocusEffect(
    useCallback(() => {
      const cached = getCurrentUser();
      if (cached) hydrate(cached);
      readDev();
    }, [readDev])
  );

  function hydrate(u: any) {
    setNome(u?.nome ?? "");
    setTipo(u?.tipo ?? "");
    setBio(u?.bio ?? "");
    setAvatarUrl(u?.avatarUrl ?? undefined);
    setEmail(u?.email ?? "");
    setTags(u?.tags ?? []);
  }

  function toImageSource(url?: string) {
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
      return { uri: DEFAULT_AVATAR_URL };
    }
    return { uri: url.trim() };
  }

  const displayAvatar = useMemo(() => toImageSource(avatarUrl), [avatarUrl]);
  const [avatarError, setAvatarError] = useState(false);

  const toggleLock = () => setLocked(!locked);

  async function refreshPerfil() {
    if (!email) return;
    try {
      setLoading(true);
      const perfil = await getPerfilByEmail(email);
      hydrate(perfil);
      setAvatarError(false);
    } catch (e: any) {
      console.warn("Refresh perfil falhou:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }

  function confirmLogout() {
    Alert.alert(
      "Sair da conta",
      "Deseja deslogar?",
      [
        { text: "Não", style: "cancel" },
        { text: "Sim", style: "destructive", onPress: doLogout },
      ],
      { cancelable: true }
    );
  }

  async function doLogout() {
    try {
      await AsyncStorage.multiRemove(["authToken", "currentUser"]);
      setNome(""); setTipo(""); setBio(""); setAvatarUrl(undefined);
      setEmail(""); setTags([]);
      router.replace(LOGIN_ROUTE);
    } catch (e) {
      console.warn("Falha ao deslogar:", e);
      router.replace(LOGIN_ROUTE);
    }
  }

  // === Desbloqueio DEV: digite TESTE ===
  const onChangeUnlock = useCallback(async (t: string) => {
    setUnlockText(t);
    if (t.trim().toUpperCase() === "TESTE") {
      await setDevUnlock(true);
      setDevUnlocked(true);
      setLocked(false);
      setUnlockText("");
      Alert.alert("Modo DEV", "Desbloqueio ativado. Telas e botões liberados. ✅");
    }
  }, []);

  const disableUnlock = useCallback(async () => {
    await clearDevUnlock();
    setDevUnlocked(false);
    setLocked(true);
    Alert.alert("Modo DEV", "Desbloqueio desativado.");
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={{ color: SUBTEXT, marginTop: 12 }}>Carregando perfil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Perfil</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={refreshPerfil} style={styles.iconBtn}>
              <Ionicons name="refresh" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleLock} style={styles.iconBtn}>
              <Ionicons name={locked ? "lock-closed" : "lock-open"} size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmLogout} style={[styles.iconBtn, styles.logoutBtn]}>
              <Ionicons name="exit-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Card: avatar + identidade */}
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.avatarRing}>
              <Image
                source={avatarError ? { uri: DEFAULT_AVATAR_URL } : displayAvatar}
                style={styles.avatar}
                onError={() => setAvatarError(true)}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{nome || "—"}</Text>
              <Text style={styles.type}>{(tipo || "—").toString()}</Text>
              {!!email && <Text style={styles.email}>{email}</Text>}
            </View>
          </View>

          {/* Tags (pills) */}
          {Array.isArray(tags) && tags.length > 0 && (
            <>
              <Text style={styles.sectionSub}>Áreas</Text>
              <View style={styles.tagsWrap}>
                {tags.map((t, i) => (
                  <View key={`${t}-${i}`} style={styles.tagPill}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Card: Biografia */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Biografia</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={bio ?? ""}
            editable={!locked}
            placeholder="Fale um pouco sobre você"
            placeholderTextColor={PLACEHOLDER}
            onChangeText={setBio}
            multiline
          />
        </View>

        {/* Card: Preferências (em breve / filtro) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Preferências</Text>
          <Text style={styles.label}>Em breve</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={feedFilter}
              enabled={!locked}
              onValueChange={(value) => setFeedFilter(value)}
              dropdownIconColor="#fff"
              style={styles.picker}
              mode={Platform.OS === "android" ? "dropdown" : undefined}
            >
              <Picker.Item label="Em breve" value="Em breve" color={itemColor} />
            </Picker>
          </View>
        </View>

        {/* Card: DEV Unlock */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Desenvolvedor</Text>
          <Text style={styles.label}>Desbloqueio (DEV)</Text>
          <TextInput
            style={styles.input}
            value={unlockText}
            onChangeText={onChangeUnlock}
            placeholder='Digite "TESTE" para liberar'
            placeholderTextColor={PLACEHOLDER}
            autoCapitalize="characters"
          />
          {devUnlocked && (
            <View style={styles.devRow}>
              <View style={styles.devPill}>
                <Text style={styles.devPillTxt}>DESBLOQUEIO ATIVO</Text>
              </View>
              <TouchableOpacity onPress={disableUnlock} style={styles.devPillBtn}>
                <Text style={styles.devPillBtnTxt}>Desativar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.button, styles.subscribeButton]}
          onPress={() => router.push("/assinatura")}
        >
          <Text style={styles.buttonText}>Assinar Streaming</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 16, gap: 12 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  title: { fontSize: 20, fontWeight: "800", color: TEXT },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    backgroundColor: "#20212A",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  logoutBtn: { backgroundColor: "#B00020", borderColor: "#A21D2B" },

  // Card base
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
  },

  // Identidade
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: "#111218",
    borderWidth: 2,
    borderColor: PURPLE_SOFT, // aro roxo suave
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: "#191A22",
  },
  name: { fontSize: 18, fontWeight: "800", color: TEXT },
  type: { fontSize: 13, color: SUBTEXT, marginTop: 2 },
  email: { fontSize: 12, color: SUBTEXT, marginTop: 2 },

  // Tags
  sectionSub: { color: SUBTEXT, fontSize: 12, fontWeight: "800", marginTop: 2 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#12131A",
    borderWidth: 1,
    borderColor: BORDER,
  },
  tagText: { color: TEXT, fontSize: 12.5, fontWeight: "700" },

  // Seções
  sectionTitle: { color: TEXT, fontSize: 14, fontWeight: "800", marginBottom: 2 },
  label: { color: SUBTEXT, fontSize: 12, marginBottom: 6 },

  // Inputs
  input: {
    backgroundColor: INPUT,
    color: TEXT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 14.5,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },

  // Picker
  pickerWrapper: {
    backgroundColor: INPUT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  picker: { color: TEXT, height: 50, width: "100%" },

  // DEV pills
  devRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  devPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(147, 51, 234, 0.18)",
    borderWidth: 1,
    borderColor: PURPLE,
  },
  devPillTxt: { color: "#E9DAFF", fontWeight: "800", fontSize: 12 },
  devPillBtn: {
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  devPillBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },

  // CTA
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PURPLE,
    marginTop: 6,
    shadowColor: PURPLE,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  subscribeButton: { },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 15.5, letterSpacing: 0.3 },
});
