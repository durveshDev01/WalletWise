import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { progressFor } from '../components/home/GoalCard';
import { Body, Chips, inr, Label, MoneyInput, MoneyScreen, Panel, PrimaryButton, StatRow, toNumber } from '../components/money/MoneyUi';
import { catalog } from '../data/catalog';
import { useCardStore } from '../store/useCardStore';
import type { Goal } from '../store/useCardStore';
import { theme } from '../theme';

// Quick names, because goals are not only trips.
const IDEAS = ['Trip', 'New phone', 'Diwali gifts', 'Bill credit', 'Wedding gift'];

/**
 * Points goals: a rupee target paid for with the points on chosen cards. Progress uses
 * each card's default route separately (no pooling); months to go use the strongest
 * single-card estimate from normal spending, never extra spend.
 */
export default function GoalScreen() {
  const goals = useCardStore((s) => s.goals) ?? [];
  const holdings = useCardStore((s) => s.holdings);
  const profile = useCardStore((s) => s.profile);
  const profileSaved = useCardStore((s) => s.profileSaved);
  const addGoal = useCardStore((s) => s.addGoal);
  const removeGoal = useCardStore((s) => s.removeGoal);

  const [adding, setAdding] = useState(goals.length === 0);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const save = () => {
    addGoal({ name: name.trim() || 'My goal', targetRs: toNumber(target), holdingIds: picked });
    setName('');
    setTarget('');
    setPicked([]);
    setAdding(false);
  };
  const confirmRemove = (g: Goal) =>
    Alert.alert('Remove goal?', `"${g.name}" will be removed. Your points are not touched.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeGoal(g.id) },
    ]);

  return (
    <MoneyScreen title="Points goals" sub="Save your points for something you want: a trip, a phone, Diwali gifts or a bill credit.">
      {goals.map((g) => {
        const p = progressFor(g, holdings, profile);
        const pct = Math.round(p.progress * 100);
        const cardNames =
          g.holdingIds.length === 0
            ? 'All your cards'
            : holdings
                .filter((h) => g.holdingIds.includes(h.id))
                .map((h) => h.cardName)
                .join(', ') || 'Cards no longer in your wallet';
        return (
          <Panel key={g.id} tone={p.shortfallRs === 0 ? 'good' : 'gold'}>
            <View style={styles.goalTop}>
              <Text style={styles.goalName}>{g.name}</Text>
              <Pressable onPress={() => confirmRemove(g)} accessibilityRole="button" accessibilityLabel={`Remove goal ${g.name}`} hitSlop={10}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(2, pct)}%` }]} />
            </View>
            <StatRow label="Target" value={inr(p.targetRs)} />
            <StatRow label="Best one-card default-route value" value={inr(p.safeRs)} tone="gold" />
            {p.bestRs > p.safeRs && <StatRow label="Best one-card estimated route" value={`up to ${inr(p.bestRs)}`} />}
            <StatRow label="Still needed" value={p.shortfallRs === 0 ? 'Reached!' : inr(p.shortfallRs)} tone={p.shortfallRs === 0 ? 'good' : undefined} />
            {p.shortfallRs > 0 && (
              <StatRow
                label="At your normal spending"
                value={p.monthsToGoal != null ? `about ${p.monthsToGoal} months (${inr(p.monthlyRewardRs)} a month)` : 'not enough data'}
              />
            )}
            <Body style={styles.small}>Counting: {cardNames}</Body>
            {p.perCard.map((cardValue) => (
              <Body key={cardValue.cardId} style={styles.small}>
                {catalog.byId.get(cardValue.cardId)?.name ?? cardValue.cardId}: {inr(cardValue.safeRs)} via {cardValue.defaultRoute} ({cardValue.confidence.toLowerCase()} confidence{cardValue.verifiedAt ? `; checked ${cardValue.verifiedAt}` : '; date unavailable'}{cardValue.source ? `; ${cardValue.source}` : '; source unavailable'}).
              </Body>
            ))}
            {p.shortfallRs === 0 && (
              <Body style={styles.small}>
                Open the card&apos;s Redeem tab to find the best way to use the points, and check the offer with &quot;Is this redemption good?&quot;.
              </Body>
            )}
          </Panel>
        );
      })}

      {adding ? (
        <Panel>
          <Text style={styles.goalName}>New goal</Text>
          <Label>WHAT ARE YOU SAVING FOR?</Label>
          <Chips options={IDEAS.map((i) => ({ value: i, label: i }))} value={name} onChange={setName} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Or type a name"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            keyboardAppearance="dark"
            accessibilityLabel="Goal name"
          />
          <Label>HOW MUCH DOES IT COST?</Label>
          <MoneyInput value={target} onChangeText={setTarget} accessibilityLabel="Goal amount in rupees" />
          <Label>WHICH CARDS&apos; POINTS COUNT? (NONE PICKED = ALL)</Label>
          {holdings.length > 0 ? (
            <Chips
              options={holdings.map((h) => ({ value: h.id, label: catalog.byId.get(h.catalogId)?.name ?? h.cardName }))}
              value={picked}
              onChange={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
            />
          ) : (
            <Body>Add a card to your wallet first.</Body>
          )}
          <PrimaryButton label={toNumber(target) > 0 ? 'Save goal' : 'Enter the amount first'} onPress={save} disabled={!(toNumber(target) > 0)} />
        </Panel>
      ) : (
        <PrimaryButton label="Add a goal" onPress={() => setAdding(true)} />
      )}

      <Text style={styles.disclaimer}>
        Goal progress uses the best single card only. Each estimate uses that card&apos;s own default redemption route; reward currencies are not pooled.{' '}
        {profileSaved ? 'Months to go use the spending you saved in Find My Card.' : 'Months to go use typical spending until you save your own in Find My Card.'}{' '}
        Never spend more just to reach a goal: interest costs far more than points are worth.
      </Text>
    </MoneyScreen>
  );
}

const styles = StyleSheet.create({
  goalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalName: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  remove: { fontFamily: theme.fontFamily, color: theme.colors.danger, fontSize: 14, fontWeight: '600' },
  track: { height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceRaised, marginVertical: theme.spacing.sm, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: theme.colors.gold },
  small: { fontSize: 13, marginTop: 6 },
  input: {
    marginTop: theme.spacing.sm,
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
  disclaimer: { ...theme.text.caption, fontWeight: '400', marginTop: theme.spacing.lg, lineHeight: 17 },
});
