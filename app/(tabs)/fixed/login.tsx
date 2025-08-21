import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getPerfilByEmail, loginUser, saveLoginEmail } from "../gateway/api";

// Paleta vibrante
const PURPLE = "#9333EA";      // roxo vivo principal
const PURPLE_DARK = "#7E22CE"; // roxo escuro
const BG = "#0C0C12";
const CARD = "#17171E";
const CARD_SOFT = "#1C1C24";
const MUTED = "#9FA3B2";
const INPUT = "#23232B";
const BORDER = "#30303A";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    try {
      setLoading(true);
      const emailNorm = email.trim().toLowerCase();
      await loginUser({ email: emailNorm, password: senha.trim() });
      await saveLoginEmail(emailNorm);
      await getPerfilByEmail(emailNorm);
      router.replace("/(tabs)/fixed/dashboard");
    } catch (e: any) {
      Alert.alert("Falha no login", e?.friendly || e?.message || "Tente novamente");
    } finally {
      setLoading(false);
    }
  }

  function exitApp() {
    if (Platform.OS === "android") BackHandler.exitApp();
    else Alert.alert("Sair", "Fechar o app no iOS não é permitido.");
  }

  const canLogin = !!email && !!senha && !loading;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: BG }]}>
      {/* Fechar */}
      <TouchableOpacity
        style={styles.topBar}
        onPress={exitApp}
        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
      >
        <Feather name="x" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Wrapper centralizado */}
      <View style={styles.centerWrap}>
        {/* Logo em quadrado arredondado */}
        <View style={styles.logoBadge}>
          <Image
            source={{
              uri: "https://ars-vnh.b-cdn.net/imgs-app/Logotipo%20Geom%C3%A9trico%20Minimalista%20Abstracto.png",
            }}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Email */}
          <View style={styles.inputRow}>
            <Feather name="mail" size={18} color={MUTED} style={styles.inputIcon} />
            <TextInput
              placeholder="Email address"
              placeholderTextColor={MUTED}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              selectionColor={PURPLE_DARK}
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
          </View>

          {/* Senha */}
          <View style={styles.inputRow}>
            <Feather name="lock" size={18} color={MUTED} style={styles.inputIcon} />
            <TextInput
              placeholder="Password"
              placeholderTextColor={MUTED}
              secureTextEntry={!showPass}
              autoComplete="password"
              selectionColor={PURPLE_DARK}
              value={senha}
              onChangeText={setSenha}
              style={styles.input}
            />
            <TouchableOpacity onPress={() => setShowPass((v) => !v)} style={styles.eyeBtn}>
              <Feather name={showPass ? "eye-off" : "eye"} size={18} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* Login (filled) */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onSubmit}
            disabled={!canLogin}
            style={[styles.primaryBtn, { opacity: canLogin ? 1 : 0.6 }]}
          >
            <Text style={styles.primaryText}>{loading ? "Entrando..." : "LOGIN"}</Text>
          </TouchableOpacity>

          {/* Register (outline) */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push("/(tabs)/fixed/RegisterScreen")}
            style={styles.outlineBtn}
          >
            <Text style={styles.outlineText}>REGISTER</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 18,
  },

  topBar: {
    position: "absolute",
    top: 14,
    right: 16,
    zIndex: 10,
  },

  // Quadrado arredondado
  logoBadge: {
    width: 120,
    height: 120,
    borderRadius: 28, // quadrado arredondado, não círculo
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: PURPLE,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 18, // arredondado mas mantendo proporção quadrada
  },

  card: {
    width: "92%",
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  inputRow: {
    height: 50,
    borderRadius: 12,
    backgroundColor: INPUT,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
  },
  inputIcon: { marginLeft: 12, marginRight: 8 },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    paddingRight: 44,
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  primaryBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PURPLE,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  outlineBtn: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1.4,
    borderColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD_SOFT,
  },
  outlineText: {
    color: PURPLE,
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});
