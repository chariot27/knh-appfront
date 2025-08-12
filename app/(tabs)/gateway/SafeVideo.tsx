// app/gateway/SafeVideo.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { VideoView, useVideoPlayer, type VideoPlayer } from "expo-video";

type Props = {
  uri?: string | null;
  autoPlay?: boolean;
  /** MP4 de teste – se tocar e o HLS não, problema é a playlist/CDN */
  fallbackMp4?: string;
};

async function preflight(url: string, ms = 7000): Promise<void> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      signal: ctrl.signal as any,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(id);
  }
}

export default function SafeVideo({ uri, autoPlay = true, fallbackMp4 }: Props) {
  const [loading, setLoading] = useState<boolean>(!!uri);
  const [err, setErr] = useState<string | null>(null);

  const isHls = !!uri && uri.toLowerCase().includes(".m3u8");
  const sourceUri = useMemo(() => uri ?? null, [uri]);

  const player: VideoPlayer = useVideoPlayer(sourceUri, (p) => {
    p.loop = true;
    p.muted = !autoPlay;
    p.volume = autoPlay ? 1.0 : 0.0;
  });

  // Preflight (pega 403/503 antes do player tentar)
  useEffect(() => {
    let mounted = true;
    setErr(null);
    setLoading(!!uri);
    (async () => {
      try {
        if (!uri) return;
        await preflight(uri, 7000);
        if (!mounted) return;
        setLoading(false);
        if (autoPlay) player.play();
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErr(`Acesso ao vídeo bloqueado: ${msg}`);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      player.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, autoPlay]);

  // Observa eventos do player (tipados)
  useEffect(() => {
    const offStatus = player.addListener("statusChange", (status: any) => {
      if (status?.isLoaded && loading) setLoading(false);
      if (!status?.isLoaded && status?.error) {
        const m = String(status.error);
        console.warn("[expo-video:status error]", m);
        setErr(m);
        setLoading(false);
      }
    });
    // Alguns builds expõem "renderedFirstFrame"; use cast pra não brigar com TS se não existir
    const offFirstFrame = (player as any).addListener?.("renderedFirstFrame", () => {
      if (loading) setLoading(false);
    });
    return () => {
      offStatus.remove();
      offFirstFrame?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, loading]);

  // Atualiza play/pause quando a tela/índice muda
  useEffect(() => {
    if (autoPlay && !err) player.play();
    else player.pause();
  }, [autoPlay, err, player]);

  if (!uri) {
    return (
      <View style={s.box}>
        <Text style={s.msg}>Sem URL de vídeo.</Text>
      </View>
    );
  }

  return (
    <View style={s.box}>
      {loading && !err && <ActivityIndicator />}
      {err && (
        <View style={s.errBox}>
          <Text style={s.errTitle}>Falha ao carregar</Text>
          <Text style={s.errText}>{err}</Text>
          {fallbackMp4 ? <Text style={s.errText}>Teste fallback: {fallbackMp4}</Text> : null}
        </View>
      )}

      {/* key=uri força remontagem ao trocar de vídeo */}
      <VideoView
        key={uri}
        style={s.video}
        player={player}
        contentFit="cover"
        allowsFullscreen
        allowsPictureInPicture
        // Força HLS no Android quando a URL não termina com .m3u8
        {...(Platform.OS === "android" && !isHls
          ? ({ overrideFileExtensionAndroid: "m3u8" } as any)
          : {})}
      />
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: "100%", aspectRatio: 9 / 16, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  video: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  msg: { color: "#fff" },
  errBox: { padding: 12, alignItems: "center" },
  errTitle: { color: "#fff", fontWeight: "700", marginBottom: 6 },
  errText: { color: "#fff", opacity: 0.8, textAlign: "center" },
});
