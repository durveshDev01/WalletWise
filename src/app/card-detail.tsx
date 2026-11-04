import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View, Pressable, ScrollView, Dimensions, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography } from '../theme';
import { useCardStore, CardData, newHolding, toCardData } from '../store/useCardStore';
import { BillCheckLink, FeeCheckBlock, RedemptionCheckBlock } from '../components/money/CardMoneyBlocks';
import { CreditCardImage } from '../components/CreditCardImage';
import { catalog, DATA_ATTRIBUTION } from '../data/catalog';
import { CATEGORY_LABELS, cardChanges, planRedemption, redemptionRoutes, todayIso } from '../engine';
import type { Category } from '../engine';
import { parseBillDay } from '../engine/billing';
import { BillDayPanel } from '../components/BillDayPanel';
import { CLOSE_FREE_LINE } from '../constants/safety';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Entering animations stay stuck at their first frame on web, so web shows content without them. */
const enter = <T,>(animation: T): T | undefined => (Platform.OS === 'web' ? undefined : animation);

const TABS = ['Earn', 'Transfers', 'Redeem', 'Benefits', 'Updates'] as const;
type TabKey = (typeof TABS)[number];

// ─────────────────────────────────────────────
// Card content, built from the catalog (src/data) and the engine
// ─────────────────────────────────────────────

const CATEGORY_ICONS: Partial<Record<Category, string>> = {
  TRAVEL: '✈︎', DINING: '🍽', GROCERY: '🛒', FUEL: '⛽', ONLINE_SHOPPING: '🛍', UTILITY_BILLS: '💡',
  INSURANCE: '🛡', INTERNATIONAL: '🌍', OTT_SUBSCRIPTIONS: '📺', RENT: '🏠', EDUCATION: '🎓',
};

function getEarnContent(card: CardData) {
  const data = catalog.byId.get(card.catalogId);
  const base = data?.rewards.find((r) => r.category === 'DEFAULT' && !r.merchants);
  const accelerated = (data?.rewards ?? [])
    .filter((r) => r !== base)
    .sort((a, b) => b.ratePct - a.ratePct);
  return {
    rateLabel: 'BASE RETURN',
    rateValue: base ? `${base.ratePct}%` : card.rewardHeadline,
    rateDetail: base ? 'Estimated return on everyday spends at the default redemption value' : '',
    categories: card.rewardCategories.length > 0 ? card.rewardCategories : ['Everyday spends'],
    highlights: accelerated.slice(0, 4).map((r) => ({
      icon: CATEGORY_ICONS[r.category] ?? '★',
      title: CATEGORY_LABELS[r.category],
      value:
        `${r.ratePct}% back${r.merchantsText ? ` on ${r.merchantsText}` : ''}` +
        (r.capRs != null ? ` (up to ₹${r.capRs.toLocaleString('en-IN')} a month)` : ''),
    })),
  };
}

function getTransferContent(card: CardData) {
  const data = catalog.byId.get(card.catalogId);
  const routes = data ? redemptionRoutes(catalog, data).filter((r) => r.kind === 'TRANSFER') : [];
  return {
    forex: card.forexMarkup,
    partners: routes.slice(0, 8).map(
      (r) => `${r.label.replace('Transfer to ', '')}: estimated ₹${r.rupeesPerPoint.toFixed(2)} per source point (${r.confidence.toLowerCase()} confidence). Rule: ${r.ruleSource ?? 'source unavailable'}${r.ruleVerifiedAt ? `, checked ${r.ruleVerifiedAt}` : ', date unavailable'}. Valuation: ${r.valuationSource}${r.valuationVerifiedAt ? `, dated ${r.valuationVerifiedAt}` : ', no verification date'}.`,
    ),
    ratio:
      routes.length > 0
        ? `${routes.length} transfer routes. Values are estimates, not guaranteed cash. Confirm the current ratio and fees with the issuer and redemption programme before transferring.`
        : 'No airline or hotel transfer partners. Use the default redemption route.',
  };
}

/** Latest and upcoming changes to this card (devaluations and improvements). */
function getUpdatesContent(card: CardData) {
  const { upcoming, recent } = cardChanges(catalog, card.catalogId);
  return [...upcoming, ...recent].slice(0, 8).map((c) => ({
    title: c.title,
    desc: `${c.date > todayIso() ? 'From' : 'Since'} ${c.date}${c.after ? `. Now: ${c.after}` : ''}`,
    tag: c.direction === 'devaluation' ? 'Cut' : c.direction === 'revaluation' ? 'Better' : 'Change',
  }));
}

