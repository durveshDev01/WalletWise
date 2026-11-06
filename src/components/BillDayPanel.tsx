import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';

import { daysUntilDue, formatDueDate, ordinalDay, upcomingDueDates } from '../engine/billing';
import { requestReminderPermission } from '../services/billReminders';
import { useCardStore } from '../store/useCardStore';
import type { Holding } from '../store/useCardStore';
import { theme } from '../theme';

type Props = { holding: Holding; onEdit: () => void };

/** Bill dates for one card, the reminders switch, and the RBI tip about moving the billing date. */
export function BillDayPanel({ holding, onEdit }: Props) {
  const on = useCardStore((s) => !!s.billRemindersOn);
  const setOn = useCardStore((s) => s.setBillRemindersOn);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const left = holding.dueDay ? daysUntilDue(holding.dueDay, now) : null;
  const [nextDue] = holding.dueDay ? upcomingDueDates(holding.dueDay, now, 1) : [];

  const toggle = async (next: boolean) => {
    if (!next) {
      setOn(false);
      return;
    }
    setBusy(true);
    // Permission is asked only now, when the user turns reminders on.
    const granted = await requestReminderPermission().catch(() => false);
    setBusy(false);
    if (granted) {
      setOn(true);
    } else {
      Alert.alert(
        'Notifications are off',
        'To get bill reminders, allow notifications for WalletWise in your phone settings.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() }],
      );
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>BILL DATES</Text>
      {holding.dueDay ? (
        <>
          <Text style={styles.big}>
            Due {nextDue ? formatDueDate(nextDue, now) : `on the ${ordinalDay(holding.dueDay)}`}
            {left != null ? (left === 0 ? ' · today' : ` · in ${left} day${left === 1 ? '' : 's'}`) : ''}
          </Text>
          {!!holding.statementDay && <Text style={styles.text}>Statement on the {ordinalDay(holding.statementDay)} of each month.</Text>}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>Remind me</Text>
              <Text style={styles.text}>3 days and 1 day before the due date, for all cards with a due day.</Text>
            </View>
            <Switch
              value={on}
              onValueChange={toggle}
              disabled={busy}
              trackColor={{ true: theme.colors.gold, false: theme.colors.borderStrong }}
              thumbColor={theme.colors.textPrimary}
              accessibilityLabel="Bill reminders"
            />
          </View>
          <Text style={styles.text}>Pay the total due, not the minimum. Paying only the minimum costs interest on the whole balance.</Text>
        </>
      ) : (
        <Text style={styles.text} onPress={onEdit} accessibilityRole="button">
          Add this card’s due day to get a reminder before each bill. <Text style={styles.link}>Edit card →</Text>
        </Text>
      )}
      <Text style={styles.tip}>
        Tip: RBI rules let you change your billing date at least once (para 29). Ask your bank to move it so the bill is due a few
        days after your salary arrives.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 24,
    marginBottom: 24,
    gap: 8,
    padding: 20,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  label: { fontFamily: theme.fontFamily, color: '#9A9A9A', fontSize: 11, letterSpacing: 1.5, fontWeight: '600' },
  big: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 20, fontWeight: '500' },
  strong: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  text: { fontFamily: theme.fontFamily, color: '#9A9A9A', fontSize: 13, lineHeight: 18 },
  link: { color: theme.colors.gold, fontWeight: '600' },
  tip: { fontFamily: theme.fontFamily, color: theme.colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
});
