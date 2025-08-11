import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { Video, ResizeMode, Audio } from "expo-av";

// ⛓️ Helpers da API — caminho relativo a partir de app/(tabs)/video/
// se seu projeto usa alias "@/lib/api", pode trocar.
import { uploadVideo } from "../gateway/api";

export default function AddVideoScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [picking, setPicking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  // permissões + áudio
  useEffect(() => {
    (async () => {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setHasPermission(lib.status === "granted");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    })();
  }, []);

  const pickVideo = useCallback(async () => {
    if (hasPermission === false) {
      Alert.alert("Permissão necessária", "Autorize o acesso à galeria para escolher vídeos.");
      return;
    }
    try {
      setPicking(true);
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        setUri(res.assets[0].uri);
      }
    } catch {
      Alert.alert("Erro", "Não foi possível selecionar o vídeo.");
    } finally {
      setPicking(false);
    }
  }, [hasPermission]);

  const clearSelection = useCallback(() => {
    setUri(null);
    setCaption("");
  }, []);

  const publish = useCallback(async () => {
    if (!uri) return;
    try {
      setPublishing(true);
      await uploadVideo({
        descricao: caption?.trim() || "Vídeo",
        file: { uri, name: "upload.mp4", type: "video/mp4" },
      });
      clearSelection();
      Alert.alert(
        "Publicado!",
        "Seu vídeo foi enviado. Ele aparecerá no feed assim que o processamento HLS terminar."
      );
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível publicar o vídeo.");
    } finally {
      setPublishing(false);
    }
  }, [uri, caption, clearSelection]);

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <Text style={s.title}>Adicionar vídeo</Text>
        {uri && (
          <TouchableOpacity
            onPress={clearSelection}
            style={s.clearBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={20} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {/* Seleção / preview local */}
      {!uri ? (
        <TouchableOpacity
          style={s.pickBox}
          onPress={pickVideo}
          activeOpacity={0.85}
          disabled={picking}
        >
          {picking ? (
            <ActivityIndicator color="#7B61FF" />
          ) : (
            <>
              <Feather name="video" size={28} color="#cfcfcf" />
              <Text style={s.pickText}>Toque para escolher um vídeo</Text>
              <Text style={s.pickHint}>MP4 / MOV • até alguns minutos</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={s.previewWrap}>
          <Video
            style={s.preview}
            source={{ uri }}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            isLooping
            isMuted={false}
            volume={1.0}
            onError={(e) => console.log("Erro no preview:", e)}
          />
        </View>
      )}

      {/* Legenda = descricao */}
      <View style={s.captionWrap}>
        <Text style={s.label}>Legenda (opcional)</Text>
        <TextInput
          style={s.input}
          placeholder="Algo sobre o seu pub..."
          placeholderTextColor="#777"
          value={caption}
          onChangeText={setCaption}
          maxLength={120}
        />
      </View>

      {/* Ações */}
      <View style={s.actions}>
        <TouchableOpacity
          style={[s.btn, s.btnPrimary, !uri && s.btnDisabled]}
          onPress={publish}
          disabled={!uri || publishing}
          activeOpacity={0.9}
        >
          {publishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="upload-cloud" size={18} color="#fff" />
              <Text style={s.btnPrimaryText}>Publicar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={s.footerHint}>
        <Feather name="info" size={14} color="#777" />
        <Text style={s.footerText}>
          Os vídeos publicados aparecem no feed da aba Pubs quando o HLS estiver pronto.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000", paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    marginBottom: 12,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", flex: 1 },
  clearBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  pickBox: {
    borderWidth: 1,
    borderColor: "#171717",
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0c0c0c",
    gap: 8,
  },
  pickText: { color: "#e9e9e9", fontSize: 14, fontWeight: "700" },
  pickHint: { color: "#9a9a9a", fontSize: 12 },

  previewWrap: {
    borderWidth: 1,
    borderColor: "#171717",
    borderRadius: 16,
    backgroundColor: "#0c0c0c",
    overflow: "hidden",
  },
  preview: { width: "100%", height: 260, backgroundColor: "#000" },

  captionWrap: { marginTop: 16, gap: 6 },
  label: { color: "#bdbdbd", fontSize: 12, fontWeight: "700" },
  input: {
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: "#171717",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 14,
  },

  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnPrimary: { backgroundColor: "#7B61FF", borderWidth: 1, borderColor: "#7B61FF" },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  btnDisabled: { opacity: 0.4 },

  footerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  footerText: { color: "#777", fontSize: 12, flex: 1 },
});
