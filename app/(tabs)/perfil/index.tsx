// Perfil.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert,
  Image, Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCurrentUser, getPerfilByEmail } from "../gateway/api";
import { clearDevUnlock, isDevUnlock, setDevUnlock } from "../gateway/devUnlock";

const DEFAULT_AVATAR_URL =
  "https://cdn-icons-png.flaticon.com/512/149/149071.png";

const LOGIN_ROUTE = "/(tabs)/fixed/login";

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
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#00f2ea" />
          <Text style={{ color: "#bbb", marginTop: 12 }}>Carregando perfil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView>
        {/* Cabeçalho */}
        <View style={s.header}>
          <Text style={s.title}>Perfil do Usuário</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <TouchableOpacity onPress={refreshPerfil} style={s.iconBtn}>
              <Ionicons name="refresh" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleLock} style={s.iconBtn}>
              <Ionicons name={locked ? "lock-closed" : "lock-open"} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmLogout} style={[s.iconBtn, s.logoutBtn]}>
              <Ionicons name="exit-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Foto e nome */}
        <View style={s.profileSection}>
          <Image
            source={avatarError ? { uri: DEFAULT_AVATAR_URL } : displayAvatar}
            style={s.avatar}
            onError={() => setAvatarError(true)}
          />
          <View>
            <Text style={s.name}>{nome || "—"}</Text>
            <Text style={s.type}>{(tipo || "—").toString()}</Text>
            {!!email && <Text style={s.email}>{email}</Text>}
          </View>
        </View>

        {/* Biografia */}
        <Text style={s.label}>Biografia</Text>
        <TextInput
          style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
          value={bio ?? ""}
          editable={!locked}
          placeholder="Fale um pouco sobre você"
          placeholderTextColor="#888"
          onChangeText={setBio}
          multiline
        />

        {/* Filtro de feed */}
        <Text style={s.label}>Em breve</Text>
        <View style={s.pickerWrapper}>
          <Picker
            selectedValue={feedFilter}
            enabled={!locked}
            onValueChange={(value) => setFeedFilter(value)}
            dropdownIconColor="#fff"
            style={s.picker}
            mode={Platform.OS === "android" ? "dropdown" : undefined}
          >
            <Picker.Item label="Em breve" value="Em breve" color={itemColor} />
          </Picker>
        </View>

        {/* DEV Unlock abaixo do "Em breve" */}
        <Text style={[s.label, { marginTop: 6 }]}>Desbloqueio (DEV)</Text>
        <TextInput
          style={s.input}
          value={unlockText}
          onChangeText={onChangeUnlock}
          placeholder='Digite "TESTE" para liberar'
          placeholderTextColor="#888"
          autoCapitalize="characters"
        />
        {devUnlocked && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
            <View style={s.devPill}>
              <Text style={s.devPillTxt}>DESBLOQUEIO ATIVO</Text>
            </View>
            <TouchableOpacity onPress={disableUnlock} style={s.devPillBtn}>
              <Text style={s.devPillBtnTxt}>Desativar</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[s.button, s.subscribeButton]}
          onPress={() => router.push("/assinatura")}
        >
          <Text style={s.buttonText}>Assinar Streaming</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  iconBtn: { backgroundColor: "#2a2a2a", padding: 8, borderRadius: 8 },

  profileSection: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#2a2a2a", marginRight: 16, borderWidth: 1, borderColor: "#333" },
  name: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  type: { fontSize: 14, color: "#ccc" },
  email: { fontSize: 12, color: "#aaa", marginTop: 2 },

  label: { color: "#aaa", marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: "#1e1e1e", color: "#fff", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#2a2a2a" },

  pickerWrapper: { backgroundColor: "#1e1e1e", borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#2a2a2a" },
  picker: { color: "#fff", height: 56, width: "100%" },

  button: { backgroundColor: "#444", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 10 },
  subscribeButton: { backgroundColor: "#0066ff" },
  buttonText: { color: "#fff", fontWeight: "bold" },
  logoutBtn: { backgroundColor: "#b00020" },

  devPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(123,97,255,0.15)",
    borderWidth: 1,
    borderColor: "#7B61FF",
  },
  devPillTxt: { color: "#cfc4ff", fontWeight: "800", fontSize: 12 },
  devPillBtn: {
    backgroundColor: "#7B61FF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  devPillBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
