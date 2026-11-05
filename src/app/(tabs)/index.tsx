import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuraBar } from '../../components/home/AuraBar';
import { BillCheckBanner } from '../../components/home/BillCheckBanner';
import { CardCalculator } from '../../components/home/CardCalculator';
import { GoalCard } from '../../components/home/GoalCard';
import { HeroCard } from '../../components/home/HeroCard';
import { HomeHeader } from '../../components/home/HomeHeader';
import { LearnCarousel } from '../../components/home/LearnCarousel';
import { QuickActions } from '../../components/home/QuickActions';
import type { QuickAction } from '../../components/home/QuickActions';
import { RewardsList } from '../../components/home/RewardsList';
import { SpendsSummaryCard, StaySafeCard } from '../../components/home/SafetyCards';
import { SectionHeader } from '../../components/home/SectionHeader';
import { UpdatesList } from '../../components/home/UpdatesList';
import { catalog } from '../../data/catalog';
import { walletAlerts } from '../../engine';
import { useBillReminderSync } from '../../hooks/useBillReminderSync';
import { useCardStore } from '../../store/useCardStore';
import { theme } from '../../theme';

/** Days ahead that count as a "new alert" on the bell. */
const ALERT_WINDOW_DAYS = 45;

/**
 * Home only composes the sections. Order: points value, Aura, quick actions,
 * card calculator, rewards, card updates, then expert videos.
 */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cards = useCardStore((s) => s.cards);
  const holdings = useCardStore((s) => s.holdings);
  const isDemo = useCardStore((s) => s.isDemo);
  useBillReminderSync();

  const totals = useMemo(
    () => ({
      min: cards.reduce((acc, c) => acc + c.lowValue, 0),
      max: cards.reduce((acc, c) => acc + c.highValue, 0),
      balances: cards.filter((c) => c.points > 0).length,
    }),
    [cards],
  );
  const hasAlerts = useMemo(
    () => walletAlerts(catalog, holdings.map((h) => h.catalogId), undefined, ALERT_WINDOW_DAYS).length > 0,
    [holdings],
  );

  const openCard = useCallback((id: string) => router.push({ pathname: '/card-detail', params: { id } }), [router]);
  const openCardUpdates = useCallback(
    (id: string) => router.push({ pathname: '/card-detail', params: { id, tab: 'Updates' } }),
    [router],
  );
  const openWallet = useCallback(() => router.push('/wallet'), [router]);

  const quickActions: QuickAction[] = useMemo(
    () => [
      { key: 'find', title: 'Find Next Card', icon: 'sparkle', onPress: () => router.push('/find-card') },
      { key: 'trip', title: 'Trip Planner', icon: 'plane', onPress: () => router.push('/trip-planner') },
      { key: 'nearby', title: 'Best Card Nearby', icon: 'pin', onPress: () => router.push('/map') },
      { key: 'add', title: 'Add a Card', icon: 'plus', onPress: () => router.push('/add-card') },
      { key: 'bill', title: 'Bill Check', icon: 'rupee', onPress: () => router.push('/bill-check') },
      { key: 'browse', title: 'Browse Cards', icon: 'search', onPress: () => router.push('/browse-cards') },
    ],
    [router],
  );

  return (
    <View style={styles.container}>
      <HomeHeader
        topInset={insets.top}
        hasAlerts={hasAlerts}
        onAlerts={() => router.push('/notifications')}
        onSettings={() => router.push('/settings')}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          // Leave room for the floating tab bar.
          { paddingBottom: insets.bottom + theme.sizes.tabBarHeight + theme.spacing.lg },
        ]}
      >
        <HeroCard
          totalMin={totals.min}
          totalMax={totals.max}
          cardCount={cards.length}
          balanceCount={totals.balances}
          isDemo={isDemo}
          onSeeHow={openWallet}
        />

        <GoalCard onPress={() => router.push('/goal')} />

        <AuraBar onPress={() => router.push('/aura')} />

        <BillCheckBanner onPress={() => router.push('/bill-check')} />

        <View>
          <SectionHeader title="Quick actions" />
          <QuickActions actions={quickActions} />
        </View>

        <View>
          <SectionHeader title="Which card should I use?" />
          <CardCalculator cards={cards} onCompareNearby={() => router.push('/map')} />
        </View>

        <RewardsList cards={cards} onOpenCard={openCard} onViewAll={openWallet} />

        <UpdatesList cards={cards} onOpenCard={openCardUpdates} />

        <SpendsSummaryCard />

        <StaySafeCard />

        <View style={styles.fullBleed}>
          <LearnCarousel />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    // One gap between every section.
    gap: theme.spacing.lg,
  },
  fullBleed: { marginHorizontal: -theme.spacing.md },
});
