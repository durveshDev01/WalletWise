import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { SETTINGS_STRINGS } from '../services/auraStrings';
import type { AppLanguage } from '../services/auraStrings';
import { isLowMemory, memoryGbLabel } from '../services/liteMode';
import { useCardStore } from '../store/useCardStore';
import { theme } from '../theme';

const LANGUAGES: { value: AppLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
];

/** Settings: Aura language, simple answers, Lite mode, and a link to the spending profile. */
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useCardStore((s) => s.auraLanguage ?? 'en');
  const simple = useCardStore((s) => s.auraSimple === true);
  const lite = useCardStore((s) => s.liteMode === true);
  const setAuraLanguage = useCardStore((s) => s.setAuraLanguage);
  const setAuraSimple = useCardStore((s) => s.setAuraSimple);
  const setLiteMode = useCardStore((s) => s.setLiteMode);
  const t = SETTINGS_STRINGS[language];
  const lowMemory = isLowMemory(Device.totalMemory);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + theme.spacing.sm, paddingBottom: insets.bottom + theme.spacing.lg, paddingHorizontal: theme.spacing.md }}
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t.back} style={styles.back}>
        <Text style={[theme.text.body, styles.backText]}>{t.back}</Text>
      </Pressable>
      <Text style={theme.text.title} accessibilityRole="header">
        {t.title}
      </Text>

      <Text style={[theme.text.caption, styles.section]}>{t.auraSection}</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[theme.text.body, styles.label]}>{t.language}</Text>
            <Text style={theme.text.caption}>{t.languageHint}</Text>
          </View>
        </View>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.value}
              onPress={() => setAuraLanguage(l.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: language === l.value }}
              accessibilityLabel={l.label}
              style={[styles.segmentItem, language === l.value && styles.segmentItemOn]}
            >
              <Text style={[theme.text.body, styles.segmentText, language === l.value && styles.segmentTextOn]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[theme.text.body, styles.label]}>{t.simple}</Text>
            <Text style={theme.text.caption}>{t.simpleHint}</Text>
          </View>
          <Switch
            value={simple}
            onValueChange={setAuraSimple}
            accessibilityLabel={t.simple}
            trackColor={{ false: theme.colors.borderStrong, true: theme.colors.goldBorder }}
            thumbColor={simple ? theme.colors.gold : theme.colors.textMuted}
          />
        </View>
      </View>

      <Text style={[theme.text.caption, styles.section]}>{t.phoneSection}</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[theme.text.body, styles.label]}>{t.lite}</Text>
            <Text style={theme.text.caption}>{t.liteHint}</Text>
            {lowMemory && Device.totalMemory != null && (
              <Text style={[theme.text.caption, styles.recommended]}>{t.liteRecommended(memoryGbLabel(Device.totalMemory))}</Text>
            )}
          </View>
          <Switch
            value={lite}
            onValueChange={setLiteMode}
            accessibilityLabel={t.lite}
            trackColor={{ false: theme.colors.borderStrong, true: theme.colors.goldBorder }}
            thumbColor={lite ? theme.colors.gold : theme.colors.textMuted}
          />
        </View>
      </View>

      <Text style={[theme.text.caption, styles.section]}>{t.profileSection}</Text>
      <Pressable
        onPress={() => router.push('/find-card')}
        accessibilityRole="button"
        accessibilityLabel={t.profile}
        style={({ pressed }) => [styles.group, styles.row, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text style={[theme.text.body, styles.label]}>{t.profile}</Text>
          <Text style={theme.text.caption}>{t.profileHint}</Text>
        </View>
        <Icon name="chevron-right" color={theme.colors.textMuted} size={theme.sizes.icon} />
      </Pressable>

      <Text style={[theme.text.caption, styles.section]}>{t.privacySection}</Text>
      <View style={styles.group}>
        <Text style={theme.text.body}>{t.privacy}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1, gap: theme.spacing.xs },
  back: { minHeight: theme.sizes.touch, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { color: theme.colors.gold, fontWeight: '600' },
  section: { marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  group: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.hairline,
    borderColor: theme.colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  label: { color: theme.colors.textPrimary, fontWeight: '600' },
  recommended: { color: theme.colors.gold },
  divider: { height: theme.sizes.hairline, backgroundColor: theme.colors.border },
  pressed: { backgroundColor: theme.colors.pressed },
  segment: { flexDirection: 'row', padding: theme.spacing.xs, borderRadius: theme.radius.md, backgroundColor: theme.colors.background },
  segmentItem: { flex: 1, minHeight: theme.sizes.touch, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm },
  segmentItemOn: { backgroundColor: theme.colors.goldSoft, borderWidth: 1, borderColor: theme.colors.goldBorder },
  segmentText: { color: theme.colors.textSecondary },
  segmentTextOn: { color: theme.colors.gold, fontWeight: '700' },
});
