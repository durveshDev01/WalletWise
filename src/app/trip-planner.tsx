import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catalog } from '../data/catalog';
import { planTripPayment, skyscannerUrl } from '../engine';
import type { Card } from '../engine';
import { useCardStore } from '../store/useCardStore';
import { colors, typography } from '../theme';

const CABINS = [
  { value: 'economy', label: 'Economy' },
  { value: 'premiumeconomy', label: 'Premium economy' },
  { value: 'business', label: 'Business' },
] as const;

// A few common Indian routes to start from.
const POPULAR_ROUTES = [
  { from: 'PNQ', to: 'GOI', label: 'Pune → Goa' },
  { from: 'BOM', to: 'DEL', label: 'Mumbai → Delhi' },
  { from: 'BLR', to: 'DXB', label: 'Bengaluru → Dubai' },
  { from: 'DEL', to: 'SIN', label: 'Delhi → Singapore' },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

/**
 * Trip Planner: check the real cash fare on Skyscanner, then see the best card to pay
 * with, how far your points go, and how long your normal spending takes to cover the rest.
 */
export default function TripPlannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fare?: string }>();
  const { cards, profile } = useCardStore();

  const [from, setFrom] = useState('PNQ');
  const [to, setTo] = useState('GOI');
  const [date, setDate] = useState(defaultDate());
  const [cabin, setCabin] = useState<(typeof CABINS)[number]['value']>('economy');
  const [travellers, setTravellers] = useState('1');
  const [fare, setFare] = useState(params.fare ?? '6500');

  const fareRs = (Number(fare.replace(/[^0-9]/g, '')) || 0) * Math.max(1, Number(travellers) || 1);

  const plan = useMemo(() => {
    const holdings = cards
      .map((c) => ({ card: catalog.byId.get(c.catalogId), points: c.points }))
      .filter((h): h is { card: Card; points: number } => !!h.card);
    if (fareRs <= 0 || holdings.length === 0) return null;
    return planTripPayment(catalog, holdings, fareRs, { experience: profile.experience, kind: 'FLIGHT' });
  }, [cards, profile, fareRs]);

  const openSkyscanner = () => {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : defaultDate();
    Linking.openURL(skyscannerUrl(from.trim() || 'PNQ', to.trim() || 'GOI', validDate, Math.max(1, Number(travellers) || 1), cabin));
  };

  const holdingName = (cardId: string) => {
    const h = cards.find((c) => c.catalogId === cardId);
    return h ? `${h.bankName} ${h.cardName}` : catalog.byId.get(cardId)?.name ?? cardId;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Trip Planner</Text>
      <Text style={styles.sub}>Check a cash fare, compare the card return, and review each eligible airline programme separately. Award prices and seat availability are not live here.</Text>

      <Text style={styles.section}>POPULAR ROUTES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {POPULAR_ROUTES.map((r) => (
          <Pressable key={r.label} style={[styles.chip, from === r.from && to === r.to && styles.chipActive]} onPress={() => { setFrom(r.from); setTo(r.to); }}>
            <Text style={[styles.chipText, from === r.from && to === r.to && styles.chipTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.formCard}>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>From (airport code)</Text>
            <TextInput value={from} onChangeText={(v) => setFrom(v.toUpperCase())} autoCapitalize="characters" maxLength={3} style={styles.input} keyboardAppearance="dark" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>To</Text>
            <TextInput value={to} onChangeText={(v) => setTo(v.toUpperCase())} autoCapitalize="characters" maxLength={3} style={styles.input} keyboardAppearance="dark" />
          </View>
        </View>
        <View style={styles.row2}>
          <View style={{ flex: 1.4 }}>
            <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput value={date} onChangeText={setDate} style={styles.input} keyboardAppearance="dark" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Travellers</Text>
            <TextInput value={travellers} onChangeText={setTravellers} keyboardType="number-pad" style={styles.input} keyboardAppearance="dark" />
          </View>
        </View>
        <View style={styles.cabinRow}>
          {CABINS.map((c) => (
            <Pressable key={c.value} onPress={() => setCabin(c.value)} style={[styles.chip, cabin === c.value && styles.chipActive]}>
              <Text style={[styles.chipText, cabin === c.value && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.skyscanner} onPress={openSkyscanner}>
          <Text style={styles.skyscannerText}>Check real fares on Skyscanner ↗</Text>
        </Pressable>
        <Text style={styles.fieldLabel}>Fare per person you found (₹)</Text>
        <TextInput value={fare} onChangeText={setFare} keyboardType="number-pad" style={[styles.input, styles.fareInput]} keyboardAppearance="dark" />
        <Text style={styles.hint}>Total for {Math.max(1, Number(travellers) || 1)}: {inr(fareRs)}</Text>
      </View>

      {!plan && (
        <Pressable style={styles.empty} onPress={() => router.push('/add-card')}>
          <Text style={styles.emptyText}>Add your cards and points to see how to pay →</Text>
        </Pressable>
      )}

      {plan && (
        <>
          <Text style={styles.section}>OPTION 1 · PAY CASH WITH THE BEST CARD</Text>
          {plan.payCash ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>{holdingName(plan.payCash.card.id)}</Text>
              <Text style={styles.resultBig}>Earn about {inr(plan.payCash.netValue)}</Text>
              {plan.payCash.rewardUnit !== 'CASHBACK' && (
                <Text style={styles.resultSub}>{plan.payCash.pointsEarned.toLocaleString('en-IN')} {plan.payCash.rewardUnit === 'MILES' ? 'miles' : 'points'}</Text>
              )}
              <Text style={styles.resultSub}>{plan.payCash.reason}</Text>
            </View>
          ) : (
            <Text style={styles.sub}>None of your cards earns on travel.</Text>
          )}

          <Text style={styles.section}>AIRLINE PARTNER BALANCES · ESTIMATES</Text>
          {plan.pointsOptions.length === 0 ? (
            <Text style={styles.sub}>No eligible airline transfer route is recorded for the points in your Wallet. Cashback and unrelated reward currencies cannot be used as airline miles.</Text>
          ) : (
            plan.pointsOptions.map((p) => (
              <View key={p.id} style={styles.mixRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle}>{holdingName(p.cardId)}</Text>
                  <Text style={styles.resultSub}>
                    {p.route} · estimated ₹{p.rupeesPerPoint.toFixed(2)} per source point · {p.confidence.toLowerCase()} confidence
                    {p.ruleSource ? `\nTransfer rule source: ${p.ruleSource}` : ''}{p.ruleVerifiedAt ? ` · checked ${p.ruleVerifiedAt}` : ' · rule date unavailable'}
                    {p.source ? `\nValuation: ${p.source}` : ''}{p.verifiedAt ? ` · valued ${p.verifiedAt}` : ' · valuation has no verification date'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.mixPoints}>{p.pointsUsed.toLocaleString('en-IN')} pts held</Text>
                  <Text style={styles.resultSub}>≈ {inr(p.valueRs)} route value</Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Estimated value is not award-fare coverage</Text>
            <Text style={styles.summaryText}>This page does not know the actual award price, seat availability, taxes or fees. Only the airline quote can establish the points and net redemption value for this trip.</Text>
          </View>

          {plan.notes.map((n) => (
            <Text key={n} style={styles.note}>
              • {n}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  back: { paddingVertical: 8 },
  backText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 15, fontWeight: '600' },
  title: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
  sub: { fontFamily: typography.fontFamily, color: '#9A9A9A', fontSize: 14, marginTop: 8, lineHeight: 20 },
  section: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 26, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#121212' },
  chipActive: { borderColor: colors.accent.goldStart, backgroundColor: 'rgba(245,208,111,0.12)' },
  chipText: { fontFamily: typography.fontFamily, color: '#A0A0A0', fontSize: 13 },
  chipTextActive: { color: colors.accent.goldStart, fontWeight: '600' },
  formCard: { backgroundColor: '#111', borderRadius: 18, borderWidth: 1, borderColor: '#222', padding: 16, marginTop: 16, gap: 12 },
  row2: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 12, marginBottom: 6 },
  input: {
    fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 16, backgroundColor: '#181818',
    borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 12, paddingVertical: 10,
  },
  fareInput: { fontSize: 24, fontWeight: '700' },
  cabinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skyscanner: { borderWidth: 1, borderColor: '#0770E3', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(7,112,227,0.12)' },
  skyscannerText: { fontFamily: typography.fontFamily, color: '#6FB1FF', fontSize: 15, fontWeight: '600' },
  hint: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 12 },
  empty: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2A', marginTop: 20 },
  emptyText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14 },
  resultCard: { backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245,208,111,0.35)', padding: 16 },
  resultTitle: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 15, fontWeight: '600' },
  resultBig: { fontFamily: typography.fontFamily, color: '#54C78A', fontSize: 20, fontWeight: '700', marginTop: 6 },
  resultSub: { fontFamily: typography.fontFamily, color: '#9A9A9A', fontSize: 12, marginTop: 4, lineHeight: 17 },
  mixRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#222', padding: 14, marginBottom: 8, gap: 12 },
  mixPoints: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 16, fontWeight: '700' },
  summary: { borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1 },
  summaryShort: { borderColor: 'rgba(201,161,90,0.5)', backgroundColor: 'rgba(201,161,90,0.08)' },
  summaryOk: { borderColor: 'rgba(84,199,138,0.5)', backgroundColor: 'rgba(84,199,138,0.08)' },
  summaryTitle: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 16, fontWeight: '700' },
  summaryText: { fontFamily: typography.fontFamily, color: '#C0C0C0', fontSize: 13, marginTop: 6, lineHeight: 19 },
  note: { fontFamily: typography.fontFamily, color: '#7A7A7A', fontSize: 12, lineHeight: 18, marginTop: 10 },
});
