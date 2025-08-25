// app/(tabs)/fixed/RegisterScreen.tsx
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { registerUser, type UploadFile } from "../gateway/api";

// ======= Paleta/UI compacta =======
const BG = "#0B0B10";
const CARD = "#151519";
const INPUT = "#1C1D22";
const BORDER = "#2A2B34";
const PLACEHOLDER = "#9AA0AE";
const TEXT = "#FFFFFF";
const SUBTEXT = "#B7BAC8";

const PURPLE = "#9333EA";      // principal
const PURPLE_DIM = "#7E22CE";  // contorno
const PURPLE_SOFT = "#A78BFA"; // texto de apoio
const DANGER = "#EF4444";      // erro

// Tags fixas (sem customização)
const FIXED_TAGS = [
  "tecnologia",
  "recursos humanos",
  "consultoria",
  "aprendizado",
  "ensino",
  "empreender",
  "contratar",
] as const;

// util: "João da Silva" -> "joao"
function firstNameSlug(s: string) {
  const first = (s || "").trim().split(/\s+/)[0] || "avatar";
  const noAccents = first.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return noAccents.replace(/[^a-zA-Z0-9-_]+/g, "_").toLowerCase();
}
function extFromMime(mime?: string) {
  switch (mime) {
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/jpeg":
    case "image/jpg": return "jpg";
    case "image/gif": return "gif";
    default: return "jpg";
  }
}

// validação simples
function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function cleanDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

type FieldErrors = Partial<Record<"nome"|"email"|"telefone"|"senha", string>>;

