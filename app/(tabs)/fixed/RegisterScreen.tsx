import { useState } from "react";
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
  Image
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";

export default function RegisterScreen() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [tipo, setTipo] = useState<"PROFISSIONAL" | "CONSULTOR" | "EMPRESA">("PROFISSIONAL");
  const [bio, setBio] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  async function escolherImagem() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "É necessário permitir acesso à galeria.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setAvatarBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  }

  function previewPayload() {
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    const payload = {
      nome,
      email,
      telefone,
      senha,
      tipo,
      bio: bio || undefined,
      tags: tags.length ? tags : undefined,
      avatarUrl: avatarBase64 || undefined,
    };
    Alert.alert("Prévia do cadastro", JSON.stringify(payload, null, 2));
  }

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", android: undefined })} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Text style={styles.title}>Criar conta</Text>

          {/* Foto de perfil redonda com "+" no centro se não houver imagem */}
          <TouchableOpacity onPress={escolherImagem} style={styles.avatarWrapper}>
            <Image
              source={{
                uri: avatarBase64 || "https://cdn-icons-png.flaticon.com/512/847/847969.png",
              }}
              style={styles.avatar}
            />
            {!avatarBase64 && (
              <View style={styles.plusOverlay}>
                <Text style={styles.plusText}>+</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput placeholder="Nome" placeholderTextColor="#777" value={nome} onChangeText={setNome} style={styles.input} />
          <TextInput placeholder="Email" placeholderTextColor="#777" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
          <TextInput placeholder="Telefone" placeholderTextColor="#777" keyboardType="phone-pad" value={telefone} onChangeText={setTelefone} style={styles.input} />
          <TextInput placeholder="Senha" placeholderTextColor="#777" secureTextEntry value={senha} onChangeText={setSenha} style={styles.input} />

          <View style={styles.pickerWrapper}>
            <Picker selectedValue={tipo} onValueChange={(v) => setTipo(v)} dropdownIconColor="#000" style={styles.picker}>
              <Picker.Item label="Profissional" value="PROFISSIONAL" />
              <Picker.Item label="Consultor" value="CONSULTOR" />
              <Picker.Item label="Empresa" value="EMPRESA" />
            </Picker>
          </View>

          <TextInput placeholder="Bio (opcional)" placeholderTextColor="#777" value={bio} onChangeText={setBio} style={[styles.input, styles.inputMultiline]} multiline numberOfLines={4} />
          <TextInput placeholder="Tags (separe por vírgula)" placeholderTextColor="#777" value={tagsRaw} onChangeText={setTagsRaw} style={styles.input} />

          <TouchableOpacity activeOpacity={0.85} onPress={previewPayload} style={styles.buttonWrapper}>
            <LinearGradient colors={["#00f2ea", "#ff0050"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
              <Text style={styles.buttonText}>Cadastrar</Text>
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
  avatarWrapper: {
    position: "relative",
    width: 120,
    height: 120,
    marginBottom: 16,
  },
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
  plusText: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "700",
  },
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
  buttonWrapper: { width: "90%", height: 50, borderRadius: 28, overflow: "hidden", marginTop: 10 },
  button: { flex: 1, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
