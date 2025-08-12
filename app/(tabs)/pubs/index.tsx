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
  NativeScrollEvent,
  NativeSyntheticEvent,
  InteractionManager,
  LayoutChangeEvent,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";

import { fetchFeedReady, VideoDTO } from "../gateway/api";
import SafeVideo from "../gateway/SafeVideo";

const { height: WIN_H, width } = Dimensions.get("window");
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

  // altura dinâmica do container
  const [containerH, setContainerH] = useState(WIN_H);
  const containerHRef = useRef(WIN_H);

  const isFocused = useIsFocused();
  const listRef = useRef<FlatList<VideoDTO>>(null);
  const indexRef = useRef(0);

  const log = (msg: string, extra?: any) => {
    console.log(`🛸[Pubs] ${msg}`, extra ?? "");
  };

  const loadFirstPage = useCallback(async () => {
    setInitialLoading(true);
    setFeedError(null);
    try {
      const data = await fetchFeedReady(PAGE_SIZE, { preflight: false });
      setItems(data);
      indexRef.current = 0;
      setViewIndex(0);
      if (data[0]) onActive?.(data[0]);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch (e: any) {
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

  const onLayoutContainer = useCallback((e: LayoutChangeEvent) => {
    const H = Math.max(1, Math.round(e.nativeEvent.layout.height));
    if (H && H !== containerHRef.current) {
      containerHRef.current = H;
      setContainerH(H);
      log(`layout -> containerH=${H}`);
    }
  }, []);

  const scrollToIdx = useCallback(
    (idx: number, animated = true) => {
      if (!listRef.current) return;
      const clamped = Math.max(0, Math.min(idx, Math.max(0, items.length - 1)));
      log(`scrollToIndex -> idx=${clamped}`);
      try {
        listRef.current.scrollToIndex({
          index: clamped,
          animated,
          viewPosition: 0,
          viewOffset: 0,
        });
      } catch {
        const H = containerHRef.current || containerH || WIN_H;
        listRef.current.scrollToOffset({ offset: clamped * H, animated });
      }
    },
    [items, containerH]
  );

  useImperativeHandle(
    ref,
    () => ({
      decide: (decision: Decision) => {
        const current = items[indexRef.current];
        if (current) onDecision?.(current, decision);

        const next = indexRef.current + 1;
        InteractionManager.runAfterInteractions(() => {
          if (next < items.length) {
            indexRef.current = next;
            setViewIndex(next);
            scrollToIdx(next, true);
            const nextPub = items[next];
            if (nextPub) onActive?.(nextPub);
          } else {
            // fim da lista — mantém comportamento e tenta carregar mais se existir
            scrollToIdx(next, true);
            loadMore();
          }
        });
      },
    }),
    [items, onDecision, onActive, scrollToIdx, loadMore]
  );

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const H = containerHRef.current || containerH || WIN_H;
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.round(y / H);
      if (idx !== indexRef.current) {
        indexRef.current = idx;
        setViewIndex(idx);
        const pub = items[idx];
        if (pub) onActive?.(pub);
      }
    },
    [items, onActive, containerH]
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (!viewableItems.length) return;
      const idx = viewableItems[0].index ?? 0;
      indexRef.current = idx;
      setViewIndex(idx);
      const pub = items[idx];
      if (pub) onActive?.(pub);
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const renderItem = ({ item, index }: { item: VideoDTO; index: number }) => {
    const isActive = index === viewIndex;
    const uri = item?.hlsMasterUrl || null;
    return (
      <View style={[s.item, { height: containerH }]}>
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
      <View style={[s.screen, s.center]} onLayout={onLayoutContainer}>
        <ActivityIndicator size="large" color="#00f2ea" />
      </View>
    );
  }

  return (
    <View style={s.screen} onLayout={onLayoutContainer}>
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
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        onMomentumScrollEnd={onMomentumEnd}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: containerH, offset: containerH * index, index })}
        windowSize={3}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        removeClippedSubviews={false}
        onScrollToIndexFailed={({ index }) => {
          const retry = Math.max(0, Math.min(index, items.length - 1));
          setTimeout(() => scrollToIdx(retry, true), 60);
        }}
        ListEmptyComponent={
          <View style={[s.item, s.center, { height: containerH }]}>
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
  item: { width, backgroundColor: "#000" }, // altura vem do container
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