export default function RegisterScreen() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [tipo, setTipo] = useState<"PROFISSIONAL" | "CONSULTOR">("PROFISSIONAL");
  const [bio, setBio] = useState("");

  // Tags escolhidas
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Avatar
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<UploadFile | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // erros de campo
  const [errors, setErrors] = useState<FieldErrors>({});

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
    const name = `upload.${ext}`;

    setAvatarPreviewUri(uri);
    setAvatarFile({ uri, type: mime, name });
  }

  function buildPayload() {
    const onlyDigitsPhone = cleanDigits(telefone);
    const desiredBaseName = firstNameSlug(nome || (email.split("@")[0] || "avatar"));
    return {
      nome,
      email,
      telefone: onlyDigitsPhone,
      senha,
      tipo,
      bio: bio || undefined,
      tags: selectedTags.length ? selectedTags : undefined,
      avatarUrl: desiredBaseName,
    };
  }

  function validateAll(): { ok: boolean; errs: FieldErrors } {
    const errs: FieldErrors = {};
    const nomeTrim = (nome || "").trim();
    const emailTrim = (email || "").trim();
    const senhaTrim = (senha || "").trim();
    const phoneDigits = cleanDigits(telefone);

    if (!nomeTrim) errs.nome = "Informe seu nome completo.";
    if (!emailTrim) errs.email = "Informe seu email.";
    else if (!isEmail(emailTrim)) errs.email = "Email inválido.";

    if (!senhaTrim) errs.senha = "Informe uma senha.";
    else if (senhaTrim.length < 6) errs.senha = "A senha deve ter ao menos 6 caracteres.";

    if (!phoneDigits) errs.telefone = "Informe seu telefone.";
    else if (phoneDigits.length < 10 || phoneDigits.length > 11)
      errs.telefone = "Telefone deve ter 10–11 dígitos (DDD + número).";

    // tipo já tem default; se quiser forçar seleção explícita, poderia validar aqui.

    return { ok: Object.keys(errs).length === 0, errs };
  }

  async function onSubmit() {
    // valida primeiro
    const { ok, errs } = validateAll();
    setErrors(errs);

    if (!ok) {
      const msg = Object.values(errs).join("\n• ");
      Alert.alert("Revise os campos", `• ${msg}`);
      return;
    }

    const payload = buildPayload();
    const toLog = { ...payload, _hasFile: !!avatarFile };
    console.log("➡️ RegisterScreen enviando:", JSON.stringify(toLog, null, 2));

    setSubmitting(true);
    try {
      const resp = await registerUser(payload, avatarFile || undefined);
      console.log("✅ RegisterScreen resposta:", resp);

      // reset visual
      setNome(""); setEmail(""); setTelefone(""); setSenha("");
      setTipo("PROFISSIONAL"); setBio("");
      setSelectedTags([]);
      setAvatarPreviewUri(null); setAvatarFile(null);
      setErrors({});

      Alert.alert("Sucesso", "Cadastro realizado com sucesso!");
      router.replace("/(tabs)/fixed/login");
    } catch (e: any) {
      console.error("❌ RegisterScreen erro:", e);
      Alert.alert("Erro ao cadastrar", e?.message || "Não foi possível concluir o cadastro.");
    } finally {
      setSubmitting(false);
    }
  }

  // Para caber à vista: avatar menor, espaçamentos reduzidos, campos compactos (44-48px),
  // cabeçalho curto e sem ícones decorativos.
  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Text style={styles.headerTitle}>Criar conta</Text>

          {/* Avatar compacto com borda tracejada */}
          <TouchableOpacity onPress={escolherImagem} style={styles.avatarZone} disabled={submitting}>
            <View style={[styles.avatarBox, !avatarPreviewUri && styles.avatarDashed]}>
              {avatarPreviewUri ? (
                <Image source={{ uri: avatarPreviewUri }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>Upload</Text>
              )}
            </View>
            <Text style={styles.avatarHint}>
              {avatarPreviewUri ? "Trocar foto" : "Enviar foto de perfil"}
            </Text>
          </TouchableOpacity>

          {/* ===== Informações pessoais ===== */}
          <Text style={styles.sectionHead}>Informações</Text>

          <TextInput
            placeholder="Nome completo"
            placeholderTextColor={PLACEHOLDER}
            value={nome}
            onChangeText={(v)=>{ setNome(v); if (errors.nome) setErrors(p=>({ ...p, nome: undefined })); }}
            style={[styles.input, errors.nome && styles.inputError]}
            editable={!submitting}
          />
          <Text style={[styles.helperText, errors.nome && styles.helperDanger]}>
            {errors.nome ?? " "}
          </Text>

          <TextInput
            placeholder="Email"
            placeholderTextColor={PLACEHOLDER}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(v)=>{ setEmail(v); if (errors.email) setErrors(p=>({ ...p, email: undefined })); }}
            style={[styles.input, errors.email && styles.inputError]}
            editable={!submitting}
          />
          <Text style={[styles.helperText, errors.email && styles.helperDanger]}>
            {errors.email ?? " "}
          </Text>

          <TextInput
            placeholder="Senha"
            placeholderTextColor={PLACEHOLDER}
            secureTextEntry
            value={senha}
            onChangeText={(v)=>{ setSenha(v); if (errors.senha) setErrors(p=>({ ...p, senha: undefined })); }}
            style={[styles.input, errors.senha && styles.inputError]}
            editable={!submitting}
          />
          <Text style={[styles.helperText, errors.senha && styles.helperDanger]}>
            {errors.senha ?? " "}
          </Text>

          <TextInput
            placeholder="Telefone"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="phone-pad"
            value={telefone}
            onChangeText={(v)=>{ setTelefone(v); if (errors.telefone) setErrors(p=>({ ...p, telefone: undefined })); }}
            style={[styles.input, errors.telefone && styles.inputError]}
            editable={!submitting}
          />
          <Text style={[styles.helperText, errors.telefone && styles.helperDanger]}>
            {errors.telefone ?? " "}
          </Text>

          <View style={styles.pickerRow}>
            <Picker
              selectedValue={tipo}
              onValueChange={(v) => setTipo(v)}
              dropdownIconColor={TEXT}
              style={styles.picker}
              enabled={!submitting}
            >
              <Picker.Item label="Profissional" value="PROFISSIONAL" />
              <Picker.Item label="Consultor" value="CONSULTOR" />
            </Picker>
          </View>

          <TextInput
            placeholder="Bio (opcional)"
            placeholderTextColor={PLACEHOLDER}
            value={bio}
            onChangeText={setBio}
            style={[styles.input, styles.inputMultiline]}
            multiline
            numberOfLines={3}
            editable={!submitting}
          />

          {/* ===== Tags fixas ===== */}
          <View style={styles.tagsCard}>
            <Text style={styles.subHead}>Áreas de interesse</Text>

            <View style={styles.chipsWrap}>
              {FIXED_TAGS.map((tag) => {
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
                    <Text style={active ? styles.chipTextActive : styles.chipTextIdle}>
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Botão principal */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onSubmit}
            style={styles.button}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Cadastrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/(tabs)/fixed/login")} style={{ marginTop: 6 }}>
            <Text style={{ color: SUBTEXT, fontSize: 13 }}>Já tem conta? Entrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  // Densidade reduzida para "caber" em telas comuns sem rolagem longa
  scroll: { flexGrow: 1, justifyContent: "center", paddingVertical: 12 },
  container: { alignItems: "center", gap: 4, paddingHorizontal: 16 },

  headerTitle: { color: TEXT, fontSize: 20, fontWeight: "800", marginBottom: 2 },

  // Avatar menor e flat
  avatarZone: { alignItems: "center", gap: 4, marginBottom: 6 },
  avatarBox: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
    borderWidth: 2,
    borderColor: PURPLE_SOFT,
  },
  avatarDashed: { borderStyle: "dashed" },
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  avatarText: { color: PURPLE_SOFT, fontSize: 12, fontWeight: "700" },
  avatarHint: { color: PURPLE_SOFT, fontSize: 11 },

  // Títulos de seção compactos
  sectionHead: {
    width: "92%",
    color: TEXT,
    fontSize: 13.5,
    fontWeight: "800",
    marginTop: 4,
    marginBottom: 2,
  },

  // Inputs compactos (cabem melhor)
  input: {
    width: "92%",
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: INPUT,
    color: TEXT,
    fontSize: 15,
  },
  inputError: {
    borderColor: DANGER,
  },
  helperText: {
    width: "92%",
    fontSize: 11,
    color: "transparent", // reserva espaço
    marginTop: 2,
    marginBottom: 2,
  },
  helperDanger: {
    color: DANGER,
  },

  inputMultiline: { height: 80, textAlignVertical: "top", paddingTop: 10 },

  // Picker com altura reduzida
  pickerRow: {
    width: "92%",
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: INPUT,
    justifyContent: "center",
  },
  picker: { width: "100%", height: 50, color: TEXT },

  // Tags compactas
  tagsCard: {
    width: "92%",
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#20212A",
    gap: 8,
  },
  subHead: { color: TEXT, fontSize: 13, fontWeight: "800" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  chipBase: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipIdle: {
    backgroundColor: "#12131A",
    borderWidth: 1,
    borderColor: "#262833",
  },
  chipActive: {
    backgroundColor: PURPLE,
    borderWidth: 1,
    borderColor: PURPLE_DIM,
    shadowColor: PURPLE,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  chipTextIdle: { color: SUBTEXT, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: "#fff", fontSize: 13, fontWeight: "800" },
  chipPressed: { transform: [{ scale: 0.98 }] },

  // Botão principal enxuto
  button: {
    width: "92%",
    height: 48,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    shadowColor: PURPLE,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  buttonText: { color: "#fff", fontSize: 15.5, fontWeight: "800", letterSpacing: 0.3 },
});
