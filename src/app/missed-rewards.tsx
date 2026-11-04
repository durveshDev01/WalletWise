import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Chips, inr, Label, LinkButton, MoneyInput, MoneyScreen, Panel, PrimaryButton, StatRow, toNumber } from '../components/money/MoneyUi';
import { catalog, DATA_ATTRIBUTION } from '../data/catalog';
import { missedRewards } from '../engine';
import type { Card, Category } from '../engine';
import { useCardStore } from '../store/useCardStore';
import { theme } from '../theme';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'GROCERY', label: 'Groceries' },
  { value: 'DINING', label: 'Food' },
  { value: 'ONLINE_SHOPPING', label: 'Online shopping' },
  { value: 'UTILITY_BILLS', label: 'Bills' },
  { value: 'FUEL', label: 'Fuel' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'DEFAULT', label: 'Other' },
];

type SpendDraft = { amount: string; category: Category; merchant: string; online: 'YES' | 'NO'; usedCardId: string };

/**
 * Missed-rewards check: a few recent spends and the card used for each, then how much
 * more the best card in the wallet would have earned (same ranking as Best Card).
 */
export default function MissedRewardsScreen() {
  const router = useRouter();
  const holdings = useCardStore((s) => s.holdings);
  const ledger = useCardStore((s) => s.spends);
  const experience = useCardStore((s) => s.profile.experience);
  const sampleWallet = useCardStore((s) => s.isDemo);
  const walletCards = holdings.map((h) => catalog.byId.get(h.catalogId)).filter((c): c is Card => !!c);
  const firstCard = walletCards[0]?.id ?? '';

  const [spends, setSpends] = useState<SpendDraft[]>([{ amount: '', category: 'GROCERY', merchant: '', online: 'NO', usedCardId: firstCard }]);
  const [checked, setChecked] = useState(false);
  const update = (i: number, changes: Partial<SpendDraft>) => {
    setChecked(false);
    setSpends((list) => list.map((s, j) => (j === i ? { ...s, ...changes } : s)));
  };

  if (walletCards.length === 0) {
    return (
      <MoneyScreen title="Missed rewards" sub="This check compares the cards in your wallet, so it needs at least two cards.">
        <PrimaryButton label="Add a card" onPress={() => router.push('/add-card')} />
      </MoneyScreen>
    );
  }

  const valid = spends.filter((s) => toNumber(s.amount) > 0 && s.usedCardId);
  const result = missedRewards(
    catalog,
    walletCards,
    valid.map((s) => ({ amount: toNumber(s.amount), category: s.category, merchant: s.merchant, online: s.online === 'YES', usedCardId: s.usedCardId })),
    { experience },
  );
  const cardOptions = walletCards.map((c) => ({ value: c.id, label: c.name }));

  return (
    <MoneyScreen
      title="Missed rewards"
      sub={`Enter recent spends and the card you used. We compare eligible cards in your wallet; ties are shown as ties.`}
    >
      {sampleWallet && <Body style={styles.small}>This wallet includes sample comparison cards. Remove the samples in Wallet before relying on a real-wallet comparison.</Body>}
      {ledger.some((spend) => !spend.paymentMode || spend.paymentMode === 'CARD') && <LinkButton label="Load eligible credit-card spends from my ledger" onPress={() => {
        const rows = ledger.filter((spend) => !spend.paymentMode || spend.paymentMode === 'CARD').flatMap((spend) => {
          const holding = holdings.find((h) => h.id === spend.cardId);
          return holding && walletCards.some((card) => card.id === holding.catalogId) ? [{ amount: String(spend.amount), category: spend.category, merchant: '', online: spend.online ? 'YES' as const : 'NO' as const, usedCardId: holding.catalogId }] : [];
        });
        if (rows.length) { setSpends(rows); setChecked(false); }
      }} />}
      {spends.map((s, i) => (
        <Panel key={i}>
          <View style={styles.spendTop}>
            <Text style={styles.spendTitle}>Spend {i + 1}</Text>
            {spends.length > 1 && (
              <Pressable
                onPress={() => {
                  setChecked(false);
                  setSpends((list) => list.filter((_, j) => j !== i));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove spend ${i + 1}`}
                hitSlop={10}
              >
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            )}
          </View>
          <Label>AMOUNT</Label>
          <MoneyInput value={s.amount} onChangeText={(v) => update(i, { amount: v })} accessibilityLabel={`Amount of spend ${i + 1}`} />
          <Label>WHAT WAS IT?</Label>
          <Chips options={CATEGORIES} value={s.category} onChange={(category) => update(i, { category })} />
          <Label>WHERE? (OPTIONAL, E.G. BPCL, SWIGGY, AMAZON)</Label>
          <TextInput
            value={s.merchant}
            onChangeText={(merchant) => update(i, { merchant })}
            placeholder="Shop or app name"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            keyboardAppearance="dark"
            accessibilityLabel={`Shop for spend ${i + 1}`}
          />
          <Text style={styles.hint}>Many card rates only apply at one brand, so this makes the check more accurate.</Text>
          <Label>PAID ONLINE OR IN AN APP?</Label>
          <Chips
            options={[
              { value: 'NO', label: 'No, in a shop' },
              { value: 'YES', label: 'Yes, online' },
            ]}
            value={s.online}
            onChange={(online) => update(i, { online })}
          />
          <Label>CARD YOU USED</Label>
          <Chips options={cardOptions} value={s.usedCardId} onChange={(usedCardId) => update(i, { usedCardId })} />
        </Panel>
      ))}

      {(
        <LinkButton
          label="+ Add another spend"
          onPress={() => setSpends((list) => [...list, { amount: '', category: 'DEFAULT', merchant: '', online: 'NO', usedCardId: firstCard }])}
        />
      )}

      <PrimaryButton label={valid.length > 0 ? 'Check my rewards' : 'Enter an amount first'} onPress={() => setChecked(true)} disabled={valid.length === 0} />

      {checked && result.rows.length > 0 && (
        <>
          <Panel tone={result.totalMissed > 0 ? 'gold' : 'good'}>
            <Text style={styles.headline}>
          {walletCards.length === 1 ? 'This is your only card, so there is no alternative-card comparison.' : result.totalMissed > 0
                ? `You could have earned ${inr(result.totalMissed)} more on these ${result.rows.length} spends.`
                : 'You used your best card every time. Nice.'}
            </Text>
            <StatRow label="You earned" value={inr(result.totalEarned)} />
            <StatRow label="Best cards would have earned" value={inr(result.totalBest)} tone="good" />
          </Panel>
          {result.rows.map((r, i) => (
            <Panel key={i}>
              <Text style={styles.spendTitle}>
                {inr(r.spend.amount)} · {CATEGORIES.find((c) => c.value === r.spend.category)?.label}
              </Text>
              <StatRow label={`${r.usedCard?.name ?? 'Your card'} earned`} value={inr(r.earned)} />
              {walletCards.length === 1 ? <Body style={styles.small}>Benchmark: this card’s eligible reward under catalog rules. No other card is available to compare.</Body> : r.missed > 0 && r.bestCard ? (
                <>
                  <StatRow label={`${r.bestCard.name} would have earned`} value={inr(r.bestEarned)} tone="good" />
                  {r.tiedBestCards.length > 1 && <Body style={styles.small}>Tie: {r.tiedBestCards.map((card) => card.name).join(', ')} earn the same estimated amount.</Body>}
                  <StatRow label="You missed" value={inr(r.missed)} tone="gold" strong />
                  <Body style={styles.small}>{r.reason}</Body>
                </>
              ) : (
                <Body style={styles.small}>This was already your best card for this spend.</Body>
              )}
            </Panel>
          ))}
          <LinkButton label="Pick the right card next time → Best Card map" onPress={() => router.push('/map')} />
        </>
      )}

      <Text style={styles.disclaimer}>
        Rewards at each card&apos;s default redemption value, using published rates. Monthly caps you had already used are not known, so real
        figures can be lower. {DATA_ATTRIBUTION}
      </Text>
    </MoneyScreen>
  );
}

const styles = StyleSheet.create({
  spendTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  spendTitle: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  remove: { fontFamily: theme.fontFamily, color: theme.colors.danger, fontSize: 14, fontWeight: '600' },
  headline: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700', lineHeight: 24, marginBottom: theme.spacing.sm },
  small: { fontSize: 13, marginTop: 6 },
  input: {
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
  hint: { ...theme.text.caption, fontWeight: '400', marginTop: 4 },
  disclaimer: { ...theme.text.caption, fontWeight: '400', marginTop: theme.spacing.lg, lineHeight: 17 },
});
