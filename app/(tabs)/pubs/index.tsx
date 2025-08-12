import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Text,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";

import { fetchFeedReady, VideoDTO } from "../gateway/api";
import SafeVideo from "../gateway/SafeVideo";

const { height, width } = Dimensions.get("window");
const PAGE_SIZE = 12 as const;

export type Decision = "like" | "nope";
export type PubsScreenHandle = { decide: (decision: Decision) => void };

export type Props = {
  onDecision?: (pub: VideoDTO, decision: Decision) => void;
  onActive?: (pub: VideoDTO) => void;
};

const PubsScreen = forwardRef<PubsScreenHandle, Props>(function PubsScreen(
  { onDecision, onActive },
  ref
) {
  const [items, setItems] = useState<VideoDTO[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewIndex, setViewIndex] = useState(0);
  const [feedError, setFeedError] = useState<string | null>(null);

  const isFocused = useIsFocused();
  const listRef = useRef<FlatList<VideoDTO>>(null);

  const loadFirstPage = useCallback(async () => {
    setInitialLoading(true);
    setFeedError(null);
    try {
      // evita GET extra com Range nas URLs HLS (menos ruído de log)
      const data = await fetchFeedReady(PAGE_SIZE, { preflight: false });
      console.log("[FEED] itens recebidos:", data.length);
      setItems(data);
      if (data[0]) onActive?.(data[0]);
      setViewIndex(0);
      listRef.current?.scrollToIndex({ index: 0, animated: false });

      if (!data?.length) setFeedError("Nenhum vídeo pronto ainda. Volte em instantes.");
    } catch (e: any) {
      console.log("[FEED] erro carregando:", e);
      setItems([]);
      setFeedError(typeof e?.message === "string" ? e.message : "Falha ao carregar o feed.");
    } finally {
      setInitialLoading(false);
    }
  }, [onActive]);

  useEffect(() => {
    if (isFocused) loadFirstPage().catch(() => {});
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
    if (loadingMore) return;
    // Quando o backend suportar paginação, adicionar aqui
  }, [loadingMore]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length === 0) return;
      const idx = viewableItems[0].index ?? 0;
      setViewIndex(idx);
      const pub = items[idx];
      if (pub) onActive?.(pub);
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  useImperativeHandle(ref, () => ({
    decide: (decision: Decision) => {
      const current = items[viewIndex];
      if (!current) return;
      onDecision?.(current, decision);

      const next = Math.min(viewIndex + 1, items.length - 1);
      if (next !== viewIndex) {
        listRef.current?.scrollToIndex({ index: next, animated: true });
        setViewIndex(next);
        const nextPub = items[next];
        if (nextPub) onActive?.(nextPub);
      } else {
        loadMore();
      }
    },
  }));

  const renderItem = ({ item, index }: { item: VideoDTO; index: number }) => {
    const isActive = index === viewIndex;
    const uri = item?.hlsMasterUrl || null;

    return (
      <View style={s.item}>
        <SafeVideo
          uri={uri}
          autoPlay={isFocused && isActive}
          fallbackMp4="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
        />
      </View>
    );
  };

  if (initialLoading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color="#00f2ea" />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {!!feedError && (
        <View style={s.banner}>
          <Text style={s.bannerTxt}>{feedError}</Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        windowSize={3}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        ListEmptyComponent={
          <View style={[s.item, s.center]}>
            <Text style={{ color: "#aaa" }}>Nenhum vídeo para exibir.</Text>
          </View>
        }
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
  center: { alignItems: "center", justifyContent: "center" },
  banner: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    zIndex: 10,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  bannerTxt: { color: "#fff", textAlign: "center" },
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
