import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardArt } from '../components/CardArt';
import { catalog, DATA_ATTRIBUTION } from '../data/catalog';
import { FIRST_CARD_MAX_FEE, recommendCards, recommendFirstCard } from '../engine';
import type { Card, Category, Experience, FirstCardPlan, PortfolioAdvice, RepaymentHabit, UserProfile } from '../engine';
import { isSampleHolding, useCardStore } from '../store/useCardStore';
import { colors, typography } from '../theme';

// The spend questions, in the order a beginner thinks about their month.
const SPEND_FIELDS: { key: Category; label: string; hint: string }[] = [
  { key: 'GROCERY', label: 'Groceries', hint: 'DMart, BigBasket, Blinkit, kirana' },
  { key: 'DINING', label: 'Food and dining', hint: 'Swiggy, Zomato, restaurants' },
  { key: 'ONLINE_SHOPPING', label: 'Online shopping', hint: 'Amazon, Flipkart, Myntra' },
  { key: 'UTILITY_BILLS', label: 'Bills and recharges', hint: 'Electricity, mobile, broadband' },
  { key: 'FUEL', label: 'Fuel', hint: 'Petrol and diesel' },
  { key: 'TRAVEL', label: 'Travel', hint: 'Flights, trains, hotels' },
  { key: 'DEFAULT', label: 'Everything else', hint: 'Shops, medicines, movies, cabs' },
];

const REPAYMENT: { value: RepaymentHabit; label: string }[] = [
  { value: 'ALWAYS_FULL', label: 'Always the full bill' },
  { value: 'SOMETIMES_MINIMUM', label: 'Sometimes only part' },
  { value: 'UNSURE', label: "I don't have a card yet" },
];

const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: 'NEW', label: 'New to cards' },
  { value: 'SOME', label: 'I use cards' },
  { value: 'ENTHUSIAST', label: 'I chase points' },
];

// How the user pays day to day. "Both" is counted as half by UPI (an assumption, shown in the UI).
const PAYMENT: { value: number; label: string }[] = [
  { value: 0, label: 'Card' },
  { value: 1, label: 'UPI' },
  { value: 0.5, label: 'Both' },
];

const YES_NO: { value: boolean; label: string }[] = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** The card's yearly fee in plain words, so a value figure is never mistaken for a fee. */
const feeLabel = (card: Card) =>
  card.lifetimeFree || card.annualFee === 0
    ? 'No annual fee'
    : card.annualFee == null
      ? 'Fee not published'
      : `Fee ${inr(card.annualFee)} + GST a year${card.feeWaiverSpend ? `, waived at ${inr(card.feeWaiverSpend)} spend` : ''}`;
const toNumber = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;

/**
 * Find My Card: a few questions about spending, income and repayment, then the
 * engine's portfolio module picks the best one or two cards, or says none is worth it.
 */
