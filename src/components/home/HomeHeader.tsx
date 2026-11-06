import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../theme';
import { Icon } from '../Icon';
import { useCardStore } from '../../store/useCardStore';
import { UI_STRINGS } from '../../services/appStrings';

type Props = {
  topInset: number;
  hasAlerts: boolean;
  onAlerts: () => void;
  onSettings: () => void;
};

function greeting(lang: 'en' | 'hi') {
  const hour = new Date().getHours();
  const t = UI_STRINGS[lang].home;
  if (hour < 12) return t.morning;
  if (hour < 18) return t.afternoon;
  return t.evening;
}

/** Greeting with the alerts bell and settings gear, both gold outline icons. */
export function HomeHeader({ topInset, hasAlerts, onAlerts, onSettings }: Props) {
  const language = useCardStore((s) => s.auraLanguage ?? 'en');
  const t = UI_STRINGS[language].home;

  return (
    <View style={[styles.header, { paddingTop: topInset + theme.spacing.sm }]}>
      <View style={styles.titles}>
        <Text style={theme.text.title} accessibilityRole="header">
          {greeting(language)}
        </Text>
        <Text style={theme.text.caption}>{t.welcome}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onAlerts}
          accessibilityRole="button"
          accessibilityLabel={hasAlerts ? 'Card updates, new changes' : 'Card updates'}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Icon name="bell" color={theme.colors.gold} size={theme.sizes.iconLarge} />
          {hasAlerts && <View style={styles.badge} />}
        </Pressable>
        <Pressable
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Icon name="settings" color={theme.colors.gold} size={theme.sizes.iconLarge} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  titles: { gap: theme.spacing.xs },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  iconButton: {
    width: theme.sizes.touch,
    height: theme.sizes.touch,
    borderRadius: theme.sizes.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.hairline,
    borderColor: theme.colors.border,
  },
  pressed: { backgroundColor: theme.colors.pressed },
  badge: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: theme.sizes.dot,
    height: theme.sizes.dot,
    borderRadius: theme.sizes.dot / 2,
    backgroundColor: theme.colors.danger,
  },
});
