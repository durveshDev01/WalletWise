import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

import type { EnrichedPlace } from '../hooks/useBestCardLogic';
import type { CardData } from '../store/useCardStore';
import { colors, typography } from '../theme';
import type { MerchantCategory } from '../utils/merchantClassifier';
import { getRankedRecommendations } from '../utils/recommendationEngine';
import { CardArt } from './CardArt';

export type RankMode = 'Max Value' | 'Cashback';

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];
const CATEGORY_CHOICES: MerchantCategory[] = ['Dining', 'Grocery', 'Fuel', 'Electronics', 'Shopping', 'Travel', 'Pharmacy / Health', 'Entertainment', 'Unknown'];
const CATEGORY_LABEL = (c: MerchantCategory) => (c === 'Unknown' ? 'Other' : c);

const inr = (n: number) => `₹${n >= 100 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2).replace(/\.00$/, '')}`;

type Props = {
  place: EnrichedPlace;
  cards: CardData[];
  mode: RankMode;
  onClose: () => void;
};

/**
 * Everything for one place: how much you will pay, how you pay, and every card in
 * the wallet ranked by what it earns there. Powered by the engine (src/engine).
 */
export function PlacePanel({ place, cards, mode, onClose }: Props) {
  const router = useRouter();
  const [amountText, setAmountText] = useState('2000');
  const [upi, setUpi] = useState(false);
  const [category, setCategory] = useState<MerchantCategory>(place.category);
  const amount = Math.max(0, Number(amountText.replace(/[^0-9]/g, '')) || 0);

  const ranked = useMemo(() => {
    if (amount <= 0) return [];
    const list = getRankedRecommendations(place.normalizedName, category, cards, {
      amount,
      channel: upi ? 'UPI' : 'CARD',
    });
    // Transfer upsides are estimates. Cashback mode excludes point and mile rewards.
    const comparable = mode === 'Cashback' ? list.filter((result) => result.rewardUnit === 'CASHBACK') : list;
    return mode === 'Max Value' ? [...comparable].sort((a, b) => b.bestValue - a.bestValue || b.estimatedValue - a.estimatedValue) : comparable;
  }, [place.normalizedName, category, cards, amount, upi, mode]);

  const usableIds = new Set(ranked.map((r) => r.card.id));
  const unusable = cards.filter((c) => !usableIds.has(c.id));
  const distance = place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1)} km`;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Pressable onPress={onClose} style={styles.back}>
        <Text style={styles.backText}>← All places</Text>
      </Pressable>

      <Text style={styles.title}>{place.name}</Text>
      <Text style={styles.meta} numberOfLines={2}>
        {distance} away · {place.address}
      </Text>
      <Pressable
        onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${place.center[1]},${place.center[0]}`)}
        accessibilityRole="link"
        accessibilityLabel={`Directions to ${place.name}`}
        style={({ pressed }) => [styles.directions, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.directionsText}>Directions ↗</Text>
      </Pressable>

      {/* What kind of spend is this? The bank decides rewards by merchant category. */}
      <Text style={styles.label}>SPEND TYPE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {CATEGORY_CHOICES.map((c) => (
          <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}>
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{CATEGORY_LABEL(c)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.amountBox}>
        <Text style={styles.label}>AMOUNT TO PAY</Text>
        <View style={styles.amountRow}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            style={styles.amountInput}
            placeholder="2000"
            placeholderTextColor="#555"
            keyboardAppearance="dark"
          />
        </View>
        <View style={styles.chipRowWrap}>
          {QUICK_AMOUNTS.map((a) => (
            <Pressable key={a} onPress={() => setAmountText(String(a))} style={[styles.chip, amount === a && styles.chipActive]}>
              <Text style={[styles.chipText, amount === a && styles.chipTextActive]}>{inr(a)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.payRow}>
          {(['Card', 'UPI'] as const).map((m) => {
            const active = (m === 'UPI') === upi;
            return (
              <Pressable key={m} onPress={() => setUpi(m === 'UPI')} style={[styles.payOption, active && styles.payOptionActive]}>
                <Text style={[styles.payText, active && styles.chipTextActive]}>{m === 'Card' ? 'Tap or swipe card' : 'Pay by UPI (RuPay)'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.label}>YOUR CARDS · RANKED ({mode === 'Max Value' ? 'max estimated value' : 'cashback only'})</Text>
      {cards.length === 0 && (
        <Pressable style={styles.empty} onPress={() => router.push('/add-card')}>
          <Text style={styles.emptyText}>Add your cards to see which one to use here →</Text>
        </Pressable>
      )}

      {ranked.map((r, i) => {
        const unit = r.rewardUnit === 'CASHBACK' ? 'cashback' : r.rewardUnit === 'MILES' ? 'miles' : 'points';
        const earns = r.estimatedValue > 0;
        return (
          <Pressable
            key={r.card.id}
            onPress={() => router.push({ pathname: '/card-detail', params: { id: r.card.id } })}
            style={[styles.cardRow, i === 0 && earns && styles.cardRowBest]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.thumb}>
                <CardArt card={r.card} />
              </View>
              <View style={{ flex: 1 }}>
                {i === 0 && earns && <Text style={styles.bestBadge}>BEST CARD HERE</Text>}
                <Text style={styles.cardName} numberOfLines={1}>
                  {r.card.bankName} {r.card.cardName}
                </Text>
                <Text style={[styles.rate, !earns && styles.notEligible]}>
                  {earns ? `${r.effectiveRatePct}% value back` : 'No reward counted for this spend'}
                </Text>
              </View>
              <View style={styles.earnBox}>
                <Text style={[styles.earnBig, !earns && styles.notEligible]}>
                  {r.rewardUnit === 'CASHBACK' ? inr(r.estimatedValue) : r.pointsEarned.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.earnUnit}>{r.rewardUnit === 'CASHBACK' ? 'cashback' : unit}</Text>
              </View>
            </View>
            {r.rewardUnit !== 'CASHBACK' && earns && (
              <Text style={styles.detail}>
                Default-route estimate {inr(r.estimatedValue)}
                {r.bestValue > r.estimatedValue * 1.05 ? `; up to ${inr(r.bestValue)} on an estimated transfer route` : ''}
              </Text>
            )}
            <Text style={styles.warning}>Data confidence: {r.confidence.toLowerCase()}{r.verifiedAt ? ` · checked ${r.verifiedAt}` : ' · verification date unavailable'}{r.source ? ` · ${r.source}` : ''}</Text>
            {r.warnings.slice(0, 2).map((w) => (
              <Text key={w} style={styles.warning}>
                • {w}
              </Text>
            ))}
          </Pressable>
        );
      })}

      {unusable.map((c) => (
        <View key={c.id} style={[styles.cardRow, styles.cardRowDisabled]}>
          <View style={styles.cardTop}>
            <Text style={styles.rank}>–</Text>
            <View style={styles.thumb}>
              <CardArt card={c} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName} numberOfLines={1}>
                {c.bankName} {c.cardName}
              </Text>
              <Text style={styles.notEligible}>{upi ? 'Cannot be used on UPI (only RuPay credit cards can)' : 'Not usable for this payment'}</Text>
            </View>
          </View>
        </View>
      ))}

      <Text style={styles.footnote}>
        Values use each card&apos;s published rates and monthly caps. Points are valued at the bank&apos;s typical redemption value. Banks may code a
        merchant differently, so check your statement once.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 160 },
  back: { paddingVertical: 8 },
  backText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14, fontWeight: '600' },
  title: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  meta: { fontFamily: typography.fontFamily, color: '#9A9A9A', fontSize: 13, marginTop: 4, marginBottom: 8 },
  directions: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,208,111,0.4)', marginBottom: 12 },
  directionsText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14, fontWeight: '700' },
  label: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  chipRow: { gap: 8, paddingBottom: 8 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#121212' },
  chipActive: { borderColor: colors.accent.goldStart, backgroundColor: 'rgba(245,208,111,0.12)' },
  chipText: { fontFamily: typography.fontFamily, color: '#A0A0A0', fontSize: 13 },
  chipTextActive: { color: colors.accent.goldStart, fontWeight: '600' },
  amountBox: { backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#222', padding: 16, marginVertical: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  rupee: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 30, fontWeight: '300', marginRight: 4 },
  amountInput: { flex: 1, fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 34, fontWeight: '600', paddingVertical: 4 },
  payRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  payOption: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center' },
  payOptionActive: { borderColor: colors.accent.goldStart, backgroundColor: 'rgba(245,208,111,0.08)' },
  payText: { fontFamily: typography.fontFamily, color: '#A0A0A0', fontSize: 13 },
  empty: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2A' },
  emptyText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14 },
  cardRow: { backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#222', padding: 14, marginBottom: 10 },
  cardRowBest: { borderColor: 'rgba(245,208,111,0.5)', backgroundColor: 'rgba(245,208,111,0.05)' },
  cardRowDisabled: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 14, fontWeight: '700', width: 16, textAlign: 'center' },
  thumb: { width: 56, height: 36, borderRadius: 6, overflow: 'hidden' },
  bestBadge: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  cardName: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 15, fontWeight: '600' },
  rate: { fontFamily: typography.fontFamily, color: '#54C78A', fontSize: 12, marginTop: 2 },
  notEligible: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 12, marginTop: 2 },
  earnBox: { alignItems: 'flex-end' },
  earnBig: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 20, fontWeight: '700' },
  earnUnit: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 11 },
  detail: { fontFamily: typography.fontFamily, color: '#B0B0B0', fontSize: 12, marginTop: 8, marginLeft: 28 },
  warning: { fontFamily: typography.fontFamily, color: '#C9A15A', fontSize: 12, marginTop: 6, marginLeft: 28, lineHeight: 17 },
  footnote: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 11, lineHeight: 16, marginTop: 12 },
});
