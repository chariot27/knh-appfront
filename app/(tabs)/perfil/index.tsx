import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { getCurrentUser, getPerfilByEmail } from "../gateway/api";
import { useFocusEffect } from "expo-router";

const DEFAULT_AVATAR_URL =
  "https://cdn-icons-png.flaticon.com/512/149/149071.png"; // imagem padrão de perfil vazio

export default function Perfil() {
  const [locked, setLocked] = useState(true);
  const [theme, setTheme] = useState("escuro");
  const [feedFilter, setFeedFilter] = useState("ambos");
  const [loading, setLoading] = useState(true);

  const [nome, setNome] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [email, setEmail] = useState<string>("");

  const itemColor = Platform.OS === "android" ? "#000" : "#fff";

  useEffect(() => {
    const cached = getCurrentUser();
    if (cached) hydrate(cached);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const cached = getCurrentUser();
      if (cached) hydrate(cached);
    }, [])
  );

  function hydrate(u: any) {
    setNome(u?.nome ?? "");
    setTipo(u?.tipo ?? "");
    setBio(u?.bio ?? "");
    setAvatarUrl(u?.avatarUrl ?? undefined);
    setEmail(u?.email ?? "");
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

        {/* Tema */}
        <Text style={s.label}>Tema</Text>
        <View style={s.pickerWrapper}>
          <Picker
            selectedValue={theme}
            enabled={!locked}
            onValueChange={(value) => setTheme(value)}
            dropdownIconColor="#fff"
            style={s.picker}
            mode={Platform.OS === "android" ? "dropdown" : undefined}
          >
            <Picker.Item label="Claro" value="claro" color={itemColor} />
            <Picker.Item label="Escuro" value="escuro" color={itemColor} />
            <Picker.Item label="Azul" value="azul" color={itemColor} />
          </Picker>
        </View>

        {/* Filtro de feed */}
        <Text style={s.label}>O que deseja ver no feed?</Text>
        <View style={s.pickerWrapper}>
          <Picker
            selectedValue={feedFilter}
            enabled={!locked}
            onValueChange={(value) => setFeedFilter(value)}
            dropdownIconColor="#fff"
            style={s.picker}
            mode={Platform.OS === "android" ? "dropdown" : undefined}
          >
            <Picker.Item label="Profissionais" value="profissionais" color={itemColor} />
            <Picker.Item label="Consultores" value="consultores" color={itemColor} />
            <Picker.Item label="Ambos" value="ambos" color={itemColor} />
          </Picker>
        </View>

        {/* Botões */}
        <TouchableOpacity style={[s.button, s.subscribeButton]}>
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
  input: { backgroundColor: "#1e1e1e", color: "#fff", borderRadius: 8, padding: 10 },

  tagsContainer: { flexDirection: "row", flexWrap: "wrap" },
  tag: { backgroundColor: "#333", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, marginRight: 6, marginBottom: 6 },
  tagText: { color: "#fff" },

  pickerWrapper: { backgroundColor: "#1e1e1e", borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#2a2a2a" },
  picker: { color: "#fff", height: 56, width: "100%" },

  button: { backgroundColor: "#444", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 10 },
  subscribeButton: { backgroundColor: "#0066ff" },
  buttonText: { color: "#fff", fontWeight: "bold" },
});