// ─────────────────────────────────────────────
// Tab Content Components
// ─────────────────────────────────────────────

function EarnTab({ card, inWallet }: { card: CardData; inWallet: boolean }) {
  const data = getEarnContent(card);
  return (
    <Animated.View entering={enter(FadeInDown.duration(350).springify())}>
      {/* Rate Card */}
      <View style={s.infoCard}>
        <Text style={s.infoCardLabel}>{data.rateLabel}</Text>
        <Text style={s.infoCardBigValue}>{data.rateValue}</Text>
        <Text style={s.infoCardDesc}>{data.rateDetail}</Text>
      </View>

      {/* Categories */}
      <View style={[s.infoCard, { marginTop: 16 }]}>
        <Text style={s.infoCardLabel}>TOP CATEGORIES</Text>
        <View style={s.chipsContainer}>
          {data.categories.map((cat, i) => (
            <View key={i} style={s.chip}>
              <Text style={s.chipText}>{cat}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Highlights */}
      {data.highlights.length > 0 && (
        <View style={{ marginTop: 16, gap: 12 }}>
          {data.highlights.map((h, i) => (
            <View key={i} style={s.highlightCard}>
              <Text style={s.highlightIcon}>{h.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.highlightTitle}>{h.title}</Text>
                <Text style={s.highlightValue}>{h.value}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Fees */}
      <View style={[s.infoCard, { marginTop: 16 }]}>
        <Text style={s.infoCardLabel}>FEES</Text>
        <View style={s.feeRow}>
          <Text style={s.feeLabel}>Annual Fee</Text>
          <Text style={s.feeValue}>{card.annualFee}</Text>
        </View>
        <View style={s.feeDivider} />
        <View style={s.feeRow}>
          <Text style={s.feeLabel}>Renewal Fee</Text>
          <Text style={s.feeValue}>{card.renewalFee}</Text>
        </View>
      </View>
      {inWallet && <FeeCheckBlock catalogId={card.catalogId} />}
      <BillCheckLink catalogId={card.catalogId} />
    </Animated.View>
  );
}

function TransfersTab({ card }: { card: CardData }) {
  const data = getTransferContent(card);
  return (
    <Animated.View entering={enter(FadeInDown.duration(350).springify())}>
      <View style={s.infoCard}>
        <Text style={s.infoCardLabel}>FOREX MARKUP</Text>
        <Text style={s.infoCardBigValue}>{data.forex}</Text>
      </View>

      <View style={[s.infoCard, { marginTop: 16 }]}>
        <Text style={s.infoCardLabel}>TRANSFER PARTNERS</Text>
        <Text style={[s.infoCardDesc, { marginBottom: 12 }]}>{data.ratio}</Text>
        {data.partners.map((p, i) => (
          <View key={i} style={s.partnerRow}>
            <View style={s.partnerDot} />
            <Text style={s.partnerText}>{p}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function RedeemTab({ card }: { card: CardData }) {
  const experience = useCardStore((st) => st.profile.experience);
  const data = catalog.byId.get(card.catalogId);
  const plan = data && card.points > 0 ? planRedemption(catalog, data, card.points, { experience }) : null;
  return (
    <Animated.View entering={enter(FadeInDown.duration(350).springify())}>
      {plan && (
        <View style={[s.infoCard, { marginBottom: 16 }]}>
          <Text style={s.infoCardLabel}>BEST WAY TO USE {card.points.toLocaleString('en-IN')} {card.currencyName.toUpperCase()}</Text>
          <Text style={[s.infoCardBigValue, { fontSize: 22 }]}>{plan.recommended.label}</Text>
          <Text style={[s.infoCardDesc, { marginTop: 6 }]}>About ₹{plan.valueRs.toLocaleString('en-IN')}. {plan.reason}</Text>
          {plan.alternatives.map((r) => (
            <View key={r.label} style={s.feeRow}>
              <Text style={s.feeLabel}>{r.label}</Text>
              <Text style={s.feeValue}>₹{r.rupeesPerPoint.toFixed(2)}/pt</Text>
            </View>
          ))}
        </View>
      )}
      {/* Reward Value */}
      <View style={[s.infoCard, s.goldCard]}>
        <View style={s.goldCardGlow}>
          <LinearGradient
            colors={['rgba(245, 208, 111, 0.1)', 'transparent']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <Text style={s.infoCardLabel}>REWARD VALUE</Text>
        <Text style={[s.infoCardBigValue, { color: '#F5D06F' }]}>
          ₹{card.highValue.toLocaleString('en-IN')}
        </Text>
        <Text style={s.infoCardDesc}>Estimated via {card.valueRoute} · {card.valueConfidence.toLowerCase()} confidence</Text>
        <Text style={s.infoCardDesc}>{card.valueSource}{card.valueVerifiedAt ? ` · valued ${card.valueVerifiedAt}` : ' · valuation has no verification date'}</Text>
      </View>

      <View style={[s.infoCard, { marginTop: 16 }]}>
        <Text style={s.infoCardLabel}>WALLETWISE TRANSLATION</Text>
        <Text style={[s.infoCardDesc, { marginTop: 8 }]}>{card.translatorExample}</Text>
        <View style={s.feeDivider} />
        <View style={s.feeRow}>
          <Text style={s.feeLabel}>Best Category</Text>
          <Text style={s.feeValue}>{card.intelligence.bestCategory}</Text>
        </View>
        <View style={s.feeDivider} />
        <View style={s.feeRow}>
          <Text style={s.feeLabel}>Annual net estimate (typical spend)</Text>
          <Text style={[s.feeValue, { color: '#F5D06F' }]}>
            ≈ ₹{card.intelligence.potentialAnnualValue.toLocaleString('en-IN')}
          </Text>
        </View>
        <Text style={s.infoCardDesc}>Illustration based on WalletWise&apos;s typical monthly spend profile; your actual return depends on your spend and current issuer terms.</Text>
      </View>
      <RedemptionCheckBlock catalogId={card.catalogId} />
    </Animated.View>
  );
}

function BenefitsTab({ card }: { card: CardData }) {
  return (
    <Animated.View entering={enter(FadeInDown.duration(350).springify())}>
      {/* Lounge */}
      <View style={s.highlightCard}>
        <Text style={s.highlightIcon}>✈︎</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.highlightTitle}>Lounge Access</Text>
          <Text style={s.highlightValue}>{card.loungeAccess}</Text>
        </View>
      </View>

      {/* Core Benefits */}
      <View style={[s.infoCard, { marginTop: 16 }]}>
        <Text style={s.infoCardLabel}>CORE BENEFITS</Text>
        {card.benefits.map((b, i) => (
          <View key={i} style={s.benefitRow}>
            <Text style={s.benefitBullet}>•</Text>
            <Text style={s.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      {/* Milestones */}
      <View style={[s.infoCard, { marginTop: 16 }]}>
        <Text style={s.infoCardLabel}>MILESTONE PERKS</Text>
        {card.milestones.map((m, i) => (
          <View key={i} style={s.benefitRow}>
            <Text style={[s.benefitBullet, { color: '#F5D06F' }]}>★</Text>
            <Text style={s.benefitText}>{m}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function UpdatesTab({ card }: { card: CardData }) {
  const offers = getUpdatesContent(card);
  return (
    <Animated.View entering={enter(FadeInDown.duration(350).springify())}>
      {offers.length === 0 ? (
        <View style={s.infoCard}>
          <Text style={s.infoCardDesc}>
            No recent changes recorded for your {card.cardName}.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {offers.map((offer, i) => (
            <View key={i} style={s.offerCard}>
              <View style={s.offerHeader}>
                <Text style={s.offerTitle}>{offer.title}</Text>
                <View style={s.offerTag}>
                  <Text style={s.offerTagText}>{offer.tag}</Text>
                </View>
              </View>
              <Text style={s.offerDesc}>{offer.desc}</Text>
              {offer.tag === 'Cut' && <Text style={[s.offerDesc, { marginTop: 8, color: '#BDBDBD' }]}>{CLOSE_FREE_LINE}</Text>}
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// Main Card Detail Screen
// ─────────────────────────────────────────────

export default function CardDetailScreen() {
  const router = useRouter();
  // `catalogId` opens any catalog card (Browse cards, Aura); it shows the wallet copy if the user holds it.
  const { id, tab, catalogId } = useLocalSearchParams<{ id?: string; tab?: TabKey; catalogId?: string }>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>(tab && TABS.includes(tab) ? tab : 'Earn');
  const [editing, setEditing] = useState(false);
  const [pointsText, setPointsText] = useState('');
  const [lastFourText, setLastFourText] = useState('');
  const [statementDayText, setStatementDayText] = useState('');
  const [dueDayText, setDueDayText] = useState('');

  const cards = useCardStore((state) => state.cards);
  const updateHolding = useCardStore((state) => state.updateHolding);
  const removeHolding = useCardStore((state) => state.removeHolding);
  const addCard = useCardStore((state) => state.addCard);
  const held = cards.find((c) => c.id === id) ?? (catalogId ? cards.find((c) => c.catalogId === catalogId) : undefined);
  const preview = !held && catalogId && catalog.byId.has(catalogId) ? toCardData(newHolding(catalogId, '', 0)) : null;
  const card = held ?? preview ?? (catalogId ? undefined : cards[0]);
  const holding = useCardStore((state) => state.holdings.find((h) => h.id === card?.id));

  if (!card) {
    return (
      <View style={[s.container, { paddingTop: insets.top + 40, paddingHorizontal: 24 }]}>
        <Text style={s.cardName}>No cards yet</Text>
        <Pressable onPress={() => router.replace('/add-card')} style={{ marginTop: 16 }}>
          <Text style={s.backLabel}>Add a card →</Text>
        </Pressable>
      </View>
    );
  }

  const startEdit = () => {
    setPointsText(String(card.points));
    setLastFourText(card.lastFour);
    setStatementDayText(holding?.statementDay ? String(holding.statementDay) : '');
    setDueDayText(holding?.dueDay ? String(holding.dueDay) : '');
    setEditing(true);
  };
  const saveEdit = () => {
    updateHolding(card.id, { points: Number(pointsText.replace(/[^0-9]/g, '')) || 0, lastFour: lastFourText.replace(/[^0-9]/g, '').slice(-4), statementDay: parseBillDay(statementDayText), dueDay: parseBillDay(dueDayText) });
    setEditing(false);
  };
  const confirmRemove = () => {
    Alert.alert('Remove card?', `${card.bankName} ${card.cardName} will be removed from your wallet.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { removeHolding(card.id); router.back(); } },
    ]);
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={s.backButton}>
          <Text style={s.backButtonText}>←</Text>
          <Text style={s.backLabel}>My Cards</Text>
        </Pressable>
        {preview ? (
          <Pressable onPress={() => addCard(preview.catalogId, '', 0)} accessibilityRole="button">
            <Text style={s.backLabel}>I have it, add</Text>
          </Pressable>
        ) : (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={editing ? saveEdit : startEdit}>
            <Text style={s.backLabel}>{editing ? 'Save' : 'Edit'}</Text>
          </Pressable>
          <Pressable onPress={confirmRemove}>
            <Text style={[s.backLabel, { color: '#C9412E' }]}>Remove</Text>
          </Pressable>
        </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card Art */}
        <Animated.View entering={enter(FadeIn.duration(400))} style={s.heroWrapper}>
          <CreditCardImage card={card} />
        </Animated.View>

        {/* Card Identity */}
        <Animated.View entering={enter(FadeIn.delay(150).duration(400))} style={s.titleSection}>
          <Text style={s.bankName}>{card.bankName}</Text>
          <Text style={s.cardName}>{card.cardName}</Text>
        </Animated.View>

        {/* Points & Estimated Value */}
        {!preview && (
        <Animated.View entering={enter(FadeInDown.delay(250).duration(400))} style={s.statsPanelWrapper}>
          <View style={s.statsPanel}>
            <Text style={s.statsLabel}>AVAILABLE {card.currencyName.toUpperCase()}</Text>
            {editing ? (
              <View style={{ gap: 10, marginVertical: 8 }}>
                <TextInput value={pointsText} onChangeText={setPointsText} keyboardType="number-pad" style={s.editInput} placeholder={`${card.currencyName} balance`} placeholderTextColor="#555" keyboardAppearance="dark" />
                <TextInput value={lastFourText} onChangeText={setLastFourText} keyboardType="number-pad" maxLength={4} style={s.editInput} placeholder="Last 4 digits" placeholderTextColor="#555" keyboardAppearance="dark" />
                <TextInput value={statementDayText} onChangeText={setStatementDayText} keyboardType="number-pad" maxLength={2} style={s.editInput} placeholder="Statement day (1–31, optional)" placeholderTextColor="#555" keyboardAppearance="dark" />
                <TextInput value={dueDayText} onChangeText={setDueDayText} keyboardType="number-pad" maxLength={2} style={s.editInput} placeholder="Due day (1–31, for reminders)" placeholderTextColor="#555" keyboardAppearance="dark" />
                <Text style={s.statsValue}>Copy the balance and dates from your latest statement or bank app.</Text>
              </View>
            ) : (
              <Text style={s.pointsNumerals}>{card.points.toLocaleString('en-IN')}</Text>
            )}
            <View style={s.statsValueRow}>
              <Text style={s.statsValue}>
                Estimated Value  ₹{card.lowValue.toLocaleString('en-IN')}{card.highValue > card.lowValue ? ` – ₹${card.highValue.toLocaleString('en-IN')}` : ''}
              </Text>
            </View>
          </View>
        </Animated.View>
        )}

        {holding && <BillDayPanel holding={holding} onEdit={startEdit} />}

        {/* Tab Bar */}
        <Animated.View entering={enter(FadeIn.delay(350).duration(400))}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.tabScrollView}
            contentContainerStyle={s.tabContainer}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={s.tabItem}
                >
                  <Text style={[s.tabText, isActive && s.tabTextActive]}>
                    {tab}
                  </Text>
                  {isActive && (
                    <LinearGradient
                      colors={['#F5D06F', '#C9962E'] as unknown as readonly [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.tabUnderline}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Tab Content */}
          <View style={s.tabBody}>
            {activeTab === 'Earn' && <EarnTab card={card} inWallet={!preview} />}
            {activeTab === 'Transfers' && <TransfersTab card={card} />}
            {activeTab === 'Redeem' && <RedeemTab card={card} />}
            {activeTab === 'Benefits' && <BenefitsTab card={card} />}
            {activeTab === 'Updates' && <UpdatesTab card={card} />}
            <Text style={s.attribution}>{DATA_ATTRIBUTION}</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const s = StyleSheet.create({
  editInput: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 18,
    backgroundColor: '#181818',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attribution: {
    fontFamily: typography.fontFamily,
    color: '#6F6F6F',
    fontSize: 11,
    marginTop: 24,
    lineHeight: 16,
  },
  container: {
    flex: 1,
    backgroundColor: '#070707',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  backButtonText: {
    color: '#F5D06F',
    fontSize: 22,
  },
  backLabel: {
    fontFamily: typography.fontFamily,
    color: '#F5D06F',
    fontSize: 16,
    fontWeight: '500',
  },
  scrollContent: {},

  // Hero
  heroWrapper: {
    width: SCREEN_WIDTH - 48,
    marginHorizontal: 24,
    alignSelf: 'center',
    marginBottom: 20,
  },

  // Title
  titleSection: {
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  bankName: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardName: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 26,
    fontWeight: '600',
    marginTop: 4,
  },

  // Stats
  statsPanelWrapper: {
    marginHorizontal: 24,
    marginBottom: 24,
  },
  statsPanel: {
    backgroundColor: '#111111',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  statsLabel: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  pointsNumerals: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 40,
    fontWeight: '300',
    letterSpacing: -1,
    marginVertical: 6,
  },
  statsValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsValue: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 13,
  },

  // Tabs
  tabScrollView: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  tabContainer: {
    paddingHorizontal: 24,
    gap: 28,
  },
  tabItem: {
    paddingBottom: 14,
    position: 'relative',
  },
  tabText: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#F5D06F',
    fontWeight: '600',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  tabBody: {
    padding: 24,
  },

  // Info Cards
  infoCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  goldCard: {
    borderColor: 'rgba(245, 208, 111, 0.2)',
  },
  goldCardGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 160,
    height: 160,
  },
  infoCardLabel: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoCardBigValue: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: -0.5,
  },
  infoCardDesc: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  // Chips
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 100,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipText: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 12,
    fontWeight: '500',
  },

  // Highlight Cards
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  highlightIcon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
  },
  highlightTitle: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600',
  },
  highlightValue: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 13,
    marginTop: 2,
  },

  // Fee rows
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  feeLabel: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 14,
  },
  feeValue: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  feeDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 12,
  },

  // Transfer partners
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  partnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F5D06F',
  },
  partnerText: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 14,
  },

  // Benefits
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  benefitBullet: {
    color: '#9A9A9A',
    fontSize: 16,
    lineHeight: 20,
  },
  benefitText: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },

  // Offers
  offerCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  offerTitle: {
    fontFamily: typography.fontFamily,
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  offerTag: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 100,
    backgroundColor: 'rgba(245, 208, 111, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 208, 111, 0.3)',
  },
  offerTagText: {
    fontFamily: typography.fontFamily,
    color: '#F5D06F',
    fontSize: 11,
    fontWeight: '600',
  },
  offerDesc: {
    fontFamily: typography.fontFamily,
    color: '#9A9A9A',
    fontSize: 13,
    lineHeight: 18,
  },
});
