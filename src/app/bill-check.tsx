import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import {
  Body,
  CardPicker,
  Chips,
  inr,
  Label,
  MoneyInput,
  MoneyScreen,
  Notes,
  Panel,
  StatRow,
  toNumber,
} from '../components/money/MoneyUi';
import { catalog } from '../data/catalog';
import { billDateInMonth } from '../engine/billing';
import { cardMonthlyRate, cashWithdrawalCost, DEFAULT_MIN_DUE_PCT, emiCost, revolvingCost, rewardsOnSpend } from '../engine';
import { useCardStore } from '../store/useCardStore';
import { theme } from '../theme';

type Mode = 'MIN' | 'EMI' | 'CASH';
const MODES: { value: Mode; label: string }[] = [
  { value: 'MIN', label: 'Minimum due' },
  { value: 'EMI', label: 'EMI' },
  { value: 'CASH', label: 'Cash withdrawal' },
];
const EMI_MONTHS = ['3', '6', '9', '12', '18', '24'] as const;
const CASH_DAYS = ['15', '30', '45', '60'] as const;

const monthsText = (m: number) => {
  const years = Math.floor(m / 12);
  const rest = m % 12;
  if (years === 0) return `${m} ${m === 1 ? 'month' : 'months'}`;
  return `${years} ${years === 1 ? 'year' : 'years'}${rest ? ` ${rest} ${rest === 1 ? 'month' : 'months'}` : ''}`;
};

/**
 * Bill check: what paying only the minimum, an EMI or a cash withdrawal really costs,
 * next to the rewards the same spend earns. All numbers come from src/engine/debt.ts.
 */
