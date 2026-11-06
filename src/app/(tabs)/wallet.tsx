import React, { useEffect, useMemo } from 'react';
import { catalog } from '../../data/catalog';
import { redemptionRoutes } from '../../engine';
import { StyleSheet, Text, View, Pressable, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  useSharedValue,
  interpolate,
  Extrapolation,
  SharedValue,
  Easing,
} from 'react-native-reanimated';
import { ScrollView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, colors } from '../../theme';
import { useCardStore, CardData } from '../../store/useCardStore';
import { CreditCardImage } from '../../components/CreditCardImage';
import { WalletMoneyLinks } from '../../components/money/WalletMoneyLinks';
import { UI_STRINGS } from '../../services/appStrings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Card dimensions — 1.586 aspect ratio
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_HEIGHT = CARD_WIDTH / 1.586;

// Stack spacing
const COLLAPSED_OFFSET = 16;       // Tight peek distance
const EXPANDED_SPACING = 85;       // Overlapping spread distance

// ─────────────────────────────────────────────
// Expiry Banner (Black + Gold Theme)
// ─────────────────────────────────────────────
function ExpiryBanner({ cards }: { cards: CardData[] }) {
  const router = useRouter();
  const expiringCards = cards
    .filter(c => c.expiryDays != null && c.expiryDays <= 30 && c.points > 0)
    .sort((a, b) => (a.expiryDays ?? 0) - (b.expiryDays ?? 0));

  if (expiringCards.length === 0) return null;

  return (
    <>
      {expiringCards.map((card) => {
        const isToday = card.expiryDays === 0;
        const isTomorrow = card.expiryDays === 1;

        return (
          <View key={card.id} style={[styles.infoCard, { borderColor: 'rgba(201, 65, 46, 0.3)' }]}>
            <View style={styles.expiryBody}>
              <Text style={[styles.infoLabel, { color: colors.accent.danger }]}>
                {isToday ? `${card.currencyName.toUpperCase()} EXPIRING TODAY` : `${card.currencyName.toUpperCase()} EXPIRING SOON`}
              </Text>
              <View style={styles.expiryStats}>
                <View style={styles.expiryStat}>
                  <Text style={styles.infoBigNum}>{card.points.toLocaleString('en-IN')}</Text>
                  <Text style={styles.infoUnit}>{card.currencyName}</Text>
                </View>
                <View style={styles.expiryDivider} />
                <View style={styles.expiryStat}>
                  <Text style={styles.infoBigNum}>{isToday ? 'Today' : isTomorrow ? '1' : card.expiryDays}</Text>
                  <Text style={styles.infoUnit}>{isToday ? 'expires' : isTomorrow ? 'day left' : 'days left'}</Text>
                </View>
              </View>
              <Text style={styles.infoSubtext}>{card.bankName} {card.cardName}</Text>
            </View>
            <Pressable
              style={styles.expiryCtaButton}
              onPress={() => router.push({ pathname: '/card-detail', params: { id: card.id, tab: 'Redeem' } })}
              accessibilityRole="button"
              accessibilityLabel={`Redeem ${card.bankName} ${card.cardName} expiring points`}
            >
              <Text style={styles.expiryCta}>Redeem →</Text>
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// Points Value Card (Black + Gold Theme) — Programme-specific redemptions
// ─────────────────────────────────────────────
function PointsValueCard({ cards, totalMin, totalMax, explainText }: { cards: CardData[]; totalMin: number; totalMax: number; explainText?: string }) {
  const router = useRouter();

  const programmes = useMemo(() => {
    return cards
      .map((c) => {
        const catCard = catalog.byId.get(c.catalogId);
        const routes = catCard ? redemptionRoutes(catalog, catCard) : [];
        const airlineRoutes = routes.filter((r) => r.kind === 'TRANSFER' && r.partnerKind === 'AIRLINE');
        const hotelRoutes = routes.filter((r) => r.kind === 'TRANSFER' && r.partnerKind === 'HOTEL');
        const cashRoute = routes.find((r) => r.kind === 'CASH');
        const isCashback = c.currencyName.toLowerCase().includes('cashback') || (routes.length === 1 && routes[0].kind === 'CASH');
        const noBalance = c.points === 0 && c.lowValue === 0;

        const avenues: string[] = [];
        if (!noBalance) {
          if (airlineRoutes.length > 0) {
            const names = airlineRoutes.slice(0, 2).map((r) => r.label.replace(/^Transfer to /, ''));
            avenues.push(`✈️ Flights (${airlineRoutes.length} airline${airlineRoutes.length > 1 ? 's' : ''}: ${names.join(', ')}${airlineRoutes.length > 2 ? '…' : ''})`);
          }
          if (hotelRoutes.length > 0) {
            const names = hotelRoutes.slice(0, 2).map((r) => r.label.replace(/^Transfer to /, ''));
            avenues.push(`🏨 Hotels (${hotelRoutes.length} partner${hotelRoutes.length > 1 ? 's' : ''}: ${names.join(', ')}${hotelRoutes.length > 2 ? '…' : ''})`);
          }
          if (cashRoute || isCashback) {
            avenues.push(`💵 Statement credit / Cash`);
          }
          if (!isCashback) {
            avenues.push(`🛍️ Brand vouchers & rewards portal`);
          }
        }

        return {
          card: c,
          avenues,
          noBalance,
          routesCount: routes.length,
        };
      });
  }, [cards]);

  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>WHAT ARE YOUR REWARDS WORTH?</Text>
      <Text style={[styles.infoBigNum, { marginTop: 8, color: colors.accent.goldStart }]}>
        ₹{totalMin.toLocaleString('en-IN')}{totalMax > totalMin ? ` – ₹${totalMax.toLocaleString('en-IN')}` : ''}
      </Text>
      <Text style={styles.infoSubtext}>
        {explainText ?? 'Estimated INR equivalent per card account. Reward points are card-specific and cannot be pooled or transferred across cards.'}
      </Text>

      {/* Programme Breakdown */}
      {programmes.length === 0 ? (
        <View style={styles.emptyProgrammeSlot}>
          <Text style={styles.emptyProgrammeText}>
            No card balances recorded yet. Add your cards or tap &ldquo;Load sample deck&rdquo; above to see reward valuations.
          </Text>
          <Pressable onPress={() => router.push('/add-card')} style={{ marginTop: 8 }} accessibilityRole="button">
            <Text style={styles.emptyProgrammeAction}>+ Add your first card →</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.programmeList}>
          {programmes.map(({ card: c, avenues, noBalance }) => (
            <Pressable
              key={c.id}
              style={styles.programmeItem}
              onPress={() => router.push({ pathname: '/card-detail', params: { id: c.id, tab: 'Redeem' } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.programmeCardName}>{c.bankName} {c.cardName}</Text>
                {noBalance ? (
                  <>
                    <Text style={[styles.programmeDetail, { color: '#7A7A7A', fontStyle: 'italic' }]}>
                      No balance recorded — tap to update points
                    </Text>
                    {c.pointsExpiry?.neverExpires ? (
                      <Text style={[styles.programmeDetail, { color: '#54C78A', fontWeight: '600' }]}>
                        ✨ Points never expire
                      </Text>
                    ) : c.pointsExpiry?.note ? (
                      <Text style={[styles.programmeDetail, { color: '#888888', fontSize: 11 }]}>
                        Policy: {c.pointsExpiry.note}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={styles.programmeBalance}>
                      {c.points.toLocaleString('en-IN')} {c.currencyName} ≈ ₹{c.lowValue.toLocaleString('en-IN')}{c.highValue > c.lowValue ? ` – ₹${c.highValue.toLocaleString('en-IN')}` : ''}
                    </Text>
                    {/* Expiry timeline */}
                    {c.pointsExpiry?.neverExpires ? (
                      <Text style={[styles.programmeDetail, { color: '#54C78A', fontWeight: '600' }]}>
                        ✨ Points never expire
                      </Text>
                    ) : c.expiryDays != null ? (
                      <Text style={[styles.programmeDetail, { color: c.expiryDays <= 30 ? colors.accent.danger : '#F5D06F', fontWeight: '600' }]}>
                        {c.expiryDays === 0
                          ? '🚨 Points expire today!'
                          : c.expiryDays === 1
                          ? '🚨 Points expire tomorrow!'
                          : `⏳ Points expire in ${c.expiryDays} days${c.expiryDate ? ` (${c.expiryDate})` : ''}`}
                      </Text>
                    ) : c.expiryDate ? (
                      <Text style={[styles.programmeDetail, { color: '#F5D06F' }]}>
                        ⏳ Points expire: {c.expiryDate}
                      </Text>
                    ) : null}
                    {!!c.pointsExpiry?.note && !c.pointsExpiry.neverExpires && (
                      <Text style={[styles.programmeDetail, { color: '#888888', fontSize: 10 }]}>
                        Rule: {c.pointsExpiry.note}
                      </Text>
                    )}
                    <View style={{ marginTop: 4, gap: 2 }}>
                      {avenues.map((av, idx) => (
                        <Text key={idx} style={styles.programmeDetail}>
                          {av}
                        </Text>
                      ))}
                    </View>
                  </>
                )}
              </View>
              <Text style={styles.programmeArrow}>→</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.horizontalDivider} />

      <Pressable style={styles.infoRow} onPress={() => router.push('/trip-planner')}>
        <Text style={styles.infoIcon}>✈︎</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoRowTitle}>Travel Awards & Redemption Planner</Text>
          <Text style={styles.infoRowSub}>
            Plan flights, hotel stays (Marriott, Accor), and check net award value with tax deductions. Open Planner →
          </Text>
        </View>
        <Text style={styles.programmeArrow}>→</Text>
      </Pressable>

      <View style={styles.redemptionGrid}>
        <View style={styles.redemptionPill}>
          <Text style={styles.redemptionPillTitle}>✈️ Flights</Text>
          <Text style={styles.redemptionPillDesc}>Miles transfer or portal</Text>
        </View>
        <View style={styles.redemptionPill}>
          <Text style={styles.redemptionPillTitle}>🏨 Hotels</Text>
          <Text style={styles.redemptionPillDesc}>Marriott, Accor, ITC</Text>
        </View>
        <View style={styles.redemptionPill}>
          <Text style={styles.redemptionPillTitle}>💵 Statement Cash</Text>
          <Text style={styles.redemptionPillDesc}>Direct bill credit</Text>
        </View>
        <View style={styles.redemptionPill}>
          <Text style={styles.redemptionPillTitle}>🛍️ Vouchers</Text>
          <Text style={styles.redemptionPillDesc}>Amazon, Flipkart, retail</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Individual Stacked Card
// ─────────────────────────────────────────────
function StackedCard({
  card,
  index,
  dragProgress,
  totalCards,
  selectedIndex,
  onPress,
}: {
  card: CardData;
  index: number;
  dragProgress: SharedValue<number>;
  totalCards: number;
  selectedIndex: SharedValue<number>;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    // Calculate positions such that the front card (index 0) is pushed down,
    // and the back card (index 4) stays anchored at the top.
    const reverseIndex = totalCards - 1 - index;
    const collapsedY = reverseIndex * COLLAPSED_OFFSET;
    const expandedY = reverseIndex * EXPANDED_SPACING;

    // Create a staggered effect so cards peel off one by one
    const startProgress = index * 0.15;
    const endProgress = Math.min(1, startProgress + 0.4);
    const inputRange = [startProgress, endProgress];

    const translateY = interpolate(
      dragProgress.value,
      inputRange,
      [collapsedY, expandedY],
      Extrapolation.CLAMP
    );

    // Scale: front card = 1.0, each card behind shrinks slightly more
    const collapsedScale = 1 - index * 0.025;
    const scale = interpolate(
      dragProgress.value,
      inputRange,
      [collapsedScale, 1],
      Extrapolation.CLAMP
    );

    // Opacity: back cards slightly darken for depth when collapsed
    const opacity = interpolate(
      dragProgress.value,
      inputRange,
      [1 - index * 0.15, 1],
      Extrapolation.CLAMP
    );

    // Shadow depth based on position: front card (index 0) has strongest shadow
    const collapsedShadow = 0.35 - index * 0.05;
    const shadowOpacity = interpolate(
      dragProgress.value,
      inputRange,
      [collapsedShadow, 0.4],
      Extrapolation.CLAMP
    );
    const shadowRadius = interpolate(
      dragProgress.value,
      inputRange,
      [8, 16],
      Extrapolation.CLAMP
    );
    const elevation = interpolate(
      dragProgress.value,
      inputRange,
      [totalCards - index, 12],
      Extrapolation.CLAMP
    );

    return {
      zIndex: totalCards - index,
      opacity,
      transform: [
        { translateY },
        { scale },
      ],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity,
      shadowRadius,
      elevation,
    };
  });

  // Highlight glow animation on selection
  const glowStyle = useAnimatedStyle(() => {
    const isSelected = selectedIndex.value === index;
    return {
      opacity: isSelected ? 1 : 0,
      borderColor: isSelected ? 'rgba(245, 208, 111, 0.7)' : 'transparent',
      borderWidth: isSelected ? 2 : 0,
    };
  });

  // Scale pulse on selection
  const selectPulseStyle = useAnimatedStyle(() => {
    const isSelected = selectedIndex.value === index;
    return {
      transform: [
        { scale: isSelected ? 1.03 : 1 },
      ],
    };
  });

  // Card name label that fades in when expanded
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragProgress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[styles.cardWrapper, animatedStyle]}>
      <Pressable onPress={onPress}>
        <Animated.View style={[{ width: '100%' }, selectPulseStyle]}>
          <CreditCardImage card={card} />
          <Animated.View style={[styles.cardGlowOverlay, glowStyle]} pointerEvents="none" />
        </Animated.View>
      </Pressable>
      <Animated.Text style={[styles.subtleCardName, labelStyle]}>
        {card.bankName} · {card.cardName}
      </Animated.Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// Main Wallet Screen
// ─────────────────────────────────────────────
export default function WalletScreen() {
  const cards = useCardStore((state) => state.cards);
  const isDemo = useCardStore((state) => state.isDemo);
  const removeSampleCards = useCardStore((state) => state.removeSampleCards);
  const loadSampleCards = useCardStore((state) => state.loadSampleCards);
  const language = useCardStore((state) => state.auraLanguage ?? 'en');
  const t = UI_STRINGS[language].wallet;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const totalMin = cards.reduce((acc, c) => acc + (c.lowValue || 0), 0);
  const totalMax = cards.reduce((acc, c) => acc + (c.highValue || 0), 0);

  const dragProgress = useSharedValue(0);
  const context = useSharedValue(0);
  const selectedIndex = useSharedValue(-1);

  // Subtle hint pulse animation
  const hintPulse = useSharedValue(0.8);
  useEffect(() => {
    hintPulse.value = withDelay(
      2000,
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      )
    );
  }, [hintPulse]);

  function handleCardPress(index: number) {
    const card = cards[index];
    selectedIndex.value = withSequence(
      withTiming(index, { duration: 0 }),
      withDelay(450, withTiming(-1, { duration: 0 }))
    );
    setTimeout(() => {
      router.push({ pathname: '/card-detail', params: { id: card.id } });
    }, 400);
  }

  // Pan gesture for expanding/collapsing
  const panGesture = Gesture.Pan()
    .enabled(cards.length > 1)
    .activeOffsetY([-20, 20])
    .onStart(() => {
      context.value = dragProgress.value;
    })
    .onUpdate((event) => {
      const newProgress = context.value + event.translationY / 400;
      dragProgress.value = Math.max(0, Math.min(1, newProgress));
    })
    .onEnd((event) => {
      const velocityProgress = event.velocityY / 1000;
      const projected = dragProgress.value + velocityProgress;

      if (projected > 0.3) {
        dragProgress.value = withSpring(1, { damping: 20, stiffness: 180, mass: 1 });
      } else {
        dragProgress.value = withSpring(0, { damping: 20, stiffness: 180, mass: 1 });
      }
    });

  // Animated deck height so content below adjusts
  const deckAnimatedStyle = useAnimatedStyle(() => {
    // The max Y displacement is for the front card (reverseIndex = totalCards - 1)
    const collapsedHeight = CARD_HEIGHT + (cards.length - 1) * COLLAPSED_OFFSET;
    const expandedHeight = (cards.length - 1) * EXPANDED_SPACING + CARD_HEIGHT + 30;
    return {
      height: interpolate(
        dragProgress.value,
        [0, 1],
        [collapsedHeight, expandedHeight],
        Extrapolation.CLAMP
      ),
    };
  });

  // Hint fades out slightly during expand, but maintains pill background
  const hintAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragProgress.value, [0, 0.3], [hintPulse.value, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 104 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header (Top) */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <Text style={styles.headerSubLabel}>
                {cards.length > 0
                  ? totalMax > 0
                    ? `${t.pointsWorth} `
                    : 'No balances recorded'
                  : '0 cards in deck'}
                {cards.length > 0 && totalMax > 0 && (
                  <Text style={{ color: colors.accent.goldStart }}>
                    ₹{totalMin.toLocaleString('en-IN')}{totalMax > totalMin ? ` – ₹${totalMax.toLocaleString('en-IN')}` : ''}
                  </Text>
                )}
              </Text>
              {isDemo && cards.length > 0 && (
                <Pressable onPress={removeSampleCards} style={styles.demoChip} accessibilityLabel="Clear sample comparison cards">
                  <Text style={styles.demoChipText}>Sample Deck · Clear</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Pressable style={styles.plusButton} onPress={() => router.push('/settings')} accessibilityLabel="Settings">
              <Text style={{ fontSize: 18, color: colors.accent.goldStart }}>⚙</Text>
            </Pressable>
            <Pressable style={styles.plusButton} onPress={() => router.push('/add-card')} accessibilityLabel="Add card">
              <Text style={styles.plusButtonText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Card Deck Area (Card Deck or Empty Deck Slot) */}
        {cards.length === 0 ? (
          <View style={styles.emptyDeckSlot}>
            <View style={styles.emptyDeckIconCircle}>
              <Text style={{ fontSize: 28 }}>💳</Text>
            </View>
            <Text style={styles.emptyDeckTitle}>{t.emptyTitle}</Text>
            <Text style={styles.emptyDeckSubtitle}>{t.emptySubtitle}</Text>
            <View style={styles.emptyDeckActions}>
              <Pressable
                style={styles.addFirstCardButton}
                onPress={() => router.push('/add-card')}
                accessibilityRole="button"
                accessibilityLabel="Add your first card"
              >
                <Text style={styles.addFirstCardButtonText}>{t.addFirstCard}</Text>
              </Pressable>
              <Pressable
                style={styles.loadDemoButton}
                onPress={loadSampleCards}
                accessibilityRole="button"
                accessibilityLabel="Explore with sample cards"
              >
                <Text style={styles.loadDemoButtonText}>Load sample deck</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.deckContainer, deckAnimatedStyle]}>
              {cards.map((card, i) => (
                <StackedCard
                  key={card.id}
                  card={card}
                  index={i}
                  dragProgress={dragProgress}
                  totalCards={cards.length}
                  selectedIndex={selectedIndex}
                  onPress={() => handleCardPress(i)}
                />
              ))}
            </Animated.View>
          </GestureDetector>
        )}

        {/* Interaction Hint (Always beneath deck area) */}
        <Animated.View style={[styles.hintPill, hintAnimatedStyle]}>
          <View style={styles.hintIconWrapper}>
            <Text style={styles.hintIcon}>💳</Text>
          </View>
          <Text style={styles.hintText}>
            {cards.length > 1
              ? t.swipeHint
              : cards.length === 1
              ? 'Tap the card above to view details, update points, or check redemption routes.'
              : 'Add your credit cards or explore with sample cards to track points and optimize rewards.'}
          </Text>
        </Animated.View>

        {/* Expiry Banner */}
        <ExpiryBanner cards={cards} />

        {/* Reward Balances (Always present) */}
        <Text style={styles.sectionTitle}>{t.rewardBalances}</Text>
        <PointsValueCard cards={cards} totalMin={totalMin} totalMax={totalMax} explainText={t.valueExplain} />

        <WalletMoneyLinks />

      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  demoChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 208, 111, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 208, 111, 0.3)',
  },
  demoChipText: {
    fontFamily: typography.fontFamily,
    color: colors.accent.goldStart,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyDeckSlot: {
    width: '100%',
    minHeight: CARD_HEIGHT,
    backgroundColor: '#111111',
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(245, 208, 111, 0.25)',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDeckIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(245, 208, 111, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 208, 111, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyDeckTitle: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyDeckSubtitle: {
    fontFamily: typography.fontFamily,
    color: '#8E8E8E',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 16,
  },
  emptyDeckActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  addFirstCardButton: {
    backgroundColor: colors.accent.goldStart,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFirstCardButtonText: {
    fontFamily: typography.fontFamily,
    color: '#0A0A0A',
    fontSize: 13,
    fontWeight: '700',
  },
  loadDemoButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadDemoButtonText: {
    fontFamily: typography.fontFamily,
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyProgrammeSlot: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 14,
    marginTop: 14,
    alignItems: 'center',
  },
  emptyProgrammeText: {
    fontFamily: typography.fontFamily,
    color: '#8A8A8A',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  emptyProgrammeAction: {
    fontFamily: typography.fontFamily,
    color: colors.accent.goldStart,
    fontSize: 12,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#070707', // Reverted to black
  },
  scrollContent: {
    paddingHorizontal: 24,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubLabel: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  plusButtonText: {
    fontSize: 24,
    fontWeight: '500',
    color: '#F5D06F',
    marginTop: -2,
  },

  // Card Deck
  deckContainer: {
    position: 'relative',
    width: '100%',
    zIndex: 10,
  },
  cardWrapper: {
    position: 'absolute',
    width: '100%',
  },
  cardGlowOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderColor: 'transparent',
    borderWidth: 0,
    backgroundColor: 'rgba(245, 208, 111, 0.08)',
  },
  subtleCardName: {
    textAlign: 'center',
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
    fontWeight: '600',
  },

  // Hint Pill
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    padding: 16,
    borderRadius: 16,
    marginTop: 32,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 3,
    gap: 12,
  },
  hintIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 208, 111, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintIcon: {
    fontSize: 16,
  },
  hintText: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },

  // Section Title
  sectionTitle: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },

  // Info Cards (Transactions styling)
  programmeList: {
    marginTop: 14,
    gap: 8,
  },
  programmeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 12,
    gap: 8,
  },
  programmeCardName: {
    fontFamily: typography.fontFamily,
    color: '#F0F0F0',
    fontSize: 13,
    fontWeight: '600',
  },
  programmeBalance: {
    fontFamily: typography.fontFamily,
    color: colors.accent.goldStart,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  programmeDetail: {
    fontFamily: typography.fontFamily,
    color: '#9E9E9E',
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  programmeArrow: {
    fontFamily: typography.fontFamily,
    color: colors.accent.goldStart,
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  infoCard: {
    backgroundColor: '#111111',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 208, 111, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 5,
  },
  infoLabel: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  infoBigNum: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
  },
  infoSubtext: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 13,
    marginTop: 4,
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIcon: {
    fontSize: 22,
    color: colors.accent.goldStart,
  },
  infoRowTitle: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '600',
  },
  infoRowSub: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 13,
    marginTop: 2,
  },
  redemptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  redemptionPill: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#161616',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 10,
  },
  redemptionPillTitle: {
    fontFamily: typography.fontFamily,
    color: '#ECECEC',
    fontSize: 12,
    fontWeight: '600',
  },
  redemptionPillDesc: {
    fontFamily: typography.fontFamily,
    color: '#777777',
    fontSize: 10,
    marginTop: 2,
  },

  // Expiry Specific
  expiryBody: {
    flex: 1,
  },
  expiryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginVertical: 12,
  },
  expiryStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  infoUnit: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 14,
    fontWeight: '500',
  },
  expiryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  expiryCtaButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  expiryCta: {
    fontFamily: typography.fontFamily,
    color: colors.accent.goldStart,
    fontSize: 15,
    fontWeight: '600',
  },
});
