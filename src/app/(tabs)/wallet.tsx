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
  const expiringCard = cards.find(c => c.expiryDays && c.expiryDays <= 30);
  if (!expiringCard) return null;

  return (
    <View style={[styles.infoCard, { borderColor: 'rgba(201, 65, 46, 0.3)' }]}>
      <View style={styles.expiryBody}>
        <Text style={[styles.infoLabel, { color: colors.accent.danger }]}>{expiringCard.currencyName.toUpperCase()} EXPIRING SOON</Text>
        <View style={styles.expiryStats}>
          <View style={styles.expiryStat}>
            <Text style={styles.infoBigNum}>{expiringCard.points.toLocaleString('en-IN')}</Text>
            <Text style={styles.infoUnit}>{expiringCard.currencyName}</Text>
          </View>
          <View style={styles.expiryDivider} />
          <View style={styles.expiryStat}>
            <Text style={styles.infoBigNum}>{expiringCard.expiryDays}</Text>
            <Text style={styles.infoUnit}>days left</Text>
          </View>
        </View>
        <Text style={styles.infoSubtext}>{expiringCard.bankName} {expiringCard.cardName}</Text>
      </View>
      <Pressable
        style={styles.expiryCtaButton}
        onPress={() => router.push({ pathname: '/card-detail', params: { id: expiringCard.id, tab: 'Redeem' } })}
      >
        <Text style={styles.expiryCta}>Redeem →</Text>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────
// Points Value Card (Black + Gold Theme) — Programme-specific redemptions
// ─────────────────────────────────────────────
function PointsValueCard({ cards, totalMin, totalMax }: { cards: CardData[]; totalMin: number; totalMax: number }) {
  const router = useRouter();

  const programmes = useMemo(() => {
    return cards
      .filter((c) => c.points > 0 || c.lowValue > 0)
      .map((c) => {
        const catCard = catalog.byId.get(c.catalogId);
        const routes = catCard ? redemptionRoutes(catalog, catCard) : [];
        const airlineRoutes = routes.filter((r) => r.kind === 'TRANSFER' && r.partnerKind === 'AIRLINE');
        const hasAirline = airlineRoutes.length > 0;
        return {
          card: c,
          hasAirline,
          airlinePartners: airlineRoutes.map((r) => r.label),
          routesCount: routes.length,
          isCashback:
            c.currencyName.toLowerCase().includes('cashback') ||
            (!hasAirline && routes.every((r) => r.kind === 'CASH')),
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
        Estimated INR equivalent separated by reward programme. Balances cannot be combined across different banks.
      </Text>

      {/* Programme Breakdown */}
      {programmes.length > 0 && (
        <View style={styles.programmeList}>
          {programmes.map(({ card: c, hasAirline, airlinePartners, isCashback }) => (
            <Pressable
              key={c.id}
              style={styles.programmeItem}
              onPress={() => router.push({ pathname: '/card-detail', params: { id: c.id, tab: 'Redeem' } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.programmeCardName}>{c.bankName} {c.cardName}</Text>
                <Text style={styles.programmeBalance}>
                  {c.points.toLocaleString('en-IN')} {c.currencyName} ≈ ₹{c.lowValue.toLocaleString('en-IN')}{c.highValue > c.lowValue ? ` – ₹${c.highValue.toLocaleString('en-IN')}` : ''}
                </Text>
                {hasAirline ? (
                  <Text style={styles.programmeDetail}>
                    ✈ Eligible for {airlinePartners.length} airline partner{airlinePartners.length > 1 ? 's' : ''} ({airlinePartners.slice(0, 2).join(', ')}{airlinePartners.length > 2 ? '...' : ''})
                  </Text>
                ) : (
                  <Text style={[styles.programmeDetail, { color: '#7E7E7E' }]}>
                    💵 {isCashback ? 'Statement credit / cash only · No airline partners' : 'Voucher / merchandise only'}
                  </Text>
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
          <Text style={styles.infoRowTitle}>Plan Flight Redemption</Text>
          <Text style={styles.infoRowSub}>
            Compare eligible airline transfer routes and check award availability with taxes. Open Trip Planner →
          </Text>
        </View>
      </Pressable>
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
          <View>
            <Text style={styles.headerTitle}>My Cards</Text>
            <Text style={styles.headerSubLabel}>
              Points worth: <Text style={{ color: colors.accent.goldStart }}>₹{totalMin.toLocaleString('en-IN')} – ₹{totalMax.toLocaleString('en-IN')}</Text>
            </Text>
          </View>
          <Pressable style={styles.plusButton} onPress={() => router.push('/add-card')}>
            <Text style={styles.plusButtonText}>+</Text>
          </Pressable>
        </View>

        {isDemo && (
          <View style={styles.demoBanner}>
            <Text style={styles.demoTitle}>Sample cards are included</Text>
            <Text style={styles.demoText}>They remain alongside cards you add, as a comparison set. Remove them any time below.</Text>
            <Pressable onPress={() => router.push('/add-card')} accessibilityRole="button"><Text style={styles.demoTitle}>Add a card →</Text></Pressable>
            <Pressable onPress={removeSampleCards} accessibilityRole="button" accessibilityLabel="Remove sample cards"><Text style={styles.demoText}>Remove sample cards</Text></Pressable>
          </View>
        )}
        {cards.length === 0 && (
          <Pressable style={styles.demoBanner} onPress={() => router.push('/add-card')}>
            <Text style={styles.demoTitle}>No cards yet</Text>
            <Text style={styles.demoText}>Add the cards you hold, or use Find My Card if you have none. Tap to add →</Text>
          </Pressable>
        )}

        {/* Card Deck (Immediately below header) */}
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

        {/* Interaction Hint (Below deck) */}
        <Animated.View style={[styles.hintPill, hintAnimatedStyle]}>
          <View style={styles.hintIconWrapper}>
            <Text style={styles.hintIcon}>💳</Text>
          </View>
          <Text style={styles.hintText}>
            Swipe down to browse all cards. Swipe up to stack cards. Tap a card to open details.
          </Text>
        </Animated.View>

        {/* Rest of the Info (Below hint) */}
        <Text style={styles.sectionTitle}>Your reward balances</Text>
        <ExpiryBanner cards={cards} />
        <PointsValueCard cards={cards} totalMin={totalMin} totalMax={totalMax} />
        <WalletMoneyLinks />

      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  demoBanner: {
    borderWidth: 1,
    borderColor: 'rgba(245,208,111,0.35)',
    backgroundColor: 'rgba(245,208,111,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  demoTitle: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14, fontWeight: '700' },
  demoText: { fontFamily: typography.fontFamily, color: '#B0B0B0', fontSize: 13, marginTop: 4, lineHeight: 18 },
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
