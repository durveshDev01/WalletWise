import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { catalog } from '../../data/catalog';
import type { CardData } from '../../store/useCardStore';
import { theme } from '../../theme';
import { BankBadge } from './BankBadge';
import { SectionHeader } from './SectionHeader';

/** Cards shown on Home before "View all". */
const VISIBLE = 4;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

type Props = {
  cards: CardData[];
  onOpenCard: (id: string) => void;
  onViewAll: () => void;
};

const RewardRow = React.memo(function RewardRow({ card, onOpen }: { card: CardData; onOpen: (id: string) => void }) {
  const issuer = catalog.byId.get(card.catalogId)?.issuer ?? card.bankName;
  const value = card.highValue > card.lowValue ? `≈ ${inr(card.lowValue)} – ${inr(card.highValue)}` : `≈ ${inr(card.lowValue)}`;
  return (
    <Pressable
      onPress={() => onOpen(card.id)}
      accessibilityRole="button"
      accessibilityLabel={`${card.bankName} ${card.cardName}, ${card.points.toLocaleString('en-IN')} ${card.currencyName}, worth ${value}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <BankBadge issuer={issuer} />
      <View style={styles.names}>
        <Text style={[theme.text.body, styles.cardName]} numberOfLines={1}>
          {card.cardName}
        </Text>
        <Text style={theme.text.caption} numberOfLines={1}>
          {card.bankName}
        </Text>
      </View>
      <View style={styles.values}>
          <Text style={theme.text.title}>{card.points.toLocaleString('en-IN')} {card.currencyName}</Text>
        <Text style={[theme.text.caption, styles.rupees]}>{value}</Text>
      </View>
    </Pressable>
  );
});

/** The user's cards by points value: top four rows with a link to the full wallet. */
export function RewardsList({ cards, onOpenCard, onViewAll }: Props) {
  const sorted = useMemo(() => [...cards].sort((a, b) => b.lowValue - a.lowValue), [cards]);
  const total = useMemo(() => cards.reduce((acc, c) => acc + c.lowValue, 0), [cards]);
  const renderItem = useCallback(({ item }: { item: CardData }) => <RewardRow card={item} onOpen={onOpenCard} />, [onOpenCard]);

  return (
    <View>
      <SectionHeader
        title="Your rewards"
        meta={`${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}
        actionLabel={cards.length > VISIBLE ? 'View all' : undefined}
        onAction={onViewAll}
      />
      <Text style={[theme.text.body, styles.total]}>
        Separate programme balances: <Text style={styles.totalValue}>≈ {inr(total)}</Text> in default-route INR equivalents (not pooled for a single redemption)
      </Text>
      <FlatList
        data={sorted.slice(0, VISIBLE)}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        // Capped at four rows inside the page ScrollView, so the list itself does not scroll.
        scrollEnabled={false}
        ItemSeparatorComponent={Separator}
        style={styles.list}
        ListEmptyComponent={<Text style={[theme.text.body, styles.empty]}>No cards yet. Add one from Quick actions.</Text>}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  total: { marginBottom: theme.spacing.sm },
  totalValue: { color: theme.colors.positive, fontWeight: '700' },
  list: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.hairline,
    borderColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.sizes.touch + theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  pressed: { backgroundColor: theme.colors.pressed },
  names: { flex: 1, gap: theme.spacing.xs },
  cardName: { color: theme.colors.textPrimary, fontWeight: '600' },
  values: { alignItems: 'flex-end' },
  rupees: { color: theme.colors.positive },
  separator: { height: theme.sizes.hairline, backgroundColor: theme.colors.border, marginLeft: theme.spacing.md },
  empty: { padding: theme.spacing.md },
});
