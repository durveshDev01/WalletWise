import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '../../theme';

type Props = {
  /** Default-route INR equivalent, summed across separate programmes. */
  totalMin: number;
  /** Value with the best realistic redemptions, in rupees. */
  totalMax: number;
  cardCount: number;
  balanceCount: number;
  isDemo: boolean;
  onSeeHow: () => void;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Estimated INR equivalent of the user's separate reward balances. */
export function HeroCard({ totalMin, totalMax, cardCount, balanceCount, isDemo, onSeeHow }: Props) {
  const summary = `${cardCount} ${cardCount === 1 ? 'card' : 'cards'} • ${balanceCount} separate reward balances`;
  return (
    // A plain container (not a button) so the "See how" link stays reachable by screen readers.
    <View style={styles.card}>
      <LinearGradient colors={theme.colors.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.labelRow}>
      <Text style={theme.text.caption}>ESTIMATED REWARD VALUE</Text>
        {isDemo && (
          <View style={styles.demoChip}>
            <Text style={[theme.text.caption, styles.demoText]}>Sample cards</Text>
          </View>
        )}
      </View>
      <Text
        style={[theme.text.title, styles.value]}
        adjustsFontSizeToFit
        numberOfLines={1}
        accessibilityLabel={`Estimated INR value of separate reward balances is ${inr(totalMin)}`}
      >
        {inr(totalMin)}
      </Text>

      {totalMax > totalMin ? (
        <View style={styles.bestRow}>
        <Text style={[theme.text.body, styles.best]}>Up to {inr(totalMax)} estimated across separate programmes</Text>
          <Pressable
            onPress={onSeeHow}
            accessibilityRole="link"
            accessibilityLabel="See how to get the best redemption value"
            hitSlop={theme.spacing.sm}
            style={({ pressed }) => [styles.seeHow, pressed && styles.pressedLink]}
          >
            <Text style={[theme.text.body, styles.seeHowText]}>See how →</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={theme.text.body}>Estimated default-route equivalent; programmes stay separate</Text>
      )}

      <View style={styles.divider} />
      <Text style={[theme.text.body, styles.summary]}>{summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.hairline,
    borderColor: theme.colors.goldBorder,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  demoChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.goldSoft,
  },
  demoText: { color: theme.colors.gold },
  value: { fontSize: theme.fontSize.hero, lineHeight: theme.fontSize.hero + theme.spacing.sm, marginTop: theme.spacing.sm },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  best: { color: theme.colors.positive, flexShrink: 1 },
  seeHow: { minHeight: theme.sizes.touch, justifyContent: 'center', paddingHorizontal: theme.spacing.xs, borderRadius: theme.radius.sm },
  pressedLink: { backgroundColor: theme.colors.pressed },
  seeHowText: { color: theme.colors.gold, fontWeight: '700' },
  divider: { height: theme.sizes.hairline, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
  summary: { color: theme.colors.textPrimary, fontWeight: '600' },
});
