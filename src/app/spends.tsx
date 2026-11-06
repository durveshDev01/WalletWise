import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Block, Button, Chip, Field, Heading, Label, Para, Screen, kitStyles } from '../components/screen/ScreenKit';
import { catalog } from '../data/catalog';
import { currentMonth, monthSummary, spendsInMonth, spendTrends } from '../engine/budget';
import { localIsoDate } from '../engine/billing';
import type { Category } from '../engine';
import { useCardStore } from '../store/useCardStore';
import { theme } from '../theme';

/** The same seven groups as Find My Card, so spends line up with the monthly budget there. */
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'GROCERY', label: 'Groceries' },
  { key: 'DINING', label: 'Food and dining' },
  { key: 'ONLINE_SHOPPING', label: 'Online shopping' },
  { key: 'UTILITY_BILLS', label: 'Bills and recharges' },
  { key: 'FUEL', label: 'Fuel' },
  { key: 'TRAVEL', label: 'Travel' },
  { key: 'DEFAULT', label: 'Everything else' },
];
const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Partial<Record<Category, string>>;

/** Whole rupees from ₹100, two decimals below it (₹82.50, not ₹82.5). */
const inr = (n: number) =>
  `₹${n >= 100 ? Math.round(n).toLocaleString('en-IN') : (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "20 Oct" from a YYYY-MM-DD date. */
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/** Budget with rewards: log spends by hand, see the month against your budget, rewards and cap use. */
export default function SpendsScreen() {
  const router = useRouter();
  const cards = useCardStore((s) => s.cards);
  const profile = useCardStore((s) => s.profile);
  const profileSaved = useCardStore((s) => s.profileSaved);
  const isDemo = useCardStore((s) => s.isDemo);
  const spends = useCardStore((s) => s.spends);
  const addSpend = useCardStore((s) => s.addSpend);
  const updateSpend = useCardStore((s) => s.updateSpend);
  const removeSpend = useCardStore((s) => s.removeSpend);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('GROCERY');
  const [pickedCard, setCardId] = useState<string | null>(null);
  // Falls back to the first card, also after the saved wallet loads or a card is removed.
  const cardId = pickedCard && cards.some((c) => c.id === pickedCard) ? pickedCard : (cards[0]?.id ?? null);
  const [online, setOnline] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'CARD' | 'UPI' | 'DEBIT' | 'CASH'>('CARD');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spendDate, setSpendDate] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [month, setMonth] = useState(currentMonth());

  const holdings = useMemo(() => cards.map((c) => ({ id: c.id, catalogId: c.catalogId, label: `${c.bankName} ${c.cardName}` })), [cards]);
  const summary = useMemo(
    () => monthSummary(catalog, spends, holdings, profile.monthlySpend, month, profile.experience),
    [spends, holdings, profile, month],
  );
  const recent = useMemo(() => spendsInMonth(spends, month).reverse().slice(0, 20), [spends, month]);
  const trends = useMemo(() => spendTrends(spends, month), [spends, month]);
  const cardLabel = (id: string) => holdings.find((h) => h.id === id)?.label ?? 'Removed card';

  const value = Number(amount.replace(/[^0-9.]/g, ''));
  const canAdd = value > 0 && (paymentMode !== 'CARD' || !!cardId);
  const add = () => {
    if (!canAdd || (paymentMode === 'CARD' && !cardId)) return;
    const date = localIsoDate(spendDate);
    const entry = { amount: Math.round(value * 100) / 100, category, cardId: paymentMode === 'CARD' ? cardId! : '', date, online: online || category === 'ONLINE_SHOPPING', paymentMode };
    if (editingId) updateSpend(editingId, entry); else addSpend(entry);
    setEditingId(null);
    setAmount('');
    setMonth(date.slice(0, 7));
  };

  const overBudget = summary.budgetTotal > 0 && summary.total > summary.budgetTotal;

  return (
    <Screen title="Spends" subtitle="Log what you spend by hand. Nothing is read from your SMS or email, and it all stays on this phone.">
      <Block>
        <Label>Add a spend</Label>
        <Field
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Amount in ₹"
          accessibilityLabel="Amount in rupees"
        />
        <View style={kitStyles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} />
          ))}
        </View>
        <Button kind="secondary" label={`Date: ${localIsoDate(spendDate)}`} onPress={() => { setCalendarMonth(spendDate); setDatePickerOpen(true); }} />
        {datePickerOpen && <Block>
          <View style={kitStyles.between}>
            <Button kind="secondary" label="‹" onPress={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} />
            <Heading>{calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Heading>
            <Button kind="secondary" label="›" onPress={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} />
          </View>
          <View style={kitStyles.wrap}>{Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }, (_, i) => <Text key={`blank-${i}`} style={styles.day}> </Text>)}{Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, i) => { const day = i + 1; const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day); const disabled = date > new Date(); return <Pressable key={day} disabled={disabled} onPress={() => { setSpendDate(date); setDatePickerOpen(false); }} accessibilityRole="button" accessibilityLabel={`Choose ${localIsoDate(date)}`}><Text style={[styles.day, disabled && styles.disabledDay]}>{day}</Text></Pressable>; })}</View>
        </Block>}
        <View style={kitStyles.wrap}>
          {(['CARD', 'UPI', 'DEBIT', 'CASH'] as const).map((mode) => <Chip key={mode} label={{ CARD: 'Credit card', UPI: 'UPI', DEBIT: 'Debit card', CASH: 'Cash' }[mode]} selected={paymentMode === mode} onPress={() => setPaymentMode(mode)} />)}
        </View>
        {paymentMode === 'CARD' && cards.length > 0 ? (
          <>
            <Label>Paid with</Label>
            <View style={kitStyles.wrap}>
              {cards.map((c) => (
                <Chip key={c.id} label={c.cardName} selected={cardId === c.id} onPress={() => setCardId(c.id)} />
              ))}
            </View>
          </>
        ) : paymentMode === 'CARD' ? (
          <Para muted>Add a card to your wallet first.</Para>
        ) : null}
        <View style={kitStyles.wrap}>
          {category !== 'ONLINE_SHOPPING' && <Chip label="Paid online" selected={online} onPress={() => setOnline((v) => !v)} />}
        </View>
        <Para muted>Only credit-card transactions are compared for rewards. UPI, debit, and cash entries count toward spending totals, not card rewards.</Para>
        <Button label={editingId ? 'Save spend' : 'Add spend'} onPress={add} disabled={!canAdd} />
        {isDemo && <Para muted>Sample cards remain in this comparison wallet. Remove them from Wallet when you are done.</Para>}
      </Block>

      <View style={kitStyles.between}>
        <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={12}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Heading>{monthName(month)}</Heading>
        <Pressable
          onPress={() => setMonth((m) => (m < currentMonth() ? shiftMonth(m, 1) : m))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={12}
        >
          <Text style={[styles.arrow, month >= currentMonth() && styles.arrowOff]}>›</Text>
        </Pressable>
      </View>

      <Block tone={overBudget ? 'warning' : 'plain'}>
        <Label>Spent this month</Label>
        <Text style={styles.big}>{inr(summary.total)}</Text>
        <Para muted>
          {summary.budgetTotal > 0
            ? `of ${inr(summary.budgetTotal)} monthly spend ${profileSaved ? 'you gave in Find My Card' : '(typical spend; set your own in Find My Card)'}`
            : 'Set your monthly spend in Find My Card to compare.'}
        </Para>
        {summary.budgetTotal > 0 && <Bar used={summary.total} total={summary.budgetTotal} />}
        {!profileSaved && <Button kind="secondary" label="Set my monthly spend" onPress={() => router.push('/find-card')} />}
      </Block>

      {summary.categories.length > 0 && (
        <Block>
          <Label>By category</Label>
          {summary.categories.map((c) => (
            <View key={c.category} style={styles.line}>
              <View style={kitStyles.between}>
                <Text style={[theme.text.body, kitStyles.value]}>{LABEL[c.category] ?? c.label}</Text>
                <Text style={theme.text.body}>
                  {inr(c.spent)}
                  {c.budget > 0 ? ` / ${inr(c.budget)}` : ''}
                </Text>
              </View>
              {c.budget > 0 && <Bar used={c.spent} total={c.budget} />}
            </View>
          ))}
        </Block>
      )}

      <Block>
        <Label>Rewards earned</Label>
        {summary.cards.length === 0 ? (
          <Para muted>No spends logged for this month yet.</Para>
        ) : (
          summary.cards.map((c) => (
            <View key={c.holdingId} style={kitStyles.between}>
              <View style={styles.flex}>
                <Text style={[theme.text.body, kitStyles.value]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={theme.text.caption}>
                  {inr(c.spent)} spent
                  {c.rewardUnit !== 'CASHBACK' && c.pointsEarned > 0 ? ` · about ${c.pointsEarned.toLocaleString('en-IN')} ${c.rewardUnit === 'MILES' ? 'miles' : 'points'}` : ''}
                </Text>
                {c.rewardsRs === 0 && (
                  <Text style={theme.text.caption}>No reward counted: the card may exclude this spend, or its top rate needs a named shop or brand.</Text>
                )}
              </View>
              <Text style={[theme.text.body, kitStyles.gold]}>≈ {inr(c.rewardsRs)}</Text>
            </View>
          ))
        )}
        <Para muted>Rewards are WalletWise estimates at each card’s typical point value, with monthly caps and common exclusions.</Para>
      </Block>

      {summary.caps.length > 0 && (
        <Block>
          <Label>Monthly reward caps used</Label>
          {summary.caps.map((c) => (
            <View key={`${c.holdingId}-${c.rowIndex}`} style={styles.line}>
              <View style={kitStyles.between}>
                <Text style={[theme.text.body, kitStyles.value, styles.flex]} numberOfLines={2}>
                  {c.cardLabel}: {c.label}
                </Text>
                <Text style={theme.text.body}>
                  {inr(c.usedRs)} / {inr(c.capRs)}
                </Text>
              </View>
              <Bar used={c.usedRs} total={c.capRs} />
              {c.usedRs >= c.capRs && <Text style={theme.text.caption}>Cap reached: more spend here earns only the base rate this month.</Text>}
            </View>
          ))}
        </Block>
      )}

      {trends ? (
        <Block>
          <Label>Spend Insights & Forecast</Label>
          <View style={styles.line}>
            <View style={kitStyles.between}>
              <Text style={theme.text.caption}>Projected this month</Text>
              <Text style={[theme.text.body, kitStyles.gold]}>≈ {inr(trends.projectedMonthTotal)}</Text>
            </View>
            <View style={kitStyles.between}>
              <Text style={theme.text.caption}>Historical monthly avg</Text>
              <Text style={theme.text.body}>{inr(trends.averageMonthlySpend)}</Text>
            </View>
            {trends.topCategory && (
              <View style={kitStyles.between}>
                <Text style={theme.text.caption}>Top spending category</Text>
                <Text style={theme.text.body}>{trends.topCategory.label} ({inr(trends.topCategory.spent)})</Text>
              </View>
            )}
            {trends.momChangePct !== null && (
              <View style={kitStyles.between}>
                <Text style={theme.text.caption}>Month-over-month trend</Text>
                <Text style={[theme.text.body, trends.momChangePct > 0 ? { color: '#E57373' } : { color: '#81C784' }]}>
                  {trends.momChangePct > 0 ? `+${trends.momChangePct}%` : `${trends.momChangePct}%`}
                </Text>
              </View>
            )}
          </View>
          <Para muted>{trends.assumptions[0]} {trends.assumptions[1]}</Para>
        </Block>
      ) : spends.length > 0 ? (
        <Block>
          <Label>Spend Insights & Forecast</Label>
          <Para muted>
            📊 Log transactions across two calendar months to unlock historical averages, category trends, and monthly forecasting.
          </Para>
        </Block>
      ) : null}

      <Block tone="gold">
        <Para strong>Never spend more just to reach a milestone or a fee waiver.</Para>
        <Para>
          A reward is worth having only on money you would spend anyway. Extra spending, or carrying a balance, costs more than any
          reward gives back.
        </Para>
      </Block>

      {recent.length > 0 && (
        <Block>
          <Label>Logged this month</Label>
          {recent.map((s) => (
            <View key={s.id} style={kitStyles.between}>
              <View style={styles.flex}>
                <Text style={[theme.text.body, kitStyles.value]}>
                  {inr(s.amount)} · {LABEL[s.category] ?? s.category}
                </Text>
                <Text style={theme.text.caption}>
                  {shortDate(s.date)} · {s.paymentMode === 'UPI' ? 'UPI' : s.paymentMode === 'DEBIT' ? 'debit' : s.paymentMode === 'CASH' ? 'cash' : cardLabel(s.cardId)}
                </Text>
              </View>
              <Pressable
                onPress={() => removeSpend(s.id)}
                accessibilityRole="button"
                accessibilityLabel={`Delete spend of ${inr(s.amount)} on ${shortDate(s.date)}`}
                hitSlop={12}
                style={styles.remove}
              >
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
              <Pressable onPress={() => { setEditingId(s.id); setAmount(String(s.amount)); setCategory(s.category); setCardId(s.cardId); setPaymentMode(s.paymentMode ?? 'CARD'); setOnline(!!s.online); setSpendDate(new Date(`${s.date}T12:00:00`)); }} accessibilityRole="button" accessibilityLabel={`Edit spend of ${inr(s.amount)}`}><Text style={styles.edit}>Edit</Text></Pressable>
            </View>
          ))}
        </Block>
      )}
    </Screen>
  );
}

function Bar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const over = used > total;
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${pct * 100}%` }, over && styles.fillOver]} />
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: theme.fontSize.hero, fontWeight: '300' },
  line: { gap: theme.spacing.xs },
  flex: { flex: 1 },
  arrow: { fontFamily: theme.fontFamily, color: theme.colors.gold, fontSize: 32, paddingHorizontal: theme.spacing.md },
  arrowOff: { color: theme.colors.borderStrong },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: theme.colors.gold },
  fillOver: { backgroundColor: theme.colors.warning },
  remove: { minWidth: theme.sizes.touch, minHeight: theme.sizes.touch, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: theme.colors.textMuted, fontSize: 16 },
  edit: { color: theme.colors.gold, padding: 8 },
  day: { minWidth: 36, padding: 8, color: theme.colors.textPrimary, textAlign: 'center' },
  disabledDay: { color: theme.colors.textMuted },
});
