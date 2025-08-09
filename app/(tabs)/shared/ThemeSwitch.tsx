import React, { useEffect, useRef } from "react";
import { Pressable, View, StyleSheet, Animated, Easing, Image, ImageSourcePropType } from "react-native";
// Feather continua como fallback
import { Feather } from "@expo/vector-icons";

type Props = {
  value: boolean;                 // true = dark
  onChange: (v: boolean) => void;
  size?: number;                  // altura (default 36)
  sunIcon?: ImageSourcePropType;  // caminho da imagem do sol
  moonIcon?: ImageSourcePropType; // caminho da imagem da lua
};

export default function ThemeSwitch({
  value,
  onChange,
  size = 36,
  sunIcon,
  moonIcon,
}: Props) {
  const trackH = size;
  const trackW = Math.round(size * 2);
  const pad = 3;
  const knob = trackH - pad * 2;
  const travel = trackW - pad * 2 - knob;

  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [value]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  });

  const trackBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#eee", "#111"],
  });

  const iconSunOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const iconMoonOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const iconSize = Math.round(size * 0.45);

  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[styles.wrapper, { width: trackW, height: trackH, borderRadius: trackH / 2 }]}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackBg }]} />

      {/* Ícone/Imagem Sol (modo claro) */}
      <Animated.View style={[styles.iconLeft, { opacity: iconSunOpacity }]}>
        {sunIcon ? (
          <Image source={sunIcon} style={{ width: iconSize, height: iconSize, tintColor: "#111" }} />
        ) : (
          <Feather name="sun" size={iconSize} color="#111" />
        )}
      </Animated.View>

      {/* Ícone/Imagem Lua (modo escuro) */}
      <Animated.View style={[styles.iconRight, { opacity: iconMoonOpacity }]}>
        {moonIcon ? (
          <Image source={moonIcon} style={{ width: iconSize, height: iconSize, tintColor: "#fff" }} />
        ) : (
          <Feather name="moon" size={iconSize} color="#fff" />
        )}
      </Animated.View>

      {/* Knob */}
      <Animated.View
        style={[
          styles.knob,
          {
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            transform: [{ translateX }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { justifyContent: "center" },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cfcfcf",
  },
  knob: {
    marginLeft: 3,
    backgroundColor: "#fff",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  iconLeft: { position: "absolute", left: 10, alignSelf: "center" },
  iconRight: { position: "absolute", right: 10, alignSelf: "center" },
});
