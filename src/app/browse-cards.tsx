import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips, inr, LinkButton } from '../components/money/MoneyUi';
import { catalog, DATA_ATTRIBUTION } from '../data/catalog';
import { browseCards, CARD_FILTERS } from '../engine';
import type { BrowseRow } from '../engine';
import { isSampleHolding, useCardStore } from '../store/useCardStore';
import { theme } from '../theme';

const feeLabel = (r: BrowseRow) => {
  if (r.card.lifetimeFree || r.card.annualFee === 0) return 'Lifetime free';
  if (r.card.annualFee == null) return 'Fee not published';
  return `${inr(r.feeWithGst)} a year incl. GST`;
};

/**
 * Fee-free finder: search and filter all catalog cards. Sorted by yearly value at the
 * user's Find My Card spend when they have saved one, otherwise by fee.
 */
export default function BrowseCardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useCardStore((s) => s.profile);
  const profileSaved = useCardStore((s) => s.profileSaved);
  const holdings = useCardStore((s) => s.holdings);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(
    () => browseCards(catalog, { query: deferredQuery, filterKeys: filters, profile: profileSaved ? profile : null }),
    [deferredQuery, filters, profile, profileSaved],
  );
  const owned = new Set(holdings.filter((holding) => !isSampleHolding(holding)).map((h) => h.catalogId));
  const toggle = (key: string) => setFilters((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));
  const hints = CARD_FILTERS.filter((f) => filters.includes(f.key)).map((f) => f.hint);

  const header = (
    <View>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Browse cards
      </Text>
      <Text style={styles.sub}>
        All {catalog.cards.length} cards in our data. Filter for no-fee or low-fee cards, or cards that work on UPI.
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by card or bank"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.search}
        keyboardAppearance="dark"
        accessibilityLabel="Search cards"
      />
      <View style={{ marginTop: theme.spacing.sm }}>
        <Chips options={CARD_FILTERS.map((f) => ({ value: f.key, label: f.label }))} value={filters} onChange={toggle} />
      </View>
      {hints.map((h) => (
        <Text key={h} style={styles.hint}>
          {h}
        </Text>
      ))}
      <Text style={styles.sortNote}>
        {rows.length} {rows.length === 1 ? 'card' : 'cards'} ·{' '}
        {profileSaved ? 'sorted by yearly value at your spending (rewards and perks minus fee)' : 'sorted by fee, lowest first'}
      </Text>
      {!profileSaved && <LinkButton label="Sort by value at my spending → Find My Card" onPress={() => router.push('/find-card')} />}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.card.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: theme.spacing.md + 4 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/card-detail', params: { catalogId: item.card.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityHint="Opens card details"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {item.card.name}
              </Text>
              <Text style={styles.meta}>
                {item.card.network === 'RUPAY' ? 'RuPay · UPI' : item.card.network} · {feeLabel(item)}
                {owned.has(item.card.id) ? ' · In your wallet' : ''}
              </Text>
            </View>
            {item.yearlyValue != null && (
              <View style={styles.valueBox}>
                <Text style={[styles.value, item.yearlyValue < 0 && { color: theme.colors.danger }]}>{inr(item.yearlyValue)}</Text>
                <Text style={styles.valueLabel}>a year</Text>
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.sub}>No card matches. Try fewer filters.</Text>}
        ListFooterComponent={<Text style={styles.attribution}>{DATA_ATTRIBUTION}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  back: { paddingVertical: theme.spacing.sm, alignSelf: 'flex-start', minHeight: theme.sizes.touch, justifyContent: 'center' },
  backText: { fontFamily: theme.fontFamily, color: theme.colors.gold, fontSize: 15, fontWeight: '600' },
  title: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 },
  sub: { ...theme.text.body, marginTop: theme.spacing.sm },
  search: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm + 2,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 12,
    minHeight: theme.sizes.touch,
    fontFamily: theme.fontFamily,
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  hint: { ...theme.text.body, fontSize: 13, color: theme.colors.textMuted, marginTop: 6 },
  sortNote: { ...theme.text.caption, fontWeight: '400', marginTop: theme.spacing.md, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: theme.sizes.touch + 12,
  },
  pressed: { backgroundColor: theme.colors.pressed },
  name: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 15, fontWeight: '600' },
  meta: { ...theme.text.body, fontSize: 13, marginTop: 2 },
  valueBox: { alignItems: 'flex-end' },
  value: { fontFamily: theme.fontFamily, color: theme.colors.positive, fontSize: 16, fontWeight: '700' },
  valueLabel: { ...theme.text.caption, fontWeight: '400' },
  attribution: { ...theme.text.caption, fontWeight: '400', marginTop: theme.spacing.lg, lineHeight: 16 },
});
