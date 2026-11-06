import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardFace } from '../components/CardFace';
import { CardArt } from '../components/CardArt';
import { catalog, DATA_ATTRIBUTION } from '../data/catalog';
import { searchCards } from '../engine';
import { parseBillDay } from '../engine/billing';
import type { Card } from '../engine';
import { useCardStore } from '../store/useCardStore';
import { colors, typography } from '../theme';

// Cards most people search for first, shown before the user types.
const POPULAR = [
  'sbi-cashback', 'hdfc-millennia', 'icici-amazon-pay', 'axis-ace', 'hdfc-swiggy', 'hdfc-regalia-gold',
  'hdfc-infinia', 'axis-atlas', 'sbi-bpcl-octane', 'hdfc-tata-neu-infinity', 'amex-platinum-travel', 'idfc-millennia',
];

/** Add one of the 280 catalog cards to the wallet with its last four digits and points balance. */
export default function AddCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addCard = useCardStore((s) => s.addCard);
  const removeSampleCards = useCardStore((s) => s.removeSampleCards);
  const isDemo = useCardStore((s) => s.isDemo);

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Card | null>(null);
  const [lastFour, setLastFour] = useState('');
  const [points, setPoints] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [expiryText, setExpiryText] = useState('');

  const results = useMemo(() => {
    if (query.trim().length < 2) return POPULAR.map((id) => catalog.byId.get(id)).filter((c): c is Card => !!c);
    return searchCards(catalog, query, 40);
  }, [query]);

  const save = () => {
    if (!picked) return;
    if (points.trim() !== '' && !/^\d+$/.test(points.trim())) {
      Alert.alert('Check balance', 'Please enter a valid whole number for your points or cashback balance (leave empty for 0).');
      return;
    }
    const invalidDay = [statementDay, dueDay].find((day) => day.trim() && !parseBillDay(day));
    if (invalidDay) {
      Alert.alert('Check bill day', 'Statement and due days must be whole numbers from 1 to 31.');
      return;
    }

    const trimmedExpiry = expiryText.trim();
    let expiryDateVal: string | undefined;
    let expiryDaysVal: number | undefined;

    if (trimmedExpiry) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedExpiry)) {
        expiryDateVal = trimmedExpiry;
      } else if (/^\d+$/.test(trimmedExpiry)) {
        expiryDaysVal = Number(trimmedExpiry);
      } else {
        Alert.alert('Check expiry', 'Please enter remaining days (e.g. 30) or a date in YYYY-MM-DD format.');
        return;
      }
    }

    addCard(picked.id, lastFour.replace(/\D/g, '').slice(-4), Number(points.replace(/\D/g, '')) || 0, {
      statementDay: parseBillDay(statementDay),
      dueDay: parseBillDay(dueDay),
      expiryDate: expiryDateVal,
      expiryDays: expiryDaysVal,
    });
    router.replace('/wallet');
  };

  if (picked) {
    const isCashback = picked.rewards.every((r) => r.type === 'CASHBACK');
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => setPicked(null)} style={styles.back} accessibilityRole="button" accessibilityLabel="Choose another card">
          <Text style={styles.backText}>← Choose another card</Text>
        </Pressable>
        <View style={styles.preview}>
          <CardArt card={{ catalogId: picked.id }} small={false} />
        </View>
        <Text style={styles.title}>{picked.name}</Text>
        <Text style={styles.sub}>
          {picked.lifetimeFree || picked.annualFee === 0 ? 'No annual fee' : `Annual fee ₹${(picked.annualFee ?? 0).toLocaleString('en-IN')} + GST`} · {picked.network}
        </Text>

        <Text style={styles.label}>LAST 4 DIGITS (OPTIONAL)</Text>
        <TextInput
          value={lastFour}
          onChangeText={setLastFour}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="1234"
          placeholderTextColor="#555"
          style={styles.input}
          keyboardAppearance="dark"
        />
        <Text style={styles.label}>{isCashback ? 'CASHBACK BALANCE (₹, OPTIONAL)' : 'POINTS BALANCE (FROM YOUR STATEMENT OR BANK APP)'}</Text>
        <TextInput
          value={points}
          onChangeText={setPoints}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor="#555"
          style={styles.input}
          keyboardAppearance="dark"
        />
        <Text style={styles.label}>BILL DATES (OPTIONAL, DAY OF THE MONTH)</Text>
        <View style={styles.dayRow}>
          <TextInput
            value={statementDay}
            onChangeText={setStatementDay}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="Statement day"
            placeholderTextColor="#555"
            style={[styles.input, styles.dayInput]}
            keyboardAppearance="dark"
            accessibilityLabel="Statement day, 1 to 31"
          />
          <TextInput
            value={dueDay}
            onChangeText={setDueDay}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="Due day"
            placeholderTextColor="#555"
            style={[styles.input, styles.dayInput]}
            keyboardAppearance="dark"
            accessibilityLabel="Due day, 1 to 31"
          />
        </View>
        <Text style={styles.hint}>With a due day, WalletWise can remind you 3 days and 1 day before each bill.</Text>

        {!isCashback && (
          <>
            <Text style={styles.label}>POINTS EXPIRY (OPTIONAL)</Text>
            <TextInput
              value={expiryText}
              onChangeText={setExpiryText}
              placeholder={
                picked?.pointsExpiry?.neverExpires
                  ? 'Points never expire (leave empty)'
                  : picked?.pointsExpiry?.validityMonths
                  ? `Default: ${picked.pointsExpiry.validityMonths} months from today`
                  : 'e.g. 30 (or 2026-12-31)'
              }
              placeholderTextColor="#555"
              style={styles.input}
              keyboardAppearance="dark"
              accessibilityLabel="Points expiry in days or YYYY-MM-DD format"
            />
            <Text style={styles.hint}>
              {picked?.pointsExpiry?.note
                ? `Rule: ${picked.pointsExpiry.note}`
                : 'WalletWise warns you before reward points expire so you never lose accumulated value.'}
            </Text>
          </>
        )}

        <Text style={styles.hint}>WalletWise never asks for your full card number, CVV or PIN. Everything stays on this phone.</Text>
        {isDemo && <Text style={styles.hint}>Sample cards stay in your wallet when you add this card. You can remove them later.</Text>}

        <Pressable style={styles.primary} onPress={save} accessibilityRole="button">
          <Text style={styles.primaryText}>Add to my wallet</Text>
        </Pressable>
        {isDemo && <Pressable style={styles.back} onPress={() => { removeSampleCards(); }} accessibilityRole="button"><Text style={styles.backText}>Remove sample cards and continue adding</Text></Pressable>}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Add a card</Text>
      <Text style={styles.sub}>Search {catalog.cards.length} catalogued Indian credit cards. Cards not in this catalog cannot yet be added accurately; contact support to request one.</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by bank or card, e.g. SBI Cashback"
        accessibilityLabel="Search cards by bank or name"
        placeholderTextColor="#666"
        style={styles.search}
        autoFocus
        keyboardAppearance="dark"
      />
      {query.trim().length < 2 && <Text style={styles.label}>POPULAR</Text>}
      <FlatList
        data={results}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListEmptyComponent={<Text style={styles.sub}>No card found. Try the bank name.</Text>}
        ListFooterComponent={<Text style={styles.attribution}>{DATA_ATTRIBUTION}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setPicked(item)} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`}>
            <View style={styles.thumb}>
              <CardFace issuer={item.issuer} name={item.name} network={item.network} tier={item.tier} small />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowSub}>
                {item.lifetimeFree || item.annualFee === 0 ? 'No annual fee' : `₹${(item.annualFee ?? 0).toLocaleString('en-IN')} a year`}
                {item.rateMaxPct ? ` · up to ${item.rateMaxPct}% back` : ''}
                {item.inclusion?.upi?.earnsRewards && (item.inclusion.upi.ratePct ?? 0) > (item.rateMaxPct ?? 0)
                  ? ` · ${item.inclusion.upi.ratePct}% on UPI${item.inclusion.upi.scanAndPayOnly ? ' scan and pay' : ''}`
                  : ''}
              </Text>
            </View>
            <Text style={styles.plus}>＋</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  back: { paddingVertical: 8 },
  backText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 15, fontWeight: '600' },
  title: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
  sub: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 14, marginTop: 6, marginBottom: 12 },
  search: {
    fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 16, backgroundColor: '#141414',
    borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  label: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1C1C1C' },
  thumb: { width: 64, height: 40, borderRadius: 6, overflow: 'hidden' },
  rowTitle: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 15, fontWeight: '600' },
  rowSub: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 12, marginTop: 2 },
  plus: { color: colors.accent.goldStart, fontSize: 22 },
  preview: { width: '100%', aspectRatio: 1.586, borderRadius: 18, overflow: 'hidden', marginVertical: 16 },
  input: {
    fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 18, backgroundColor: '#141414',
    borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 14, paddingVertical: 12,
  },
  dayRow: { flexDirection: 'row', gap: 12 },
  dayInput: { flex: 1 },
  hint: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 12, marginTop: 12, lineHeight: 17 },
  primary: { marginTop: 24, backgroundColor: colors.accent.goldStart, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontFamily: typography.fontFamily, color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
  attribution: { fontFamily: typography.fontFamily, color: '#555', fontSize: 11, marginTop: 16, lineHeight: 16 },
});
