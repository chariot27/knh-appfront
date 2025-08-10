// app/(tabs)/fixed/perfil.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { getCurrentUser, getUserIdFromToken, getUserById } from "../gateway/api";

export default function Perfil() {
  const [locked, setLocked] = useState(true);
  const [theme, setTheme] = useState("escuro");
  const [feedFilter, setFeedFilter] = useState("ambos");
  const [loading, setLoading] = useState(true);

  const [nome, setNome] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);

  const itemColor = Platform.OS === "android" ? "#000" : "#fff";

  useEffect(() => {
    // tenta cache primeiro
    const cached = getCurrentUser();
    if (cached) {
      hydrate(cached);
      setLoading(false);
      return;
    }
    // tenta via token -> getById
    (async () => {
      try {
        const id = getUserIdFromToken();
        if (!id) throw new Error("Token sem user id");
        const user = await getUserById(id);
        hydrate(user);
      } catch (e) {
        console.warn("Perfil: falha ao carregar usuário:", (e as any)?.message || e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function hydrate(u: any) {
    setNome(u?.nome ?? "");
    setTipo(u?.tipo ?? "");
    setBio(u?.bio ?? "");
    setAvatar(u?.avatar ?? undefined);
    setTags(Array.isArray(u?.tags) ? u.tags : []);
  }

  const displayAvatar = useMemo(() => {
    if (avatar && typeof avatar === "string") return { uri: avatar };
    return require("./avatar-placeholder.png");
  }, [avatar]);

  const toggleLock = () => setLocked(!locked);

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
          <TouchableOpacity onPress={toggleLock}>
            <Ionicons name={locked ? "lock-closed" : "lock-open"} size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Foto e nome */}
        <View style={s.profileSection}>
          <Image source={displayAvatar} style={s.avatar} />
          <View>
            <Text style={s.name}>{nome || "—"}</Text>
            <Text style={s.type}>{(tipo || "—").toString()}</Text>
          </View>
        </View>

        {/* Biografia */}
        <Text style={s.label}>Biografia</Text>
        <TextInput
          style={s.input}
          value={bio}
          editable={!locked}
          placeholder="Fale um pouco sobre você"
          placeholderTextColor="#888"
          onChangeText={setBio}
        />

        {/* Tags */}
        <Text style={s.label}>Tags</Text>
        <View style={s.tagsContainer}>
          {(tags ?? []).map((tag, i) => (
            <View key={`${tag}-${i}`} style={s.tag}>
              <Text style={s.tagText}>#{tag}</Text>
            </View>
          ))}
          {(!tags || tags.length === 0) && (
            <Text style={{ color: "#777" }}>Sem tags</Text>
          )}
        </View>

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
        <TouchableOpacity style={s.button}>
          <Text style={s.buttonText}>Trocar senha</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.button, s.subscribeButton]}>
          <Text style={s.buttonText}>Assinar Streaming</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff" },

  profileSection: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#2a2a2a", marginRight: 16, borderWidth: 1, borderColor: "#333" },
  name: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  type: { fontSize: 14, color: "#ccc" },

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
