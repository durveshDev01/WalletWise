import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { theme } from '../../theme';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/Icon';
import { useCardStore } from '../../store/useCardStore';
import { UI_STRINGS } from '../../services/appStrings';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  map: 'pin',
  aura: 'sparkle',
  learn: 'book',
  wallet: 'card',
};

function TabItem({ route, isFocused, options, onPress }: any) {
  const label: string = options.title !== undefined ? options.title : route.name;
  const activeProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    activeProgress.set(withSpring(isFocused ? 1 : 0, { damping: 18, stiffness: 150 }));
  }, [isFocused, activeProgress]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(activeProgress.value, [0, 1], [1, 1.08], Extrapolation.CLAMP) }],
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
    transform: [{ scaleX: interpolate(activeProgress.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) }],
  }));

  const color = isFocused ? theme.colors.gold : theme.colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      <Animated.View style={iconStyle}>
        <Icon name={TAB_ICONS[route.name] ?? 'home'} color={color} size={theme.sizes.iconLarge} />
      </Animated.View>
      <Text style={[theme.text.caption, styles.tabLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function CenterAuraButton({ onPress, isFocused, label }: any) {
  const pressScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));

  return (
    <View style={styles.centerTabWrapper}>
      <AnimatedPressable
        onPressIn={() => pressScale.set(withSpring(0.92))}
        onPressOut={() => pressScale.set(withSpring(1))}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel="Aura assistant"
        accessibilityState={{ selected: isFocused }}
        style={[styles.centerButtonWrapper, isFocused && styles.centerButtonFocused, animatedStyle]}
      >
        <LinearGradient colors={[theme.colors.surfaceRaised, theme.colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.centerButton}>
          <Icon name="sparkle" color={theme.colors.gold} size={theme.sizes.iconLarge} />
        </LinearGradient>
      </AnimatedPressable>
      <Text style={[theme.text.caption, styles.tabLabel, { color: isFocused ? theme.colors.gold : theme.colors.textMuted }]}>{label ?? 'Aura'}</Text>
    </View>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  // Lite mode draws a plain opaque bar; blur is costly on low-end phones.
  const liteMode = useCardStore((s) => s.liteMode === true);
  const Bar = liteMode ? View : BlurView;
  const barProps = liteMode ? {} : { intensity: 50, tint: 'dark' as const };

  return (
    <View style={styles.tabBarContainer}>
      <Bar {...barProps} style={[styles.tabBar, liteMode && styles.tabBarLite, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}>
        <View style={styles.topBorder} />

        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          if (route.name === 'aura') {
            return <CenterAuraButton key={route.key} onPress={onPress} isFocused={isFocused} label={options.title} />;
          }
          return <TabItem key={route.key} route={route} isFocused={isFocused} options={options} onPress={onPress} />;
        })}
      </Bar>
    </View>
  );
}

export default function AppTabs() {
  const language = useCardStore((s) => s.auraLanguage ?? 'en');
  const t = UI_STRINGS[language].tabs;

  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t.home }} />
      <Tabs.Screen name="map" options={{ title: t.map }} />
      <Tabs.Screen name="aura" options={{ title: t.aura }} />
      <Tabs.Screen name="learn" options={{ title: t.learn }} />
      <Tabs.Screen name="wallet" options={{ title: t.wallet }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: theme.sizes.tabBarHeight,
    paddingTop: theme.spacing.xs,
    backgroundColor: theme.colors.tabBar,
  },
  tabBarLite: { backgroundColor: theme.colors.background },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: theme.sizes.hairline,
    backgroundColor: theme.colors.goldBorder,
  },
  tabItem: {
    flex: 1,
    minHeight: theme.sizes.touch + theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.md,
  },
  pressed: { backgroundColor: theme.colors.pressed },
  indicator: {
    position: 'absolute',
    top: 0,
    width: theme.spacing.md,
    height: theme.sizes.accentLine,
    borderRadius: theme.sizes.accentLine / 2,
    backgroundColor: theme.colors.gold,
  },
  tabLabel: { letterSpacing: 0 },
  centerTabWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  centerButtonWrapper: {
    width: theme.sizes.auraButton,
    height: theme.sizes.auraButton,
    borderRadius: theme.sizes.auraButton / 2,
    marginTop: -theme.spacing.md,
    padding: theme.sizes.accentLine,
    backgroundColor: theme.colors.goldBorder,
    shadowColor: theme.colors.gold,
    shadowOffset: { width: 0, height: theme.spacing.xs },
    shadowOpacity: 0.3,
    shadowRadius: theme.spacing.sm,
    elevation: 5,
  },
  centerButtonFocused: { shadowOpacity: 0.6 },
  centerButton: {
    flex: 1,
    borderRadius: theme.sizes.auraButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