export default function FindCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, setProfile, holdings, isDemo, addCard } = useCardStore();

  const [spend, setSpend] = useState<Record<string, string>>(() =>
    Object.fromEntries(SPEND_FIELDS.map((f) => [f.key, String(profile.monthlySpend[f.key] ?? '')])),
  );
  const [income, setIncome] = useState(profile.monthlyIncome ? String(profile.monthlyIncome) : '');
  const [repayment, setRepayment] = useState<RepaymentHabit>(profile.repayment);
  const [experience, setExperience] = useState<Experience>(profile.experience);
  const [includeOwned, setIncludeOwned] = useState(!isDemo);
  const [advice, setAdvice] = useState<PortfolioAdvice | null>(null);
  const [upiShare, setUpiShare] = useState(profile.upiShare ?? 0);
  const [hasCreditHistory, setHasCreditHistory] = useState<boolean | undefined>(profile.hasCreditHistory);
  const [incomeProof, setIncomeProof] = useState<boolean | undefined>(profile.incomeProof);
  const [firstCard, setFirstCard] = useState<FirstCardPlan | null>(null);

  // A card counts as added once it is in the user's own wallet (not the sample cards).
  const realHoldings = holdings.filter((holding) => !isSampleHolding(holding));
  const inWallet = (catalogId: string) => realHoldings.some((h) => h.catalogId === catalogId);

  const monthlyTotal = useMemo(() => Object.values(spend).reduce((a, v) => a + toNumber(v), 0), [spend]);
  // The first-card questions appear for people without a card, or who say they have no credit history.
  const newToCredit = repayment === 'UNSURE' || hasCreditHistory === false;

  const run = () => {
    const next: UserProfile = {
      monthlySpend: Object.fromEntries(SPEND_FIELDS.map((f) => [f.key, toNumber(spend[f.key] ?? '')])),
      monthlyIncome: toNumber(income) || undefined,
      repayment,
      experience,
      preferCashback: experience === 'NEW',
      upiShare,
      hasCreditHistory,
      incomeProof,
    };
    setProfile(next);
    setFirstCard(newToCredit ? recommendFirstCard(catalog, next) : null);
    setAdvice(
      recommendCards(catalog, next, {
        ownedIds: includeOwned ? realHoldings.map((h) => h.catalogId) : [],
        maxNew: 2,
        candidateLimit: 20,
      }),
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Find My Card</Text>
      <Text style={styles.sub}>
        Tell us roughly what you spend in a month. We check all {catalog.cards.length} Indian cards and pick the best one or two after fees, using the spend you
        already have. Sometimes the honest answer is that no card is worth it yet.
      </Text>

      <Text style={styles.section}>MONTHLY SPENDING</Text>
      {SPEND_FIELDS.map((f) => (
        <View key={f.key} style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <Text style={styles.fieldHint}>{f.hint}</Text>
          </View>
          <View style={styles.moneyBox}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              value={spend[f.key]}
              onChangeText={(v) => setSpend((s) => ({ ...s, [f.key]: v }))}
              accessibilityLabel={`${f.label} a month in rupees`}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#555"
              style={styles.moneyInput}
              keyboardAppearance="dark"
            />
          </View>
        </View>
      ))}
      <Text style={styles.total}>Total {inr(monthlyTotal)} a month</Text>

      <Text style={styles.section}>MONTHLY INCOME (TAKE-HOME)</Text>
      <View style={[styles.moneyBox, { alignSelf: 'stretch' }]}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          value={income}
          onChangeText={setIncome}
          accessibilityLabel="Monthly take-home income in rupees"
          keyboardType="number-pad"
          placeholder="Used only to check card eligibility"
          placeholderTextColor="#555"
          style={styles.moneyInput}
          keyboardAppearance="dark"
        />
      </View>

      <Text style={styles.section}>HOW DO YOU PAY YOUR CARD BILL?</Text>
      <View style={styles.choiceRow}>
        {REPAYMENT.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => setRepayment(r.value)}
            style={[styles.choice, repayment === r.value && styles.choiceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: repayment === r.value }}>
            <Text style={[styles.choiceText, repayment === r.value && styles.choiceTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {repayment === 'UNSURE' && (
        <View style={styles.firstBox}>
          <Text style={styles.firstBoxTitle}>No credit history yet?</Text>
          <Text style={styles.fieldHint}>Two quick questions so we can show cards you can actually get.</Text>
          <Text style={styles.question}>Have you ever had a loan or a credit card?</Text>
          <View style={styles.choiceRow}>
            {YES_NO.map((o) => (
              <Pressable
                key={o.label}
                onPress={() => setHasCreditHistory(o.value)}
                style={[styles.choice, hasCreditHistory === o.value && styles.choiceActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: hasCreditHistory === o.value }}>
                <Text style={[styles.choiceText, hasCreditHistory === o.value && styles.choiceTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.question}>Can you show a salary slip or income tax return?</Text>
          <View style={styles.choiceRow}>
            {YES_NO.map((o) => (
              <Pressable
                key={o.label}
                onPress={() => setIncomeProof(o.value)}
                style={[styles.choice, incomeProof === o.value && styles.choiceActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: incomeProof === o.value }}>
                <Text style={[styles.choiceText, incomeProof === o.value && styles.choiceTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.section}>HOW DO YOU USUALLY PAY?</Text>
      <View style={styles.choiceRow}>
        {PAYMENT.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => setUpiShare(o.value)}
            style={[styles.choice, upiShare === o.value && styles.choiceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: upiShare === o.value }}>
            <Text style={[styles.choiceText, upiShare === o.value && styles.choiceTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      {upiShare > 0 && (
        <Text style={styles.fieldHint}>
          {upiShare < 1 ? 'We count half of your spending as paid by UPI. ' : ''}Only RuPay credit cards work on UPI, so UPI spending is counted only on those cards.
        </Text>
      )}

      <Text style={styles.section}>YOUR EXPERIENCE</Text>
      <View style={styles.choiceRow}>
        {EXPERIENCE.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => setExperience(r.value)}
            style={[styles.choice, experience === r.value && styles.choiceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: experience === r.value }}>
            <Text style={[styles.choiceText, experience === r.value && styles.choiceTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {realHoldings.length > 0 && (
        <Pressable onPress={() => setIncludeOwned((v) => !v)} style={styles.toggle} accessibilityRole="checkbox" accessibilityState={{ checked: includeOwned }}>
          <Text style={styles.choiceText}>{includeOwned ? '☑' : '☐'} Keep my {realHoldings.length} real cards and find what to add</Text>
        </Pressable>
      )}

      <Pressable style={styles.primary} onPress={run} disabled={monthlyTotal === 0} accessibilityRole="button" accessibilityState={{ disabled: monthlyTotal === 0 }}>
        <Text style={styles.primaryText}>{monthlyTotal === 0 ? 'Enter your spending first' : 'Find my best cards'}</Text>
      </Pressable>

      {firstCard && (
        <View style={{ marginTop: 28 }}>
          <Text style={styles.verdict}>Ways to get your first card</Text>
          <Text style={styles.sub}>Best option for you first. None of these cards has an annual fee above {inr(FIRST_CARD_MAX_FEE)} plus GST at your spending.</Text>
          {firstCard.warnings.map((w) => (
            <View key={w} style={[styles.warningBox, { marginTop: 12 }]}>
              <Text style={styles.warningText}>{w}</Text>
            </View>
          ))}
          {firstCard.routes.map((route, i) => (
            <View key={route.kind} style={[styles.route, i === 0 && styles.routeBest]}>
              {i === 0 && <Text style={styles.routeTag}>BEST FOR YOU</Text>}
              <Text style={styles.pickName}>{route.title}</Text>
              <Text style={styles.why}>{route.summary}</Text>
              {route.points.map((p) => (
                <Text key={p} style={styles.why}>
                  • {p}
                </Text>
              ))}
              {route.options.map((o) => (
                <View key={o.card.id} style={styles.routeOption}>
                  <View style={styles.altRow}>
                    <Text style={styles.altName}>{o.card.name}</Text>
                    <Text style={styles.altGain}>{o.valuePerYear > 0 ? `Earns ~${inr(o.valuePerYear)} a year` : 'Small rewards'}</Text>
                  </View>
                  {o.why.map((w) => (
                    <Text key={w} style={styles.whySmall}>
                      {w}
                    </Text>
                  ))}
                  {o.source && (
                    <Pressable onPress={() => WebBrowser.openBrowserAsync(o.source!)} accessibilityRole="link">
                      <Text style={styles.source}>Checked on the bank’s website on {o.verifiedAt} ↗</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {route.kind !== 'ADD_ON' && route.options.length === 0 && <Text style={styles.whySmall}>No card fits this route at your spending yet.</Text>}
            </View>
          ))}
          <Pressable style={[styles.secondary, { marginTop: 16, alignSelf: 'flex-start' }]} onPress={() => router.push('/build-credit')} accessibilityRole="button">
            <Text style={styles.secondaryText}>How to build your CIBIL score →</Text>
          </Pressable>
        </View>
      )}

      {advice && (
        <View style={{ marginTop: 28 }}>
          {firstCard && <Text style={styles.section}>ALL CARDS AT YOUR SPENDING</Text>}
          {advice.warnings.map((w) => (
            <View key={w} style={styles.warningBox}>
              <Text style={styles.warningText}>{w}</Text>
            </View>
          ))}
          <Text style={styles.verdict}>{advice.verdict === 'NONE' ? 'No new card for now' : 'Our pick for you'}</Text>
          <Text style={styles.sub}>{advice.explanation}</Text>

          {advice.picks.map((p) => (
            <View key={p.card.id} style={styles.pick}>
              <View style={styles.pickArt}>
                <CardArt card={{ catalogId: p.card.id }} small={false} />
              </View>
              <Text style={styles.pickName}>{p.card.name}</Text>
              <Text style={styles.pickGain}>Worth about {inr(p.gainPerYear)} a year to you, after fees</Text>
              <Text style={styles.feeLine}>{feeLabel(p.card)}</Text>
              {p.why.map((w) => (
                <Text key={w} style={styles.why}>
                  • {w}
                </Text>
              ))}
              <View style={styles.pickActions}>
                {inWallet(p.card.id) ? (
                  <Text style={styles.added} accessibilityLiveRegion="polite">✓ In your wallet</Text>
                ) : (
                  <Pressable
                    style={styles.secondary}
                    onPress={() => addCard(p.card.id, '', 0)}
                    accessibilityRole="button"
                    accessibilityLabel={`I have ${p.card.name}, add it to my wallet`}>
                    <Text style={styles.secondaryText}>I have it, add to wallet</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          {advice.alternatives.length > 0 && <Text style={styles.section}>OTHER STRONG OPTIONS</Text>}
          {advice.alternatives.length > 0 && (
            <Text style={styles.fieldHint}>The amount is what each card would earn you in a year at your spending, after its fee. It is not a fee.</Text>
          )}
          {advice.alternatives
            .filter((a) => !advice.picks.some((p) => p.card.id === a.card.id))
            .map((a) => (
              <View key={a.card.id} style={styles.altRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.altName} numberOfLines={1}>
                    {a.card.name}
                  </Text>
                  <Text style={styles.altFee}>{feeLabel(a.card)}</Text>
                </View>
                <Text style={styles.altGain}>{a.gainPerYear > 0 ? `Earns ~${inr(a.gainPerYear)} a year` : 'Small rewards'}</Text>
              </View>
            ))}
          <Text style={styles.disclaimer}>
            Estimates from published rates, caps and fees; not financial advice. Approval depends on the bank. Pay the full bill every month: interest costs far more
            than any reward. {DATA_ATTRIBUTION}
          </Text>
        </View>
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
  section: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 28, marginBottom: 10 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A', gap: 12 },
  fieldLabel: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 15, fontWeight: '600' },
  fieldHint: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 12, marginTop: 2 },
  moneyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 10, minWidth: 120 },
  rupee: { color: '#8A8A8A', fontSize: 16, marginRight: 4 },
  moneyInput: { flex: 1, fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 16, paddingVertical: 10 },
  total: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14, marginTop: 10, textAlign: 'right' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#121212' },
  choiceActive: { borderColor: colors.accent.goldStart, backgroundColor: 'rgba(245,208,111,0.1)' },
  choiceText: { fontFamily: typography.fontFamily, color: '#B0B0B0', fontSize: 14 },
  choiceTextActive: { color: colors.accent.goldStart, fontWeight: '600' },
  toggle: { marginTop: 20 },
  primary: { marginTop: 28, backgroundColor: colors.accent.goldStart, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontFamily: typography.fontFamily, color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
  warningBox: { backgroundColor: 'rgba(201,65,46,0.1)', borderColor: 'rgba(201,65,46,0.4)', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  warningText: { fontFamily: typography.fontFamily, color: '#E8A090', fontSize: 13, lineHeight: 19 },
  verdict: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 22, fontWeight: '700', marginTop: 8 },
  pick: { backgroundColor: '#111', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(245,208,111,0.35)', padding: 16, marginTop: 16 },
  pickArt: { width: '100%', aspectRatio: 1.586, borderRadius: 14, overflow: 'hidden', marginBottom: 14 },
  pickName: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 18, fontWeight: '700' },
  pickGain: { fontFamily: typography.fontFamily, color: '#54C78A', fontSize: 15, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  why: { fontFamily: typography.fontFamily, color: '#B0B0B0', fontSize: 13, lineHeight: 19, marginTop: 4 },
  pickActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  secondary: { borderWidth: 1, borderColor: colors.accent.goldStart, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 13, fontWeight: '600' },
  altRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A', gap: 12 },
  altName: { flex: 1, fontFamily: typography.fontFamily, color: '#D0D0D0', fontSize: 14 },
  altGain: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 13 },
  altFee: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 12, marginTop: 2 },
  added: { fontFamily: typography.fontFamily, color: '#6FCF97', fontSize: 14, fontWeight: '600', paddingVertical: 10 },
  feeLine: { fontFamily: typography.fontFamily, color: '#9A9A9A', fontSize: 13, marginTop: 4 },
  firstBox: { backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2A', padding: 14, marginTop: 16 },
  firstBoxTitle: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 16, fontWeight: '700' },
  question: { fontFamily: typography.fontFamily, color: '#D0D0D0', fontSize: 14, marginTop: 14, marginBottom: 8 },
  route: { backgroundColor: '#111', borderRadius: 18, borderWidth: 1, borderColor: '#2A2A2A', padding: 16, marginTop: 16 },
  routeBest: { borderColor: 'rgba(245,208,111,0.35)' },
  routeTag: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  routeOption: { marginTop: 10 },
  whySmall: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 12, lineHeight: 17, marginTop: 2 },
  source: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 12, marginTop: 4 },
  disclaimer: { fontFamily: typography.fontFamily, color: '#6F6F6F', fontSize: 11, lineHeight: 16, marginTop: 20 },
});
