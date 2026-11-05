import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catalog } from '../data/catalog';
import {
  planTripPayment,
  skyscannerUrl,
  resolveAirportCode,
  irctcSearchUrl,
  redbusSearchUrl,
  isDomesticSurfaceRoute,
} from '../engine';
import type { Card } from '../engine';
import { useCardStore } from '../store/useCardStore';
import { colors, typography } from '../theme';

const CABINS = [
  { value: 'economy', label: 'Economy' },
  { value: 'premiumeconomy', label: 'Premium economy' },
  { value: 'business', label: 'Business' },
] as const;

// Common Indian routes
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
 * Trip Planner: check real cash fares or operator schedules via external handoffs,
 * then see the best card to pay cash or cover it with airline points minus cash taxes.
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
  const [awardTaxes, setAwardTaxes] = useState('750');

  const travellerCount = Math.max(1, Number(travellers) || 1);
  const fareRs = (Number(fare.replace(/[^0-9]/g, '')) || 0) * travellerCount;
  const taxesPerPerson = Number(awardTaxes.replace(/[^0-9]/g, '')) || 0;
  const totalAwardTaxes = taxesPerPerson * travellerCount;

  const fromCode = resolveAirportCode(from) || from.trim().toUpperCase();
  const toCode = resolveAirportCode(to) || to.trim().toUpperCase();
  const isDomesticSurface = useMemo(() => isDomesticSurfaceRoute(from, to), [from, to]);

  const plan = useMemo(() => {
    const holdings = cards
      .map((c) => ({ card: catalog.byId.get(c.catalogId), points: c.points }))
      .filter((h): h is { card: Card; points: number } => !!h.card);
    if (fareRs <= 0 || holdings.length === 0) return null;
    return planTripPayment(catalog, holdings, fareRs, {
      experience: profile.experience,
      kind: 'FLIGHT',
      awardTaxesRs: totalAwardTaxes,
    });
  }, [cards, profile, fareRs, totalAwardTaxes]);

  const openSkyscanner = () => {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : defaultDate();
    Linking.openURL(skyscannerUrl(fromCode, toCode, validDate, travellerCount, cabin));
  };

  const openIrctc = () => {
    Linking.openURL(irctcSearchUrl());
  };

  const openRedBus = () => {
    Linking.openURL(redbusSearchUrl(from, to));
  };

  const holdingName = (cardId: string) => {
    const h = cards.find((c) => c.catalogId === cardId);
    return h ? `${h.bankName} ${h.cardName}` : catalog.byId.get(cardId)?.name ?? cardId;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 60,
        paddingHorizontal: 20,
      }}
    >
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Trip Planner</Text>
      <Text style={styles.sub}>
        Compare paying cash with your best card vs redeeming airline points. External searches hand off to operators for real-time fares and seat availability.
      </Text>

      {/* Transparent Handoff Disclaimer */}
      <View style={styles.disclaimerCard}>
        <Text style={styles.disclaimerBadge}>TRANSPARENT EXTERNAL HANDOFF</Text>
        <Text style={styles.disclaimerText}>
          Award seat availability, airline taxes, and live ticket prices are verified on booking portals. Point values below are route estimates and balances from different programmes are never pooled.
        </Text>
      </View>

      <Text style={styles.section}>POPULAR ROUTES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {POPULAR_ROUTES.map((r) => (
          <Pressable
            key={r.label}
            style={[styles.chip, fromCode === r.from && toCode === r.to && styles.chipActive]}
            onPress={() => {
              setFrom(r.from);
              setTo(r.to);
            }}
          >
            <Text style={[styles.chipText, fromCode === r.from && toCode === r.to && styles.chipTextActive]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.formCard}>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>From (City or Code)</Text>
            <TextInput
              value={from}
              onChangeText={setFrom}
              placeholder="e.g. Pune or PNQ"
              placeholderTextColor="#555"
              style={styles.input}
              keyboardAppearance="dark"
            />
            {fromCode ? <Text style={styles.resolvedHint}>Airport code: {fromCode}</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>To (City or Code)</Text>
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder="e.g. Goa or GOI"
              placeholderTextColor="#555"
              style={styles.input}
              keyboardAppearance="dark"
            />
            {toCode ? <Text style={styles.resolvedHint}>Airport code: {toCode}</Text> : null}
          </View>
        </View>

        <View style={styles.row2}>
          <View style={{ flex: 1.4 }}>
            <Text style={styles.fieldLabel}>Travel Date (YYYY-MM-DD)</Text>
            <TextInput value={date} onChangeText={setDate} style={styles.input} keyboardAppearance="dark" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Travellers</Text>
            <TextInput
              value={travellers}
              onChangeText={setTravellers}
              keyboardType="number-pad"
              style={styles.input}
              keyboardAppearance="dark"
            />
          </View>
        </View>

        <View style={styles.cabinRow}>
          {CABINS.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCabin(c.value)}
              style={[styles.chip, cabin === c.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, cabin === c.value && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Cash fare per person you found (₹)</Text>
        <TextInput
          value={fare}
          onChangeText={setFare}
          keyboardType="number-pad"
          style={[styles.input, styles.fareInput]}
          keyboardAppearance="dark"
        />
        <Text style={styles.hint}>Total cash fare for {travellerCount}: {inr(fareRs)}</Text>

        <Text style={styles.fieldLabel}>Estimated award taxes/fees per person (₹)</Text>
        <TextInput
          value={awardTaxes}
          onChangeText={setAwardTaxes}
          keyboardType="number-pad"
          placeholder="e.g. 750"
          placeholderTextColor="#555"
          style={styles.input}
          keyboardAppearance="dark"
        />
        <Text style={styles.hint}>
          Airlines charge cash taxes/fuel surcharges on award tickets (Total for {travellerCount}: {inr(totalAwardTaxes)}).
        </Text>
      </View>

      {/* External Transport Handoffs */}
      <Text style={styles.section}>CHECK REAL OPERATOR FARES (EXTERNAL HANDOFFS)</Text>
      <View style={styles.handoffContainer}>
        <Pressable style={styles.skyscanner} onPress={openSkyscanner}>
          <Text style={styles.skyscannerText}>✈ Check real flights on Skyscanner ↗</Text>
        </Pressable>
        {isDomesticSurface && (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.fieldLabel, { marginBottom: 6 }]}>Domestic surface alternatives</Text>
            <View style={styles.row2}>
              <Pressable style={[styles.handoffBtn, { borderColor: '#E06A3B', backgroundColor: 'rgba(224,106,59,0.1)' }]} onPress={openIrctc}>
                <Text style={[styles.handoffText, { color: '#FFA07A' }]}>🚆 IRCTC Trains ↗</Text>
              </Pressable>
              <Pressable style={[styles.handoffBtn, { borderColor: '#D84E55', backgroundColor: 'rgba(216,78,85,0.1)' }]} onPress={openRedBus}>
                <Text style={[styles.handoffText, { color: '#FF7F85' }]}>🚌 redBus Intercity ↗</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {!plan && (
        <Pressable style={styles.empty} onPress={() => router.push('/add-card')}>
          <Text style={styles.emptyText}>Add your cards and points to compare payment options →</Text>
        </Pressable>
      )}

      {plan && (
        <>
          <Text style={styles.section}>OPTION 1 · PAY CASH WITH THE BEST CARD</Text>
          {plan.payCash ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>{holdingName(plan.payCash.card.id)}</Text>
              <Text style={styles.resultBig}>Earn about {inr(plan.payCash.netValue)} net return</Text>
              {plan.payCash.rewardUnit !== 'CASHBACK' && (
                <Text style={styles.resultSub}>
                  {plan.payCash.pointsEarned.toLocaleString('en-IN')}{' '}
                  {plan.payCash.rewardUnit === 'MILES' ? 'miles' : 'points'}
                </Text>
              )}
              <Text style={styles.resultSub}>{plan.payCash.reason}</Text>
            </View>
          ) : (
            <Text style={styles.sub}>None of your cards earns rewards on travel spending.</Text>
          )}

          <Text style={styles.section}>OPTION 2 · AIRLINE PROGRAMME TRANSFER VALUES</Text>
          {plan.pointsOptions.length === 0 ? (
            <Text style={styles.sub}>
              No eligible airline transfer partner is available for the points in your Wallet. Cashback and unrelated bank reward currencies cannot be used as airline miles.
            </Text>
          ) : (
            plan.pointsOptions.map((p) => (
              <View key={p.id} style={styles.mixRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle}>{holdingName(p.cardId)}</Text>
                  <Text style={styles.resultSub}>
                    {p.route} · estimated ₹{p.rupeesPerPoint.toFixed(2)}/pt · {p.confidence.toLowerCase()} confidence
                    {p.ruleSource ? `\nRule: ${p.ruleSource}` : ''}
                    {p.ruleVerifiedAt ? ` (${p.ruleVerifiedAt})` : ''}
                  </Text>
                  {p.awardTaxesRs > 0 && (
                    <Text style={[styles.resultSub, { color: '#E57373', marginTop: 4 }]}>
                      Taxes & fees: -{inr(p.awardTaxesRs)}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.mixPoints}>{p.pointsUsed.toLocaleString('en-IN')} pts</Text>
                  <Text style={styles.grossValue}>Gross: {inr(p.valueRs)}</Text>
                  <Text style={styles.netValue}>Net: {inr(p.netValueRs)}</Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Important Transfer & Redemption Reminders</Text>
            <Text style={styles.summaryText}>
              Point values shown are route estimates based on average award redemptions. Award seats require live confirmation with the respective airline before transferring non-reversible points.
            </Text>
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
  disclaimerCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 12,
    marginTop: 14,
  },
  disclaimerBadge: {
    fontFamily: typography.fontFamily,
    color: colors.accent.goldStart,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  disclaimerText: {
    fontFamily: typography.fontFamily,
    color: '#8E8E8E',
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    fontFamily: typography.fontFamily,
    color: '#6F6F6F',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 26,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#121212',
  },
  chipActive: {
    borderColor: colors.accent.goldStart,
    backgroundColor: 'rgba(245,208,111,0.12)',
  },
  chipText: { fontFamily: typography.fontFamily, color: '#A0A0A0', fontSize: 13 },
  chipTextActive: { color: colors.accent.goldStart, fontWeight: '600' },
  formCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  row2: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 12, marginBottom: 4 },
  resolvedHint: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 11, marginTop: 4 },
  input: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 15,
    backgroundColor: '#181818',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fareInput: { fontSize: 22, fontWeight: '700' },
  cabinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  handoffContainer: { gap: 10 },
  skyscanner: {
    borderWidth: 1,
    borderColor: '#0770E3',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(7,112,227,0.12)',
  },
  skyscannerText: {
    fontFamily: typography.fontFamily,
    color: '#6FB1FF',
    fontSize: 14,
    fontWeight: '600',
  },
  handoffBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  handoffText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 12, marginTop: -4 },
  empty: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2A', marginTop: 20 },
  emptyText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14 },
  resultCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,208,111,0.35)',
    padding: 16,
  },
  resultTitle: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 15, fontWeight: '600' },
  resultBig: { fontFamily: typography.fontFamily, color: '#54C78A', fontSize: 20, fontWeight: '700', marginTop: 6 },
  resultSub: { fontFamily: typography.fontFamily, color: '#9A9A9A', fontSize: 12, marginTop: 4, lineHeight: 17 },
  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  mixPoints: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 15, fontWeight: '700' },
  grossValue: { fontFamily: typography.fontFamily, color: '#888', fontSize: 11, marginTop: 2 },
  netValue: { fontFamily: typography.fontFamily, color: '#54C78A', fontSize: 13, fontWeight: '700', marginTop: 2 },
  summary: {
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,161,90,0.35)',
    backgroundColor: 'rgba(201,161,90,0.06)',
  },
  summaryTitle: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 15, fontWeight: '700' },
  summaryText: { fontFamily: typography.fontFamily, color: '#A0A0A0', fontSize: 12, marginTop: 6, lineHeight: 18 },
  note: { fontFamily: typography.fontFamily, color: '#7A7A7A', fontSize: 12, lineHeight: 18, marginTop: 10 },
});
