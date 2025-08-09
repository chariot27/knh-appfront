// app/(tabs)/fixed/register.tsx
import React, { useState } from "react";
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
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

import { registerUser } from "../gateway/api";

// ✅ data URL de um PNG 1x1 transparente (bem pequeno)
// use isto como fallback para nunca enviar avatarUrl = null
const DEFAULT_AVATAR_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wwAAn8B9o3YfHkAAAAASUVORK5CYII=";

export default function RegisterScreen() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [tipo, setTipo] = useState<"PROFISSIONAL" | "CONSULTOR" | "EMPRESA">(
    "PROFISSIONAL"
  );
  const [bio, setBio] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";

    try {
      // 1) tenta usar o base64 que veio
      let dataUrl: string | null =
        asset.base64 ? `data:${mime};base64,${asset.base64}` : null;

      // 2) se não veio, gera base64 com o manipulator
      if (!dataUrl) {
        const manipulated = await manipulateAsync(
          asset.uri,
          [{ resize: { width: 640 } }],
          { compress: 0.7, format: SaveFormat.JPEG, base64: true }
        );
        if (manipulated.base64) {
          dataUrl = `data:image/jpeg;base64,${manipulated.base64}`;
        }
      }

      // 3) fallback final: ler arquivo em base64
      if (!dataUrl) {
        const raw = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        dataUrl = `data:${mime};base64,${raw}`;
      }

      if (!dataUrl) {
        Alert.alert("Erro", "Não foi possível obter a imagem selecionada.");
        return;
      }

      setAvatarBase64(dataUrl);
    } catch (err) {
      console.error("Erro ao processar imagem:", err);
      Alert.alert("Erro", "Falha ao processar a imagem.");
    }
  }

  function buildPayload() {
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    const onlyDigitsPhone = telefone.replace(/\D+/g, "");

    // evita 504 por payload gigante
    const MAX_DATAURL_CHARS = 270_000; // ~200KB
    const avatarOk =
      avatarBase64 && avatarBase64.length <= MAX_DATAURL_CHARS
        ? avatarBase64
        : undefined;

    if (avatarBase64 && !avatarOk) {
      console.warn(
        `⚠️ avatar muito grande: ${avatarBase64.length} chars — omitindo do payload`
      );
    }

    // ✅ garante que NUNCA seja null para o backend
    const avatarUrl = avatarOk ?? DEFAULT_AVATAR_DATAURL;

    return {
      nome,
      email,
      telefone: onlyDigitsPhone,
      senha,
      tipo, // "CONSULTOR" | "PROFISSIONAL" | "EMPRESA"
      bio: bio || undefined,
      tags: tags.length ? tags : undefined,
      avatarUrl, // sempre string válida
    };
  }

  async function onSubmit() {
    const payload = buildPayload();

    if (!payload.nome || !payload.email || !payload.senha || !payload.telefone) {
      Alert.alert("Campos obrigatórios", "Preencha nome, email, telefone e senha.");
      return;
    }

    // log sem base64 gigante
    const toLog = {
      ...payload,
      avatarUrl: payload.avatarUrl
        ? `<data-url: ${payload.avatarUrl.length} chars>`
        : undefined,
    };
    console.log("➡️ RegisterScreen enviando:", JSON.stringify(toLog, null, 2));

    setSubmitting(true);
    try {
      const resp = await registerUser(payload);
      console.log("✅ RegisterScreen resposta:", resp);

      // limpa o formulário antes de sair
      setNome("");
      setEmail("");
      setTelefone("");
      setSenha("");
      setTipo("PROFISSIONAL");
      setBio("");
      setTagsRaw("");
      setAvatarBase64(null);

      Alert.alert("Sucesso", "Cadastro realizado com sucesso!");
      router.replace("/(tabs)/fixed/login");
    } catch (e: any) {
      console.error("❌ RegisterScreen erro:", e);
      Alert.alert(
        "Erro ao cadastrar",
        e?.message || "Não foi possível concluir o cadastro."
      );
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
                uri:
                  avatarBase64 ||
                  // a UI pode mostrar esse ícone, mas o payload sempre manda DEFAULT_AVATAR_DATAURL
                  "https://cdn-icons-png.flaticon.com/512/847/847969.png",
              }}
              style={styles.avatar}
            />
            {!avatarBase64 && (
              <View style={styles.plusOverlay}>
                <Text style={styles.plusText}>+</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput placeholder="Nome" placeholderTextColor="#777" value={nome} onChangeText={setNome} style={styles.input} editable={!submitting} />
          <TextInput placeholder="Email" placeholderTextColor="#777" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} editable={!submitting} />
          <TextInput placeholder="Telefone" placeholderTextColor="#777" keyboardType="phone-pad" value={telefone} onChangeText={setTelefone} style={styles.input} editable={!submitting} />
          <TextInput placeholder="Senha" placeholderTextColor="#777" secureTextEntry value={senha} onChangeText={setSenha} style={styles.input} editable={!submitting} />

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
              <Picker.Item label="Empresa" value="EMPRESA" />
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
          <TextInput
            placeholder="Tags (separe por vírgula)"
            placeholderTextColor="#777"
            value={tagsRaw}
            onChangeText={setTagsRaw}
            style={styles.input}
            editable {!submitting}
          />

          <TouchableOpacity activeOpacity={0.85} onPress={onSubmit} style={styles.buttonWrapper} disabled={submitting}>
            <LinearGradient colors={["#00f2ea", "#ff0050"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cadastrar</Text>}
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
    width: "90%",
    height: 50,
    borderRadius: 28,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    color: "#000",
    fontSize: 16,
  },
  inputMultiline: { height: 100, textAlignVertical: "top" },
  pickerWrapper: {
    width: "90%",
    height: 50,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    overflow: "hidden",
    justifyContent: "center",
  },
  picker: { width: "100%", height: 50, color: "#000" },
  buttonWrapper: {
    width: "90%",
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
