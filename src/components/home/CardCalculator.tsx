import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CardData } from '../../store/useCardStore';
import { theme } from '../../theme';
import type { MerchantCategory } from '../../utils/merchantClassifier';
import { getRankedRecommendations } from '../../utils/recommendationEngine';

const CATEGORIES: { value: MerchantCategory; label: string }[] = [
  { value: 'Dining', label: 'Dining' },
  { value: 'Grocery', label: 'Grocery' },
  { value: 'Fuel', label: 'Fuel' },
  // "Shopping" here means online shopping, the biggest card spend category in India.
  { value: 'Shopping', label: 'Online shopping' },
  { value: 'Travel', label: 'Travel' },
  { value: 'Entertainment', label: 'Entertainment' },
];
const AMOUNTS = [500, 2000, 5000, 10000];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

type Props = {
  cards: CardData[];
  onCompareNearby: () => void;
};

const CategoryChip = React.memo(function CategoryChip({
  item,
  selected,
  onSelect,
}: {
  item: (typeof CATEGORIES)[number];
  selected: boolean;
  onSelect: (value: MerchantCategory) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(item.value)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Spend type ${item.label}`}
      style={({ pressed }) => [styles.categoryChip, selected && styles.categoryChipOn, pressed && styles.pressed]}
    >
      <Text style={[theme.text.body, styles.categoryText, selected && styles.chipTextOn]}>{item.label}</Text>
    </Pressable>
  );
});

/** "Which card should I use?": pick a spend type and amount, see the best card, why it wins, and what it earns. */
export function CardCalculator({ cards, onCompareNearby }: Props) {
  const [category, setCategory] = useState<MerchantCategory>('Dining');
  const [amount, setAmount] = useState(5000);

  const best = useMemo(
    () => getRankedRecommendations('', category, cards, { amount, online: category === 'Shopping' })[0],
    [cards, category, amount],
  );

  const onSelectCategory = useCallback((value: MerchantCategory) => setCategory(value), []);
  const renderCategory = useCallback(
    ({ item }: { item: (typeof CATEGORIES)[number] }) => (
      <CategoryChip item={item} selected={item.value === category} onSelect={onSelectCategory} />
    ),
    [category, onSelectCategory],
  );

  const units =
    best && best.rewardUnit !== 'CASHBACK'
      ? `${best.pointsEarned.toLocaleString('en-IN')} ${best.rewardUnit === 'MILES' ? 'miles' : 'points'}`
      : 'cashback';

  return (
    <View style={styles.card}>
      <Text style={[theme.text.caption, styles.caption]}>SPEND TYPE</Text>
      <FlatList
        data={CATEGORIES}
        horizontal
        keyExtractor={(c) => c.value}
        renderItem={renderCategory}
        extraData={category}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        accessibilityRole="radiogroup"
      />

      <Text style={[theme.text.caption, styles.caption, styles.captionGap]}>AMOUNT</Text>
      <View style={styles.amountRow} accessibilityRole="radiogroup">
        {AMOUNTS.map((a) => {
          const selected = a === amount;
          return (
            <Pressable
              key={a}
              onPress={() => setAmount(a)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Amount ${inr(a)}`}
              style={({ pressed }) => [styles.amountChip, selected && styles.amountChipOn, pressed && styles.pressed]}
            >
              <Text style={[theme.text.body, styles.amountText, selected && styles.amountTextOn]}>{inr(a)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.result} accessibilityLiveRegion="polite">
        <Text style={theme.text.caption}>BEST CARD</Text>
        {best ? (
          <>
            <Text style={[theme.text.title, styles.cardName]} numberOfLines={2}>
              {best.card.bankName} {best.card.cardName}
            </Text>
            <View style={styles.rewardRow}>
              <Text style={[theme.text.title, styles.reward]}>≈ {inr(best.estimatedValue)}</Text>
              <Text style={theme.text.body}>{units}</Text>
            </View>
            <Text style={theme.text.caption}>Estimated net value on {inr(amount)} spend · {best.confidence.toLowerCase()} confidence</Text>
            {!!best.winningMargin && (
              <View style={styles.marginBox}>
                <Text style={styles.marginText}>🏆 {best.winningMargin.explanation}</Text>
              </View>
            )}
            {!!best.verifiedAt && <Text style={theme.text.caption}>Reward data checked {best.verifiedAt}{best.source ? ` · ${best.source}` : ''}</Text>}
            {!!best.warnings[0] && <Text style={[theme.text.caption, styles.warning]}>{best.warnings[0]}</Text>}
          </>
        ) : (
          <Text style={theme.text.body}>Add a card to see which one to use.</Text>
        )}
      </View>

      <Pressable
        onPress={onCompareNearby}
        accessibilityRole="button"
        accessibilityLabel="Compare your cards at places near me"
        style={({ pressed }) => [styles.secondaryCta, pressed && styles.pressed]}
      >
        <Text style={[theme.text.body, styles.secondaryCtaText]}>Compare at places near me →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.hairline,
    borderColor: theme.colors.border,
  },
  caption: { marginBottom: theme.spacing.sm },
  captionGap: { marginTop: theme.spacing.md },
  chipRow: { gap: theme.spacing.sm },
  pressed: { opacity: 0.8 },
  // Spend type: outlined pills.
  categoryChip: {
    minHeight: theme.sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  categoryChipOn: { borderColor: theme.colors.gold, backgroundColor: theme.colors.goldSoft },
  categoryText: { color: theme.colors.textSecondary },
  chipTextOn: { color: theme.colors.gold, fontWeight: '700' },
  // Amount: filled square-ish tiles, a different shape from the spend pills.
  amountRow: { flexDirection: 'row', gap: theme.spacing.sm },
  amountChip: {
    flex: 1,
    minHeight: theme.sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceRaised,
  },
  amountChipOn: { backgroundColor: theme.colors.gold },
  amountText: { color: theme.colors.textPrimary, fontWeight: '600' },
  amountTextOn: { color: theme.colors.onGold, fontWeight: '700' },
  result: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.hairline,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  cardName: { marginTop: theme.spacing.xs },
  rewardRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  reward: { color: theme.colors.gold, fontSize: theme.fontSize.hero - theme.spacing.sm, lineHeight: theme.fontSize.hero },
  marginBox: {
    backgroundColor: 'rgba(245,208,111,0.08)',
    borderColor: 'rgba(245,208,111,0.25)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginVertical: 4,
  },
  marginText: {
    fontFamily: theme.fontFamily,
    color: theme.colors.gold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  warning: { color: theme.colors.warning },
  secondaryCta: {
    marginTop: theme.spacing.md,
    minHeight: theme.sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
    paddingHorizontal: theme.spacing.md,
  },
  secondaryCtaText: { color: theme.colors.gold, fontWeight: '700' },
});
