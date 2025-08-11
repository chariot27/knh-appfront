// app/(tabs)/fixed/RegisterScreen.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";

import { registerUser, type UploadFile } from "../gateway/api";

// Tags sugeridas (curadas)
const SUGGESTED_TAGS = [
  "Software",
  "Recursos Humanos",
  "Design",
  "Hardware",
  "Consultoria",
  "Profissional",
  "Networking",
] as const;

// util: "João da Silva" -> "joao" (backend usará <primeiroNome><uuid>.webp)
function firstNameSlug(s: string) {
  const first = (s || "").trim().split(/\s+/)[0] || "avatar";
  const noAccents = first.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return noAccents.replace(/[^a-zA-Z0-9-_]+/g, "_").toLowerCase();
}

function extFromMime(mime?: string) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export default function RegisterScreen() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [tipo, setTipo] = useState<"PROFISSIONAL" | "CONSULTOR">("PROFISSIONAL");
  const [bio, setBio] = useState("");

  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [manualTagsOpen, setManualTagsOpen] = useState(false);
  const [tagsRaw, setTagsRaw] = useState("");

  // Avatar
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<UploadFile | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const selectedSet = useMemo(
    () => new Set(selectedTags.map((t) => t.toLowerCase())),
    [selectedTags]
  );

  function toggleTag(tag: string) {
    const key = tag.toLowerCase();
    if (selectedSet.has(key)) {
      setSelectedTags((prev) => prev.filter((t) => t.toLowerCase() !== key));
    } else {
      setSelectedTags((prev) => [...prev, tag]);
    }
  }

  function addCustomTag() {
    const tag = customTag.trim();
    if (!tag) return;
    const exists = selectedSet.has(tag.toLowerCase());
    if (exists) {
      setCustomTag("");
      return;
    }
    if (selectedTags.length >= 10) {
      Alert.alert("Limite de tags", "Você pode escolher até 10 tags.");
      return;
    }
    setSelectedTags((prev) => [...prev, tag]);
    setCustomTag("");
  }

  async function escolherImagem() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "É necessário permitir acesso à galeria.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType ?? "image/jpeg";
    const ext = extFromMime(mime);

    // nome temporário para enviar (o servidor renomeia/força .webp)
    const name = `upload.${ext}`;

    setAvatarPreviewUri(uri);
    setAvatarFile({ uri, type: mime, name });
  }

  function buildPayload() {
    const manual = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const all = Array.from(new Set([...selectedTags, ...manual].map((t) => t.trim())));

    const onlyDigitsPhone = telefone.replace(/\D+/g, "");

    // backend usa o NOME para formar <primeiroNome><uuid>.webp
    // enviamos avatarUrl só como sugestão/compat (ex.: "max")
    const desiredBaseName = firstNameSlug(nome || (email.split("@")[0] || "avatar"));

    return {
      nome,
      email,
      telefone: onlyDigitsPhone,
      senha,
      tipo,             // "PROFISSIONAL" | "CONSULTOR"
      bio: bio || undefined,
      tags: all.length ? all : undefined,
      avatarUrl: desiredBaseName,
    };
  }

  async function onSubmit() {
    const payload = buildPayload();

    if (!payload.nome || !payload.email || !payload.senha || !payload.telefone) {
      Alert.alert("Campos obrigatórios", "Preencha nome, email, telefone e senha.");
      return;
    }

    const toLog = { ...payload, _hasFile: !!avatarFile };
    console.log("➡️ RegisterScreen enviando:", JSON.stringify(toLog, null, 2));

    setSubmitting(true);
    try {
      const resp = await registerUser(payload, avatarFile || undefined);
      console.log("✅ RegisterScreen resposta:", resp);

      // reset
      setNome("");
      setEmail("");
      setTelefone("");
      setSenha("");
      setTipo("PROFISSIONAL");
      setBio("");
      setTagsRaw("");
      setSelectedTags([]);
      setAvatarPreviewUri(null);
      setAvatarFile(null);

      Alert.alert("Sucesso", "Cadastro realizado com sucesso!");
      router.replace("/(tabs)/fixed/login");
    } catch (e: any) {
      console.error("❌ RegisterScreen erro:", e);
      Alert.alert("Erro ao cadastrar", e?.message || "Não foi possível concluir o cadastro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Text style={styles.title}>Criar conta</Text>

          {/* Avatar */}
          <TouchableOpacity onPress={escolherImagem} style={styles.avatarWrapper} disabled={submitting}>
            <Image
              source={{
                uri: avatarPreviewUri || "https://cdn-icons-png.flaticon.com/512/847/847969.png",
              }}
              style={styles.avatar}
            />
            {!avatarPreviewUri && (
              <View style={styles.plusOverlay}>
                <Text style={styles.plusText}>+</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput
            placeholder="Nome"
            placeholderTextColor="#777"
            value={nome}
            onChangeText={setNome}
            style={styles.input}
            editable={!submitting}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor="#777"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            editable={!submitting}
          />
          <TextInput
            placeholder="Telefone"
            placeholderTextColor="#777"
            keyboardType="phone-pad"
            value={telefone}
            onChangeText={setTelefone}
            style={styles.input}
            editable={!submitting}
          />
          <TextInput
            placeholder="Senha"
            placeholderTextColor="#777"
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
            style={styles.input}
            editable={!submitting}
          />

          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={tipo}
              onValueChange={(v) => setTipo(v)}
              dropdownIconColor="#000"
              style={styles.picker}
              enabled={!submitting}
            >
              <Picker.Item label="Profissional" value="PROFISSIONAL" />
              <Picker.Item label="Consultor" value="CONSULTOR" />
            </Picker>
          </View>

          <TextInput
            placeholder="Bio (opcional)"
            placeholderTextColor="#777"
            value={bio}
            onChangeText={setBio}
            style={[styles.input, styles.inputMultiline]}
            multiline
            numberOfLines={4}
            editable={!submitting}
          />

          {/* === TAGS === */}
          <View style={styles.tagsCard}>
            <Text style={styles.sectionTitle}>Escolha suas áreas</Text>

            <View className="chipsWrap" style={styles.chipsWrap}>
              {SUGGESTED_TAGS.map((tag) => {
                const active = selectedSet.has(tag.toLowerCase());
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={({ pressed }) => [
                      styles.chipBase,
                      active ? styles.chipActive : styles.chipIdle,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    {active ? (
                      <LinearGradient
                        colors={["#00f2ea", "#ff0050"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.chipGradient}
                      >
                        <Text style={styles.chipTextActive}>{tag}</Text>
                      </LinearGradient>
                    ) : (
                      <Text style={styles.chipTextIdle}>{tag}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Adicionar tag personalizada */}
            <View style={styles.customRow}>
              <TextInput
                placeholder="Adicionar tag personalizada"
                placeholderTextColor="#888"
                value={customTag}
                onChangeText={setCustomTag}
                style={styles.customInput}
                editable={!submitting}
                onSubmitEditing={addCustomTag}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={addCustomTag}
                disabled={!customTag.trim()}
                activeOpacity={0.85}
                style={[styles.addBtnWrap, !customTag.trim() && { opacity: 0.6 }]}
              >
                <LinearGradient
                  colors={["#00f2ea", "#ff0050"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.addBtn}
                >
                  <Text style={styles.addBtnText}>+</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Lista de tags escolhidas */}
            {selectedTags.length > 0 && (
              <>
                <Text style={styles.selectedTitle}>Selecionadas</Text>
                <View style={styles.selectedWrap}>
                  {selectedTags.map((t) => (
                    <View key={t} style={styles.selectedPill}>
                      <Text style={styles.selectedText}>{t}</Text>
                      <Pressable
                        onPress={() => toggleTag(t)}
                        style={({ pressed }) => [styles.removePill, pressed && { opacity: 0.7 }]}
                        hitSlop={8}
                      >
                        <Text style={styles.removePillText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Alternar input manual */}
            <Pressable
              onPress={() => setManualTagsOpen((v) => !v)}
              style={({ pressed }) => [styles.manualToggle, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.manualToggleText}>
                {manualTagsOpen ? "Ocultar entrada manual" : "Adicionar manualmente (opcional)"}
              </Text>
            </Pressable>

            {manualTagsOpen && (
              <TextInput
                placeholder="Digite tags separadas por vírgula"
                placeholderTextColor="#888"
                value={tagsRaw}
                onChangeText={setTagsRaw}
                style={styles.manualInput}
                editable={!submitting}
              />
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onSubmit}
            style={styles.buttonWrapper}
            disabled={submitting}
          >
            <LinearGradient
              colors={["#00f2ea", "#ff0050"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.button}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Cadastrar</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/(tabs)/fixed/login")} style={{ marginTop: 8 }}>
            <Text style={{ color: "#bbb" }}>Já tem conta? Entrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#000" },
  scroll: { flexGrow: 1, justifyContent: "center", paddingVertical: 40 },
  container: { alignItems: "center", gap: 16, paddingHorizontal: 16 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 10 },

  avatarWrapper: { position: "relative", width: 120, height: 120, marginBottom: 16 },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#ff0050",
    backgroundColor: "#222",
  },
  plusOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  plusText: { color: "#fff", fontSize: 40, fontWeight: "700" },

  input: {
    width: "92%",
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#0c0c0c",
    color: "#fff",
    fontSize: 16,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },

  pickerWrapper: {
    width: "92%",
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#0c0c0c",
    overflow: "hidden",
    justifyContent: "center",
  },
  picker: { width: "100%", height: 50, color: "#fff" },

  // ===== TAGS =====
  tagsCard: {
    width: "92%",
    backgroundColor: "#0c0c0c",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    gap: 10,
  },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 4 },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chipBase: { borderRadius: 999, overflow: "hidden" },
  chipIdle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#262626",
  },
  chipActive: {},
  chipGradient: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipTextIdle: { color: "#bbb", fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: "#fff", fontSize: 14, fontWeight: "700" },
  chipPressed: { transform: [{ scale: 0.98 }] },

  customRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  customInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#111",
    color: "#fff",
    fontSize: 14,
  },
  addBtnWrap: { width: 44, height: 44, borderRadius: 12, overflow: "hidden" },
  addBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
  addBtnText: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: -2 },

  selectedTitle: { color: "#aaa", fontSize: 13, fontWeight: "700", marginTop: 4 },
  selectedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  selectedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#141414",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#262626",
  },
  selectedText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  removePill: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a2a2a",
  },
  removePillText: { color: "#fff", fontSize: 12, fontWeight: "800", lineHeight: 18 },

  manualToggle: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#222",
  },
  manualToggleText: { color: "#bbb", fontSize: 12, fontWeight: "700" },
  manualInput: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#111",
    color: "#fff",
    fontSize: 14,
    paddingHorizontal: 12,
    height: 44,
  },

  buttonWrapper: {
    width: "92%",
    height: 50,
    borderRadius: 28,
    overflow: "hidden",
    marginTop: 10,
  },
  button: {
    flex: 1,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
