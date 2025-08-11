import { useState } from "react";
import {
  View, TextInput, Alert, StyleSheet, TouchableOpacity, Text, Image, BackHandler, Platform,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { loginUser, getPerfilByEmail } from "../gateway/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    try {
      setLoading(true);
      const { token } = await loginUser({ email: email.trim(), password: senha.trim() });
      console.log("🔑 token:", token);

      // ⚡ Após logar, já puxa o perfil e popula o cache
      const perfil = await getPerfilByEmail(email.trim());
      console.log("👤 Perfil carregado:", perfil?.nome);

      router.replace("/(tabs)/fixed/dashboard");
    } catch (e: any) {
      Alert.alert("Falha no login", e?.message ?? "Tente novamente");
    } finally {
      setLoading(false);
    }
  }

  function exitApp() {
    if (Platform.OS === "android") BackHandler.exitApp();
    else Alert.alert("Sair", "Fechar o app no iOS não é permitido.");
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <TouchableOpacity style={styles.topBar} onPress={exitApp}>
        <Feather name="x" size={28} color="#fff" />
      </TouchableOpacity>

      <Image source={require("../../../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />

      <TextInput
        placeholder="Email" placeholderTextColor="#777" autoCapitalize="none" autoComplete="email"
        keyboardType="email-address" selectionColor="#ff0050"
        value={email} onChangeText={setEmail}
        style={[styles.input, { backgroundColor: "#fff", borderColor: "#ccc", color: "#000" }]}
      />

      <TextInput
        placeholder="Senha" placeholderTextColor="#777" secureTextEntry autoComplete="password"
        selectionColor="#ff0050"
        value={senha} onChangeText={setSenha}
        style={[styles.input, { backgroundColor: "#fff", borderColor: "#ccc", color: "#000" }]}
      />

      <TouchableOpacity activeOpacity={0.85} onPress={onSubmit} disabled={loading} style={styles.buttonWrapper}>
        <LinearGradient colors={["#ff0050", "#00f2ea"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          <Text style={styles.buttonText}>{loading ? "Entrando..." : "Entrar"}</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push("/(tabs)/fixed/RegisterScreen")}
        style={styles.buttonWrapper}
      >
        <LinearGradient colors={["#00f2ea", "#ff0050"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          <Text style={styles.buttonText}>Cadastrar</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, gap: 14 },
  topBar: { position: "absolute", top: 40, right: 20, padding: 8 },
  logo: { width: 120, height: 120, marginBottom: 20 },
  input: { width: "80%", height: 48, borderRadius: 28, paddingHorizontal: 16, borderWidth: 1, fontSize: 16 },
  buttonWrapper: { width: "80%", height: 48, borderRadius: 28, overflow: "hidden" },
  button: { flex: 1, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
