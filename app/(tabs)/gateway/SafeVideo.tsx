import React, { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { VideoView, useVideoPlayer, type VideoSource } from "expo-video";

type Props = {
  uri: string | null;
  autoPlay?: boolean;
  fallbackMp4?: string;
  /** opcional, só pra identificar nos logs */
  tag?: string;
};

export default function SafeVideo({ uri, autoPlay = false, fallbackMp4, tag = "SafeVideo" }: Props) {
  const idRef = useRef(Math.random().toString(36).slice(2, 8));
  const id = idRef.current;
  const log = (...args: any[]) => console.log(`[${tag}#${id}]`, ...args);

  // Decide a fonte: HLS assinado > fallback MP4
  const source = useMemo<VideoSource | undefined>(() => {
    const u = uri || fallbackMp4 || null;
    const src = u ? { uri: u } : undefined;
    log("source ->", src?.uri ?? null);
    return src;
  }, [uri, fallbackMp4]);

  // Tipagem do hook requer VideoSource; usamos cast e trocamos assim que existir
  const player = useVideoPlayer(source as unknown as VideoSource, (p) => {
    p.loop = true;
  });

  // Log de montagem/desmontagem
  useEffect(() => {
    log("mounted on", Platform.OS);
    return () => {
      log("unmounted");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Troca de source quando mudar o HLS/fallback
  useEffect(() => {
    if (!player) return;
    try {
      if (source) {
        player.replace(source as VideoSource);
      } else {
        log("player.pause() — no source");
        player.pause();
      }
    } catch (e) {
      log("replace/pause error:", e);
    }
  }, [source, player]);

  // Sincroniza autoplay com visibilidade/foco do item
  useEffect(() => {
    if (!player) return;
    const idRAF = requestAnimationFrame(() => {
      try {
        if (autoPlay && source) {
          log("autoplay -> play()");
          player.play();
        } else {
          log("autoplay -> pause()");
          player.pause();
        }
      } catch (e) {
        log("autoplay play/pause error:", e);
      }
    });
    return () => cancelAnimationFrame(idRAF);
  }, [autoPlay, player, source]);

  // Listeners (quando disponíveis)
  useEffect(() => {
    const subs: any[] = [];
    const anyPlayer: any = player as any;

    const add = (evt: string) => {
      if (anyPlayer?.addListener) {
        const sub = anyPlayer.addListener(evt, (payload: any) => {
          log(`event:${evt}`, payload);
        });
        subs.push(sub);
      }
    };

    add("statusChange");
    add("playbackStateChange");
    add("sourceChange");
    add("timeUpdate");
    add("durationChange");
    add("bufferingChange");
    add("error");

    return () => {
      subs.forEach((s: any) => s?.remove?.());
    };
  }, [player]);

  return (
    <View style={styles.container}>
      {source ? (
        <VideoView
          style={styles.video}
          player={player}
          contentFit="cover"
          allowsFullscreen
          allowsPictureInPicture
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
});
