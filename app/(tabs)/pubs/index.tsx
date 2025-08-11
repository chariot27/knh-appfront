// app/(tabs)/pubs.tsx
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
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Video, ResizeMode, Audio } from "expo-av";

// ⛓️ API
import { fetchFeedReady, VideoDTO } from "../gateway/api"; // <- ajuste o path

const { height, width } = Dimensions.get("window");

export type Decision = "like" | "nope";

export type PubsScreenHandle = {
  decide: (decision: Decision) => void;
};

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
  const [loadingMore, setLoadingMore] = useState(false); // reservado se paginar depois
  const [viewIndex, setViewIndex] = useState(0);

  const isFocused = useIsFocused();
  const listRef = useRef<FlatList<VideoDTO>>(null);

  // 🔊 áudio Android
  useEffect(() => {
    (async () => {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    })();
  }, []);

  const loadFirstPage = useCallback(async () => {
    const data = await fetchFeedReady(); // já filtra READY + cache leve
    setItems(data);
    if (data[0]) onActive?.(data[0]);
    setViewIndex(0);
    listRef.current?.scrollToIndex({ index: 0, animated: false });
  }, [onActive]);

  // recarrega ao focar
  useEffect(() => {
    if (isFocused) {
      loadFirstPage().catch(() => {});
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

  // placeholder se/quando houver backend paginado
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    // se seu backend tiver paginação, plugue aqui
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
    // só renderiza se tiver HLS
    const uri = item.hlsMasterUrl || "";
    return (
      <View style={s.item}>
        <Video
          style={s.video}
          source={{ uri }}
          resizeMode={ResizeMode.COVER}
          useNativeControls={false}
          shouldPlay={isFocused && isActive}
          isLooping
          isMuted={!isActive}
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
        data={items}
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