export default function BillCheckScreen() {
  const params = useLocalSearchParams<{ card?: string; tab?: string }>();
  const holdings = useCardStore((s) => s.holdings);
  const experience = useCardStore((s) => s.profile.experience);

  const [mode, setMode] = useState<Mode>(params.tab === 'EMI' || params.tab === 'CASH' ? params.tab : 'MIN');
  const [cardId, setCardId] = useState<string | null>(
    params.card && catalog.byId.has(params.card) ? params.card : holdings[0]?.catalogId ?? null,
  );
  const card = cardId ? catalog.byId.get(cardId) ?? null : null;
  const matchingHolding = holdings.find((holding) => holding.catalogId === cardId);
  const now = new Date();
  const cycleAnchorDay = matchingHolding?.dueDay ?? matchingHolding?.statementDay;
  const statementCycleDays = cycleAnchorDay
    ? Math.round((billDateInMonth(now.getFullYear(), now.getMonth() + 1, cycleAnchorDay).getTime() - billDateInMonth(now.getFullYear(), now.getMonth(), cycleAnchorDay).getTime()) / 86_400_000)
    : 30;
  const rate = cardMonthlyRate(card);
  const rateText = `${rate.pct}% a month${rate.source === 'ASSUMED' ? ' (assumed, this card does not publish a rate)' : ' (from card data)'}`;

  // Minimum due
  const [balance, setBalance] = useState('25000');
  const [minPct, setMinPct] = useState(String(DEFAULT_MIN_DUE_PCT));
  const [newSpend, setNewSpend] = useState('');
  // EMI
  const [price, setPrice] = useState('30000');
  const [emiRate, setEmiRate] = useState('16');
  const [emiMonths, setEmiMonths] = useState<(typeof EMI_MONTHS)[number]>('6');
  const [fee, setFee] = useState('199');
  const [discountLost, setDiscountLost] = useState('');
  // Cash
  const [cash, setCash] = useState('10000');
  const [days, setDays] = useState<(typeof CASH_DAYS)[number]>('30');

  // Cheap to compute, so no manual memoization (the React Compiler handles it).
  const cardRate = rate.source === 'ASSUMED' ? null : rate.pct;
  const minPctEdited = toNumber(minPct) !== DEFAULT_MIN_DUE_PCT;
  const minResult = revolvingCost({
    balance: toNumber(balance),
    aprMonthlyPct: cardRate,
    // Left out while it is the default, so the result labels it as assumed.
    minDuePct: minPctEdited && toNumber(minPct) > 0 ? toNumber(minPct) : undefined,
    newMonthlySpend: toNumber(newSpend),
    cycleDays: cycleAnchorDay ? statementCycleDays : undefined,
  });
  const emiResult = emiCost({
    price: toNumber(price),
    annualRatePct: toNumber(emiRate),
    months: Number(emiMonths),
    processingFee: toNumber(fee),
    discountLost: toNumber(discountLost),
  });
  const cashResult = cashWithdrawalCost({ amount: toNumber(cash), days: Number(days), aprMonthlyPct: cardRate });

  const rewardFor = (amount: number) => (card ? rewardsOnSpend(catalog, card, amount, { experience }) : 0);

  // Balance still owed after one year of minimum payments.
  const afterYear = minResult.schedule[11]?.closing;

  return (
    <MoneyScreen
      title="Bill check"
      sub="See in rupees what it costs to pay only the minimum, turn a purchase into EMI, or take cash on a credit card."
    >
      <View style={{ marginTop: theme.spacing.md }}>
        <Chips options={MODES} value={mode} onChange={setMode} />
      </View>

      <Label>WHICH CARD? (FOR THE INTEREST RATE)</Label>
      <CardPicker value={cardId} onChange={setCardId} />
      <Body style={styles.rate}>Interest: {rateText}</Body>
      <Body style={styles.rate}>
        {matchingHolding?.statementDay && matchingHolding.dueDay
          ? `Using your saved statement day ${matchingHolding.statementDay} and due day ${matchingHolding.dueDay}. The projection applies the actual calendar length between successive due dates (${statementCycleDays} days) using an annualized daily-rate approximation. Exact interest depends on transaction dates and issuer terms.`
          : cycleAnchorDay
            ? `Using saved ${matchingHolding?.dueDay ? 'due' : 'statement'} day ${cycleAnchorDay}; the projection uses ${statementCycleDays} calendar days per cycle with an annualized daily-rate approximation. Save both dates in card details for bill-cycle context.`
            : `Statement and due days are missing. Add them in card details. This estimate uses a 30-day cycle assumption and annualizes the monthly rate to calendar days. Exact interest depends on transaction dates and issuer terms.`}
      </Body>

      {mode === 'MIN' && (
        <>
          <Label>AMOUNT ON YOUR BILL</Label>
          <MoneyInput value={balance} onChangeText={setBalance} accessibilityLabel="Amount on your bill in rupees" />
          <Label>MINIMUM DUE {minPctEdited ? '' : '(ASSUMED 5%, CHANGE IT TO MATCH YOUR STATEMENT)'}</Label>
          <MoneyInput value={minPct} onChangeText={setMinPct} prefix="" suffix="% of the bill" accessibilityLabel="Minimum due percent" />
          <Label>NEW SPENDING ON THIS CARD EACH MONTH (OPTIONAL)</Label>
          <MoneyInput value={newSpend} onChangeText={setNewSpend} accessibilityLabel="New spending each month in rupees" />

          {toNumber(balance) > 0 && (
            <Panel tone={minResult.status === 'CLEARS' ? 'gold' : 'danger'}>
              <Text style={styles.headline}>
                {minResult.status === 'CLEARS'
                  ? `Paying only the minimum, it takes ${monthsText(minResult.months ?? 0)} to clear.`
                  : minResult.status === 'NEVER'
                    ? 'Paying only the minimum, this bill never gets paid off.'
                    : `Paying only the minimum, you still owe ${inr(minResult.remaining)} after 50 years.`}
              </Text>
              <StatRow label="First minimum payment" value={inr(minResult.firstPayment)} />
              <StatRow label="Interest + GST in the first month" value={inr(minResult.firstMonthInterest)} tone="danger" />
              <Body style={styles.plain}>{`Worked example: after the first minimum payment, ${inr(Math.max(0, toNumber(balance) - minResult.firstPayment))} × (${minResult.monthlyPct}% × 12) × ${minResult.cycleDays}/365 = about ${inr(minResult.schedule[0]?.interest ?? 0)} interest; 18% GST adds ${inr(minResult.schedule[0]?.gst ?? 0)}.`}</Body>
              {afterYear != null && minResult.status !== 'NEVER' && <StatRow label="Still owed after 12 months" value={inr(afterYear)} />}
              {minResult.status === 'CLEARS' && (
                <>
                  <StatRow label="Total interest" value={inr(minResult.totalInterest)} tone="danger" />
                  <StatRow label="GST on interest (18%)" value={inr(minResult.totalGst)} tone="danger" />
                  <StatRow label="Extra you pay in all" value={inr(minResult.extraCost)} tone="danger" strong />
                </>
              )}
              {minResult.status === 'NEVER' && (
                <Body style={styles.warn}>
                  {toNumber(newSpend) > 0
                    ? 'Your new spending plus interest is more than the minimum payment, so the balance keeps growing. Stop using this card until it is paid off.'
                    : 'At this minimum, the payment does not even cover the interest. RBI rules say the minimum due must cover it, so check the figure on your statement.'}
                </Body>
              )}
              {card && (
                <View style={styles.compare}>
                  <StatRow label={`Rewards this ${inr(toNumber(balance))} of spend earned`} value={inr(rewardFor(toNumber(balance)))} tone="good" />
                  <Body style={styles.plain}>
                    {minResult.status === 'CLEARS'
                      ? `The interest costs ${inr(minResult.extraCost)}, far more than the rewards. Pay the full bill if you can, even if it means using savings.`
                      : 'Rewards never make up for interest. Pay the full bill if you can.'}
                  </Body>
                </View>
              )}
              <Notes items={minResult.assumptions} />
            </Panel>
          )}
        </>
      )}

      {mode === 'EMI' && (
        <>
          <Label>PRICE OF THE PURCHASE</Label>
          <MoneyInput value={price} onChangeText={setPrice} accessibilityLabel="Price in rupees" />
          <Label>INTEREST RATE A YEAR (FROM THE EMI OFFER; 0 IF NONE)</Label>
          <MoneyInput value={emiRate} onChangeText={setEmiRate} prefix="" suffix="% a year" accessibilityLabel="Interest rate a year" />
          <Label>MONTHS</Label>
          <Chips options={EMI_MONTHS.map((m) => ({ value: m, label: m }))} value={emiMonths} onChange={setEmiMonths} />
          <Label>PROCESSING FEE</Label>
          <MoneyInput value={fee} onChangeText={setFee} accessibilityLabel="Processing fee in rupees" />
          <Label>DISCOUNT YOU LOSE BY TAKING EMI (OPTIONAL)</Label>
          <MoneyInput value={discountLost} onChangeText={setDiscountLost} accessibilityLabel="Discount lost in rupees" />

          {toNumber(price) > 0 && (
            <Panel tone={emiResult.trueExtraCost > 0 ? 'gold' : 'good'}>
              <Text style={styles.headline}>
                {inr(emiResult.emi)} a month for {emiResult.months} months
              </Text>
              <StatRow label="Interest" value={inr(emiResult.totalInterest)} tone={emiResult.totalInterest > 0 ? 'danger' : undefined} />
              <StatRow label="GST on interest (18%)" value={inr(emiResult.gstOnInterest)} />
              <StatRow label="Processing fee + GST" value={inr(emiResult.processingFee + emiResult.gstOnFee)} />
              {emiResult.discountLost > 0 && <StatRow label="Discount you give up" value={inr(emiResult.discountLost)} />}
              <StatRow label="True extra cost" value={inr(emiResult.trueExtraCost)} tone={emiResult.trueExtraCost > 0 ? 'danger' : 'good'} strong />
              {emiResult.noCostLabelWrong && (
                <Body style={styles.warn}>
                  This is not a &quot;no-cost&quot; EMI. RBI rules (2025 Directions, para 12(3)) say an EMI that charges interest cannot be called
                  zero-interest or no-cost. Ask for the interest and any discount in writing.
                </Body>
              )}
              {card && (
                <View style={styles.compare}>
                  <StatRow label="Rewards this purchase earns" value={inr(rewardFor(toNumber(price)))} tone="good" />
                  <Body style={styles.plain}>Some banks give no rewards on purchases turned into EMI. Check your card&apos;s terms.</Body>
                </View>
              )}
              <Notes items={emiResult.assumptions} />
            </Panel>
          )}
        </>
      )}

      {mode === 'CASH' && (
        <>
          <Label>CASH YOU WANT TO TAKE</Label>
          <MoneyInput value={cash} onChangeText={setCash} accessibilityLabel="Cash amount in rupees" />
          <Label>DAYS UNTIL YOU PAY IT BACK</Label>
          <Chips options={CASH_DAYS.map((d) => ({ value: d, label: `${d} days` }))} value={days} onChange={setDays} />

          {toNumber(cash) > 0 && (
            <Panel tone="danger">
              <Text style={styles.headline}>
                Taking {inr(toNumber(cash))} costs about {inr(cashResult.totalCost)} ({cashResult.costPct}% of it).
              </Text>
              <StatRow label="Withdrawal fee" value={inr(cashResult.fee)} />
              <StatRow label="GST on the fee" value={inr(cashResult.gstOnFee)} />
              <StatRow label={`Interest for ${days} days`} value={inr(cashResult.interest)} />
              <StatRow label="GST on interest" value={inr(cashResult.gstOnInterest)} />
              <StatRow label="Total cost" value={inr(cashResult.totalCost)} tone="danger" strong />
              <Body style={styles.plain}>
                Cash withdrawals usually earn no rewards. A UPI transfer from your bank account, or a small loan from family, is almost always cheaper.
              </Body>
              <Notes items={cashResult.assumptions} />
            </Panel>
          )}
        </>
      )}

      <Text style={styles.disclaimer}>
        Estimates to help you decide, not financial advice. Your bank&apos;s statement and schedule of charges are the final word.
      </Text>
    </MoneyScreen>
  );
}

const styles = StyleSheet.create({
  rate: { marginTop: theme.spacing.sm, fontSize: 13 },
  headline: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700', lineHeight: 24, marginBottom: theme.spacing.sm },
  warn: { color: theme.colors.danger, marginTop: theme.spacing.sm, fontSize: 14 },
  compare: { marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  plain: { fontSize: 14, marginTop: 4 },
  disclaimer: { ...theme.text.caption, fontWeight: '400', marginTop: theme.spacing.lg, lineHeight: 17 },
});
