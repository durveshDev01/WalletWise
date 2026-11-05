import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips, inr, LinkButton } from '../components/money/MoneyUi';
import { catalog, DATA_ATTRIBUTION } from '../data/catalog';
import { BROWSE_BANKS, BROWSE_NETWORKS, browseCards, CARD_FILTERS } from '../engine';
import type { BrowseRow } from '../engine';
import { isSampleHolding, useCardStore } from '../store/useCardStore';
import { theme } from '../theme';

const feeLabel = (r: BrowseRow) => {
  if (r.card.lifetimeFree || r.card.annualFee === 0) return 'Lifetime free';
  if (r.card.annualFee == null) return 'Fee not published';
  return `${inr(r.feeWithGst)} a year incl. GST`;
};

type FilterTab = 'FEATURES' | 'BANKS' | 'NETWORKS';

/**
 * Fee-free finder: search and multi-filter all catalog cards.
 * Multi-select by Bank, Network, and Perks with instant reset and clear empty states.
 */
export default function BrowseCardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useCardStore((s) => s.profile);
  const profileSaved = useCardStore((s) => s.profileSaved);
  const holdings = useCardStore((s) => s.holdings);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [selectedBanks, setSelectedBanks] = useState<string[]>([]);
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('FEATURES');

  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(
    () =>
      browseCards(catalog, {
        query: deferredQuery,
        filterKeys: filters,
        banks: selectedBanks,
        networks: selectedNetworks,
        profile: profileSaved ? profile : null,
      }),
    [deferredQuery, filters, selectedBanks, selectedNetworks, profile, profileSaved],
  );

  const owned = new Set(holdings.filter((holding) => !isSampleHolding(holding)).map((h) => h.catalogId));

  const toggleFilter = (key: string) =>
    setFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleBank = (key: string) =>
    setSelectedBanks((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleNetwork = (key: string) =>
    setSelectedNetworks((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const resetAll = () => {
    setQuery('');
    setFilters([]);
    setSelectedBanks([]);
    setSelectedNetworks([]);
  };

  const totalActiveFilters = filters.length + selectedBanks.length + selectedNetworks.length + (query ? 1 : 0);
  const activeHints = CARD_FILTERS.filter((f) => filters.includes(f.key)).map((f) => f.hint);

  const header = (
    <View>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Browse cards
      </Text>
      <Text style={styles.sub}>
        All {catalog.cards.length} cards in our data. Multi-filter by bank, network, low-fee, or UPI capability.
      </Text>

      {/* Search Input with Clear Button */}
      <View style={styles.searchContainer}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by card or bank name..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.search}
          keyboardAppearance="dark"
          accessibilityLabel="Search cards"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} style={styles.searchClear} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.searchClearText}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        <Pressable
          style={[styles.filterTab, activeTab === 'FEATURES' && styles.filterTabActive]}
          onPress={() => setActiveTab('FEATURES')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'FEATURES' }}>
          <Text style={[styles.filterTabText, activeTab === 'FEATURES' && styles.filterTabTextActive]}>
            Features {filters.length > 0 ? `(${filters.length})` : ''}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterTab, activeTab === 'BANKS' && styles.filterTabActive]}
          onPress={() => setActiveTab('BANKS')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'BANKS' }}>
          <Text style={[styles.filterTabText, activeTab === 'BANKS' && styles.filterTabTextActive]}>
            Banks {selectedBanks.length > 0 ? `(${selectedBanks.length})` : ''}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterTab, activeTab === 'NETWORKS' && styles.filterTabActive]}
          onPress={() => setActiveTab('NETWORKS')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'NETWORKS' }}>
          <Text style={[styles.filterTabText, activeTab === 'NETWORKS' && styles.filterTabTextActive]}>
            Networks {selectedNetworks.length > 0 ? `(${selectedNetworks.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {/* Chip Rows based on active tab */}
      <View style={styles.chipsSection}>
        {activeTab === 'FEATURES' && (
          <Chips
            options={CARD_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
            value={filters}
            onChange={toggleFilter}
          />
        )}
        {activeTab === 'BANKS' && (
          <Chips
            options={BROWSE_BANKS.map((b) => ({ value: b.key, label: b.label }))}
            value={selectedBanks}
            onChange={toggleBank}
          />
        )}
        {activeTab === 'NETWORKS' && (
          <Chips
            options={BROWSE_NETWORKS.map((n) => ({ value: n.key, label: n.label }))}
            value={selectedNetworks}
            onChange={toggleNetwork}
          />
        )}
      </View>

      {/* Active Filter Hints */}
      {activeHints.map((h) => (
        <Text key={h} style={styles.hint}>
          • {h}
        </Text>
      ))}

      {/* Active Filter Bar & Reset */}
      {totalActiveFilters > 0 && (
        <View style={styles.activeFilterRow}>
          <Text style={styles.activeCountText}>{totalActiveFilters} filter{totalActiveFilters > 1 ? 's' : ''} applied</Text>
          <Pressable onPress={resetAll} style={styles.resetButton} accessibilityRole="button" accessibilityLabel="Reset all filters">
            <Text style={styles.resetButtonText}>Reset all filters ↺</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sortNote}>
        Showing {rows.length} {rows.length === 1 ? 'card' : 'cards'} ·{' '}
        {profileSaved ? 'sorted by yearly value at your spending' : 'sorted by annual fee, lowest first'}
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
            accessibilityHint="Opens card details">
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No matching cards found</Text>
            <Text style={styles.emptySub}>
              {totalActiveFilters > 0
                ? 'No cards in the catalog match your combination of filters. Try clearing specific bank or network filters.'
                : 'No cards found matching your query.'}
            </Text>
            {totalActiveFilters > 0 && (
              <Pressable onPress={resetAll} style={styles.emptyResetButton} accessibilityRole="button">
                <Text style={styles.emptyResetText}>Clear all filters</Text>
              </Pressable>
            )}
          </View>
        }
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
  searchContainer: {
    position: 'relative',
    marginTop: theme.spacing.md,
    justifyContent: 'center',
  },
  search: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm + 2,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 12,
    paddingRight: 38,
    minHeight: theme.sizes.touch,
    fontFamily: theme.fontFamily,
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  searchClear: {
    position: 'absolute',
    right: 10,
    height: 30,
    width: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    color: '#CCC',
    fontSize: 13,
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 4,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  filterTabActive: {
    backgroundColor: 'rgba(245,208,111,0.12)',
  },
  filterTabText: {
    fontFamily: theme.fontFamily,
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: theme.colors.gold,
  },
  chipsSection: {
    marginTop: theme.spacing.sm,
  },
  hint: { ...theme.text.body, fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  activeFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: theme.spacing.sm,
  },
  activeCountText: {
    fontFamily: theme.fontFamily,
    color: theme.colors.gold,
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  resetButtonText: {
    fontFamily: theme.fontFamily,
    color: '#E0A090',
    fontSize: 12,
    fontWeight: '600',
  },
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: theme.fontFamily,
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: theme.fontFamily,
    color: '#8A8A8A',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyResetButton: {
    backgroundColor: theme.colors.gold,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  emptyResetText: {
    fontFamily: theme.fontFamily,
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '700',
  },
  attribution: { ...theme.text.caption, fontWeight: '400', marginTop: theme.spacing.lg, lineHeight: 16 },
});
