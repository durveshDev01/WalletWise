import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catalog } from '../data/catalog';
import { daysUntilDue, formatDueDate, ordinalDay, todayIso, upcomingDueDates, walletAlerts } from '../engine';
import { useCardStore } from '../store/useCardStore';
import { colors, typography } from '../theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cards, holdings, billRemindersOn, setBillRemindersOn } = useCardStore();

  const today = todayIso();

  // 1. Devaluation alerts from the catalog
  const devaluations = useMemo(() => {
    const cardIds = holdings.map((h) => h.catalogId);
    return walletAlerts(catalog, cardIds, today, 90);
  }, [holdings, today]);

  // 2. Upcoming bills
  const billDues = useMemo(() => {
    const now = new Date();
    return holdings
      .filter((h) => h.dueDay != null && h.dueDay >= 1 && h.dueDay <= 31)
      .map((h) => {
        const days = daysUntilDue(h.dueDay!, now) ?? 0;
        const [nextDue] = upcomingDueDates(h.dueDay!, now, 1);
        const cardData = cards.find((c) => c.id === h.id);
        const catalogCard = catalog.byId.get(h.catalogId);
        return {
          holdingId: h.id,
          name: cardData ? `${cardData.bankName} ${cardData.cardName}` : (catalogCard?.name ?? h.catalogId),
          dueDay: h.dueDay!,
          dueDateFormatted: nextDue ? formatDueDate(nextDue, now) : `${ordinalDay(h.dueDay!)} of month`,
          daysLeft: days,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [holdings, cards]);

  // 3. Expiring points
  const expiringCards = useMemo(() => {
    return cards.filter((c) => c.expiryDays != null && c.expiryDays <= 60);
  }, [cards]);

  const totalAlertsCount = devaluations.length + billDues.filter((b) => b.daysLeft <= 7).length + expiringCards.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 60,
        paddingHorizontal: 20,
      }}
    >
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notification Inbox</Text>
          <Text style={styles.sub}>
            Card devaluations, statement due alerts, and expiring reward balances.
          </Text>
        </View>
        {totalAlertsCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{totalAlertsCount} new</Text>
          </View>
        )}
      </View>

      {/* Reminder Controls */}
      <View style={styles.controlsCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.controlsTitle}>Local Bill Reminders</Text>
          <Text style={styles.controlsSub}>
            Notifies you 3 days and 1 day before your card payment due date.
          </Text>
        </View>
        <Pressable
          style={[styles.toggleBtn, billRemindersOn ? styles.toggleBtnOn : styles.toggleBtnOff]}
          onPress={() => setBillRemindersOn(!billRemindersOn)}
        >
          <Text style={[styles.toggleBtnText, billRemindersOn ? styles.toggleBtnTextOn : styles.toggleBtnTextOff]}>
            {billRemindersOn ? 'Active ✓' : 'Enable'}
          </Text>
        </Pressable>
      </View>

      {/* 1. Devaluation and rule changes */}
      <Text style={styles.sectionHeader}>CARD RULE CHANGES & DEVALUATIONS</Text>
      {devaluations.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>No upcoming devaluations reported for your cards.</Text>
        </View>
      ) : (
        devaluations.map((a, i) => {
          const held = holdings.find((h) => h.catalogId === a.cardId);
          const cardName = catalog.byId.get(a.cardId)?.name ?? a.cardId;
          return (
            <Pressable
              key={`${a.cardId}-${i}`}
              style={styles.alertCard}
              onPress={() => held && router.push({ pathname: '/card-detail', params: { id: held.id, tab: 'Updates' } })}
            >
              <View style={styles.alertHeader}>
                <Text style={styles.alertCardName}>{cardName}</Text>
                <View style={styles.devalBadge}>
                  <Text style={styles.devalBadgeText}>
                    {a.change.direction === 'devaluation' ? 'DEVALUATION' : 'CHANGE'}
                  </Text>
                </View>
              </View>
              <Text style={styles.alertSummary}>{a.change.title}</Text>
              <Text style={styles.alertDate}>Effective {a.change.date} ({a.daysAway} days away)</Text>
            </Pressable>
          );
        })
      )}

      {/* 2. Bill due reminders */}
      <Text style={styles.sectionHeader}>UPCOMING PAYMENT DUE DATES</Text>
      {billDues.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>No billing due days configured on your held cards.</Text>
        </View>
      ) : (
        billDues.map((b) => (
          <Pressable
            key={b.holdingId}
            style={styles.billCard}
            onPress={() => router.push({ pathname: '/bill-check', params: { cardId: b.holdingId } })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.billCardName}>{b.name}</Text>
              <Text style={styles.billCardSub}>Due on {b.dueDateFormatted} · {ordinalDay(b.dueDay)} of month</Text>
            </View>
            <View style={styles.billDueBadge}>
              <Text style={[styles.billDueDays, b.daysLeft <= 3 && { color: colors.accent.danger }]}>
                {b.daysLeft === 0 ? 'Due today' : b.daysLeft === 1 ? 'Due tomorrow' : `${b.daysLeft} days left`}
              </Text>
            </View>
          </Pressable>
        ))
      )}

      {/* 3. Points expiry warnings */}
      {expiringCards.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>POINTS EXPIRY ALERTS</Text>
          {expiringCards.map((c) => {
            const isToday = c.expiryDays === 0;
            const isTomorrow = c.expiryDays === 1;
            const expiryText = isToday
              ? 'expiring today!'
              : isTomorrow
                ? 'expiring tomorrow!'
                : `expiring in ${c.expiryDays} days!`;
            return (
              <Pressable
                key={c.id}
                style={[styles.alertCard, { borderColor: 'rgba(201,65,46,0.3)' }]}
                onPress={() => router.push({ pathname: '/card-detail', params: { id: c.id, tab: 'Redeem' } })}
              >
                <Text style={styles.alertCardName}>{c.bankName} {c.cardName}</Text>
                <Text style={[styles.alertSummary, { color: colors.accent.danger, marginTop: 4 }]}>
                  {c.points.toLocaleString('en-IN')} {c.currencyName} {expiryText}
                </Text>
                <Text style={styles.alertDate}>Tap to redeem before expiration →</Text>
              </Pressable>
            );
          })}
        </>
      )}

      <View style={styles.privacyNote}>
        <Text style={styles.privacyNoteText}>
          All notifications are processed entirely on your device. WalletWise never connects to your bank accounts or uploads payment due dates.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  back: { paddingVertical: 8 },
  backText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 15, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8 },
  title: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  sub: { fontFamily: typography.fontFamily, color: '#9A9A9A', fontSize: 13, marginTop: 6, lineHeight: 18 },
  countBadge: {
    backgroundColor: 'rgba(245,208,111,0.15)',
    borderColor: colors.accent.goldStart,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 12, fontWeight: '700' },
  controlsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 14,
    marginTop: 18,
    gap: 12,
  },
  controlsTitle: { fontFamily: typography.fontFamily, color: '#F0F0F0', fontSize: 14, fontWeight: '600' },
  controlsSub: { fontFamily: typography.fontFamily, color: '#888', fontSize: 12, marginTop: 2, lineHeight: 16 },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleBtnOn: {
    backgroundColor: 'rgba(84,199,138,0.15)',
    borderColor: '#54C78A',
  },
  toggleBtnOff: {
    backgroundColor: '#202020',
    borderColor: '#333',
  },
  toggleBtnText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '700' },
  toggleBtnTextOn: { color: '#54C78A' },
  toggleBtnTextOff: { color: '#AAA' },
  sectionHeader: {
    fontFamily: typography.fontFamily,
    color: '#6F6F6F',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#121212',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    padding: 14,
  },
  emptyCardText: { fontFamily: typography.fontFamily, color: '#777', fontSize: 13 },
  alertCard: {
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 14,
    marginBottom: 10,
  },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertCardName: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 14, fontWeight: '600' },
  devalBadge: {
    backgroundColor: 'rgba(201,65,46,0.15)',
    borderColor: 'rgba(201,65,46,0.5)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  devalBadgeText: { fontFamily: typography.fontFamily, color: colors.accent.danger, fontSize: 9, fontWeight: '700' },
  alertSummary: { fontFamily: typography.fontFamily, color: '#CCC', fontSize: 13, marginTop: 6, lineHeight: 18 },
  alertDate: { fontFamily: typography.fontFamily, color: '#888', fontSize: 11, marginTop: 6 },
  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 14,
    marginBottom: 8,
  },
  billCardName: { fontFamily: typography.fontFamily, color: '#F0F0F0', fontSize: 14, fontWeight: '600' },
  billCardSub: { fontFamily: typography.fontFamily, color: '#888', fontSize: 12, marginTop: 2 },
  billDueBadge: { alignItems: 'flex-end' },
  billDueDays: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 13, fontWeight: '700' },
  privacyNote: { marginTop: 20, padding: 12, borderRadius: 10, backgroundColor: '#101010', borderWidth: 1, borderColor: '#1C1C1C' },
  privacyNoteText: { fontFamily: typography.fontFamily, color: '#666', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
