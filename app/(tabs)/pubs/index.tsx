// app/(tabs)/pubs.tsx
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  useMemo,
} from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Video, ResizeMode, Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { height, width } = Dimensions.get("window");

export type Pub = {
  id: string;
  videoUrl: string;
  caption?: string;
  user?: { name: string };
};

type Page = { items: Pub[]; nextCursor?: string | null };

export type Decision = "like" | "nope";

export type PubsScreenHandle = {
  decide: (decision: Decision) => void;
};

export type Props = {
  onDecision?: (pub: Pub, decision: Decision) => void;
  onActive?: (pub: Pub) => void;
};

// ===== STORAGE KEY =====
const KEY_USER_PUBS = "USER_PUBS";

// ===== MOCK API =====
async function fetchPubs(cursor?: string | null): Promise<Page> {
  await new Promise((r) => setTimeout(r, 500));
  const sources = [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  ];
  const base = Array.from({ length: 5 }).map((_, i) => {
    const n = Math.floor(Math.random() * 100000);
    return {
      id: `${cursor || "0"}-${i}-${n}`,
      videoUrl: sources[i % sources.length],
      caption: i % 2 === 0 ? "Big Buck Bunny" : "Elephants Dream",
      user: { name: i % 2 === 0 ? "Alice" : "Bob" },
    } as Pub;
  });
  return { items: base, nextCursor: cursor ? String(Number(cursor) + 1) : "1" };
}
// ====================

const PubsScreen = forwardRef<PubsScreenHandle, Props>(function PubsScreen(
  { onDecision, onActive },
  ref
) {
  const [userPubs, setUserPubs] = useState<Pub[]>([]);
  const [remote, setRemote] = useState<Pub[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);

  const isFocused = useIsFocused();
  const listRef = useRef<FlatList<Pub>>(null);

  const data = useMemo(() => [...userPubs, ...remote], [userPubs, remote]);

  // 🔊 Configura o áudio pro Android (duck/sem conflitar)
  useEffect(() => {
    (async () => {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    })();
  }, []);

  // -------- helpers --------
  const loadUserPubs = useCallback(async () => {
    const raw = await AsyncStorage.getItem(KEY_USER_PUBS);
    const arr = raw ? (JSON.parse(raw) as any[]) : [];
    const mapped: Pub[] = arr.map((m) => ({
      id: `local-${m.id}`,
      videoUrl: m.videoUrl,
      caption: m.caption,
      user: m.user ?? { name: "Você" },
    }));
    setUserPubs(mapped);
    return mapped;
  }, []);

  const loadFirstPage = useCallback(async () => {
    const [locals, page] = await Promise.all([loadUserPubs(), fetchPubs(null)]);
    setRemote(page.items);
    setCursor(page.nextCursor ?? null);
    const first = (locals[0] ?? page.items[0]) as Pub | undefined;
    if (first) onActive?.(first);
    setViewIndex(0);
    listRef.current?.scrollToIndex({ index: 0, animated: false });
  }, [loadUserPubs, onActive]);

  // recarrega ao focar (pegar vídeos recém publicados)
  useEffect(() => {
    if (isFocused) {
      loadFirstPage();
    }
  }, [isFocused, loadFirstPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPubs(cursor);
      setRemote((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length === 0) return;
      const idx = viewableItems[0].index ?? 0;
      setViewIndex(idx);
      const pub = data[idx];
      if (pub) onActive?.(pub);
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  useImperativeHandle(ref, () => ({
    decide: (decision: Decision) => {
      const current = data[viewIndex];
      if (!current) return;
      onDecision?.(current, decision);

      const next = Math.min(viewIndex + 1, data.length - 1);
      if (next !== viewIndex) {
        listRef.current?.scrollToIndex({ index: next, animated: true });
        setViewIndex(next);
        const nextPub = data[next];
        if (nextPub) onActive?.(nextPub);
      } else {
        loadMore();
      }
    },
  }));

  const renderItem = ({ item, index }: { item: Pub; index: number }) => {
    const isActive = index === viewIndex;
    return (
      <View style={s.item}>
        <Video
          style={s.video}
          source={{ uri: item.videoUrl }}
          resizeMode={ResizeMode.COVER}
          useNativeControls={false}
          shouldPlay={isFocused && isActive}
          isLooping
          // 🔊 som só no ativo
          isMuted={!isActive ? true : false}
          volume={isActive ? 1.0 : 0.0}
          onError={(e) => console.log("Erro no vídeo:", e)}
        />
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        removeClippedSubviews
        windowSize={3}
      />

      {loadingMore && (
        <View style={s.loadingMore}>
          <ActivityIndicator color="#00f2ea" />
        </View>
      )}
    </View>
  );
});

export default PubsScreen;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  item: { width, height, backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
  loadingMore: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
});
