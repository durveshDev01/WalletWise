import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, Pressable, ScrollView, 
  useWindowDimensions, TextInput
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, interpolate,
  Extrapolation, useAnimatedScrollHandler
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { colors, typography } from '../../theme';
import { useCardStore } from '../../store/useCardStore';
import { CardArt } from '../../components/CardArt';
import { VideoRail } from '../../components/VideoRail';
import { catalog } from '../../data/catalog';
import { scorePurchase } from '../../engine';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ==========================================
// 1. REUSABLE ANIMATED COMPONENTS
// ==========================================
const AnimatedCard = ({ children, style, onPress }: any) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));
  return (
    <AnimatedPressable
      onPressIn={() => scale.set(withSpring(0.97, { damping: 20, stiffness: 180 }))}
      onPressOut={() => scale.set(withSpring(1))}
      onPress={onPress}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};

const SAFETY_LINKS = [
  { href: '/scam-check', title: 'Is this a scam?', sub: 'Fake “points expire” texts, APK files, OTP calls: check one and see what to do.' },
  { href: '/rights', title: 'Your rights as a cardholder', sub: 'What RBI rules promise you, and a complaint letter you can copy.' },
  { href: '/family', title: 'Family and add-on cards', sub: 'Share a card safely, and copy your wallet to another phone.' },
] as const;

// ==========================================
// 3. EXPLORE TOPICS
// ==========================================
const TOPICS = ['Travel', 'Dining', 'Grocery', 'Electronics', 'Shopping', 'Pharmacy/Health', 'Entertainment', 'Business'];
const ExploreTopics = () => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>EXPLORE TOPICS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicsScroll}>
        {TOPICS.map(topic => {
          return (
            <Pressable 
              key={topic} 
              onPress={() => router.push({ pathname: '/topic/[id]', params: { id: topic.toLowerCase() } })} 
              style={styles.topicPill}
            >
              <Text style={styles.topicText}>{topic}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

// ==========================================
// 4. LEARN WITH YOUR CARDS (WITH REAL CARD ART)
// ==========================================
const LearnWithCards = () => {
  const { cards } = useCardStore();
  const { width } = useWindowDimensions();
  
  if (!cards || cards.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>LEARN WITH YOUR CARDS</Text>
      <Text style={[styles.sectionTitle, { color: colors.text.secondary, textTransform: 'none', fontSize: 13, marginTop: -12, marginBottom: 16, fontWeight: '400' }]}>Understand how YOUR cards actually work.</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        snapToInterval={width * 0.75 + 16}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
      >
        {cards.map(c => (
          <AnimatedCard 
            key={c.id} 
            style={[styles.learnCard, { width: width * 0.75 }]}
            onPress={() => router.push(`/card-detail?id=${c.id}`)}
          >
            <View style={styles.learnCardArtworkWrapper}>
              {/* REAL CARD ART INSTEAD OF PLACEHOLDER */}
              <View style={{ width: 140, height: 90, transform: [{ rotate: '5deg' }, { translateX: 20 }] }}>
                 <CardArt card={c} />
              </View>
            </View>
            <View style={styles.learnCardContent}>
              <Text style={styles.learnCardBank}>{c.bankName}</Text>
              <Text style={styles.learnCardName}>{c.cardName}</Text>
              <Text style={styles.learnCardDesc}>Master {c.cardName} rewards and optimizations.</Text>
              <Text style={styles.learnCardLink}>Learn Optimization →</Text>
            </View>
          </AnimatedCard>
        ))}
      </ScrollView>
    </View>
  );
};

// ==========================================
// 5. INTERACTIVE POINTS CALCULATOR
// ==========================================
const PointsCalculator = () => {
  const { cards } = useCardStore();
  const [spend, setSpend] = useState('');
  const [selectedCardId, setSelectedCardId] = useState(cards?.[0]?.id || null);

  const selectedCard = cards?.find(c => c.id === selectedCardId);
  const engineCard = selectedCard ? catalog.byId.get(selectedCard.catalogId) : undefined;
  // Everyday (base-rate) spend on the selected card, valued by the WalletWise engine with monthly caps.
  const result = engineCard && Number(spend) > 0
    ? scorePurchase(catalog, engineCard, { amount: Number(spend), category: 'DEFAULT' })
    : null;
  const rate = result ? result.effectiveRatePct / 100 : 0;
  const value = result ? Math.round(result.safeValue) : 0;
  
  return (
    <View style={[styles.toolCard, { width: '100%', marginBottom: 16 }]}>
      <Text style={styles.toolIcon}>⨢</Text>
      <Text style={styles.toolTitle}>Points Calculator</Text>
      <Text style={styles.toolSub}>Calculate what your spending could earn.</Text>
      
      <View style={styles.calcRow}>
        <Text style={styles.calcCurrency}>₹</Text>
        <TextInput 
          style={styles.calcInput}
          placeholder="10000"
          placeholderTextColor="#6F6F6F"
          keyboardType="numeric"
          value={spend}
          onChangeText={setSpend}
        />
      </View>

      {cards && cards.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: typography.fontFamily, fontSize: 12, color: colors.text.secondary, marginBottom: 8 }}>Select Card:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {cards.map(c => {
              const isSelected = c.id === selectedCardId;
              return (
                <Pressable 
                  key={c.id} 
                  onPress={() => setSelectedCardId(c.id)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, 
                    borderRadius: 8, borderWidth: 1, 
                    borderColor: isSelected ? colors.accent.goldStart : '#333',
                    backgroundColor: isSelected ? 'rgba(245, 208, 111, 0.1)' : '#111'
                  }}
                >
                  <Text style={{ 
                    color: isSelected ? colors.accent.goldStart : colors.text.secondary, 
                    fontSize: 12, fontWeight: isSelected ? '600' : '400' 
                  }}>
                    {c.cardName}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      
      <View style={styles.calcResultBox}>
        <View>
          <Text style={styles.calcResultText}>Estimated Yield:</Text>
          <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }}>
            Everyday spend on {selectedCard?.cardName || 'your card'} ({(rate * 100).toFixed(2)}% value back)
          </Text>
        </View>
        <Text style={styles.calcResultValue}>₹{value.toLocaleString('en-IN')}</Text>
      </View>
    </View>
  );
};

// ==========================================
// ==========================================
// 6. INTERACTIVE QUIZ DECK (Learning Flow)
// ==========================================
const QUIZ_BANK = [
  {
    question: "You are spending ₹5,000 on fuel. Which card should you use?",
    options: ["HDFC Infinia", "SBI BPCL Octane"],
    correctIdx: 1,
    rationale: "Octane gives about 6.25% value back on BPCL fuel (capped monthly), while Infinia lists no fuel reward rate."
  },
  {
    question: "Which card offers unlimited international lounge access for cardholders and add-ons?",
    options: ["Regalia Gold", "HDFC Infinia"],
    correctIdx: 1,
    rationale: "Infinia provides unlimited Priority Pass lounge visits globally for both primary and add-on members."
  },
  {
    question: "A ₹10,000 card balance is left unpaid at about 3.75% a month. What does one month cost?",
    options: ["About ₹375 plus GST", "Nothing if you pay the minimum"],
    correctIdx: 0,
    rationale: "Interest runs on the unpaid balance, and paying only the minimum also removes the interest-free grace period on all new spends until cleared. Always pay the full statement balance."
  },
  {
    question: "Which card's points give the highest direct value for Marriott Bonvoy hotel transfers?",
    options: ["HDFC Diners Club Black", "Marriott Bonvoy HDFC"],
    correctIdx: 1,
    rationale: "The Marriott Bonvoy card earns Bonvoy points directly, yielding better hotel room value than standard 1:1 or 2:1 bank transfer ratios."
  },
  {
    question: "Can cashback rewards earned on SBI Cashback be transferred to airline air miles?",
    options: ["Yes, to Air India and Singapore KrisFlyer", "No, cashback is credited as a statement credit only"],
    correctIdx: 1,
    rationale: "Cashback-only cards credit your monthly statement directly. They have no frequent-flyer transfer partners."
  }
];

const CardQuiz = () => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const ringScale = useSharedValue(0);

  const question = QUIZ_BANK[currentIdx];
  const isAnswered = selectedIdx !== null;
  const isCorrect = selectedIdx === question.correctIdx;

  const handleAnswer = (idx: number) => {
    if (isAnswered) return;
    setSelectedIdx(idx);
    if (idx === question.correctIdx) {
      setScore((s) => s + 1);
    }
    ringScale.value = withSpring(1);
  };

  const handleNext = () => {
    ringScale.value = 0;
    setSelectedIdx(null);
    if (currentIdx + 1 < QUIZ_BANK.length) {
      setCurrentIdx((i) => i + 1);
    } else {
      setShowSummary(true);
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setSelectedIdx(null);
    setScore(0);
    setShowSummary(false);
    ringScale.value = 0;
  };

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: interpolate(ringScale.value, [0, 1], [0, 1]),
  }));

  if (showSummary) {
    const pct = Math.round((score / QUIZ_BANK.length) * 100);
    const badge = pct >= 80 ? '🏆 Credit Card Master' : pct >= 60 ? '🎓 Smart Cardholder' : '📖 Credit Explorer';
    return (
      <View style={[styles.toolCard, { width: '100%', marginBottom: 16 }]}>
        <Text style={styles.toolIcon}>🏅</Text>
        <Text style={styles.toolTitle}>Quiz Completed!</Text>
        <Text style={styles.summaryBadge}>{badge}</Text>
        <Text style={styles.toolSub}>
          You scored {score} out of {QUIZ_BANK.length} ({pct}%).
        </Text>
        <View style={styles.summaryTakeaway}>
          <Text style={styles.summaryTakeawayTitle}>Key Takeaway:</Text>
          <Text style={styles.summaryTakeawayText}>
            Never carry an unpaid balance (it cancels your grace period), match category spend to dedicated multiplier cards, and keep cashback separate from air miles.
          </Text>
        </View>
        <Pressable style={styles.quizNextBtn} onPress={handleRestart}>
          <Text style={styles.quizNextBtnText}>Retake Quiz ↺</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.toolCard, { width: '100%', marginBottom: 16 }]}>
      <View style={styles.quizDeckHeader}>
        <Text style={styles.toolIcon}>?</Text>
        <Text style={styles.quizDeckCounter}>Question {currentIdx + 1} of {QUIZ_BANK.length}</Text>
      </View>
      <View style={styles.quizProgressBar}>
        <View style={[styles.quizProgressFill, { width: `${((currentIdx + 1) / QUIZ_BANK.length) * 100}%` }]} />
      </View>

      <Text style={[styles.toolSub, { marginTop: 12 }]}>{question.question}</Text>

      {!isAnswered ? (
        <View style={styles.quizOptions}>
          {question.options.map((opt, i) => (
            <Pressable key={i} style={styles.quizBtn} onPress={() => handleAnswer(i)}>
              <Text style={styles.quizBtnText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View
            style={[
              styles.quizResult,
              {
                borderColor: isCorrect ? 'rgba(84, 199, 138, 0.2)' : 'rgba(201, 65, 46, 0.2)',
                backgroundColor: isCorrect ? 'rgba(84, 199, 138, 0.05)' : 'rgba(201, 65, 46, 0.05)',
              },
            ]}
          >
            <Animated.View
              style={[
                styles.quizRing,
                ringStyle,
                { backgroundColor: isCorrect ? '#54C78A' : colors.accent.danger },
              ]}
            >
              <Text style={styles.quizResultIcon}>{isCorrect ? '✓' : '✗'}</Text>
            </Animated.View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={[styles.quizResultTitle, { color: isCorrect ? '#54C78A' : colors.accent.danger }]}>
                {isCorrect ? `${question.options[question.correctIdx]} is correct!` : 'Incorrect.'}
              </Text>
              <Text style={styles.quizResultDesc}>{question.rationale}</Text>
            </View>
          </View>
          <Pressable style={styles.quizNextBtn} onPress={handleNext}>
            <Text style={styles.quizNextBtnText}>
              {currentIdx + 1 < QUIZ_BANK.length ? 'Next Question →' : 'View Results →'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};
const InteractiveTools = () => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>INTERACTIVE TOOLS</Text>
      <View style={{ paddingHorizontal: 24 }}>
        <PointsCalculator />
        <CardQuiz />
      </View>
    </View>
  );
};

// ==========================================
// 7. MYTH VS FACT (3D FLIP)
// ==========================================
const MYTH_BANK = [
  {
    myth: '"Having multiple credit cards hurts your CIBIL score."',
    fact: 'Holding a few cards does not hurt your score by itself. What hurts is applying for many at once, missing a payment, or using most of your limit. Only add a card you need.'
  },
  {
    myth: '"Paying only the Minimum Amount Due protects your credit score without extra costs."',
    fact: 'You avoid late fees, but you will be charged massive interest (3-4% monthly) on the remaining balance. Always pay in full.'
  },
  {
    myth: '"Closing an old, unused credit card will improve your credit score."',
    fact: 'Closing an old card reduces your average credit age and total available credit limit, which can actually drop your CIBIL score.'
  },
  {
    myth: '"Withdrawing cash from an ATM using a credit card is the same as a debit card."',
    fact: 'Credit card cash advances incur a hefty immediate withdrawal fee and high interest charges from day one, with no grace period.'
  }
];

const MythVsFact = () => {
  const [flipped, setFlipped] = useState(false);
  const [content] = useState(() => MYTH_BANK[Math.floor(Math.random() * MYTH_BANK.length)]);
  const flipVal = useSharedValue(0);


  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flipVal.value, [0, 1], [0, 90])}deg` }],
    opacity: interpolate(flipVal.value, [0, 0.5], [1, 0])
  }));
  
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flipVal.value, [0, 1], [-90, 0])}deg` }],
    opacity: interpolate(flipVal.value, [0.5, 1], [0, 1]),
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0
  }));

  const handlePress = () => {
    flipVal.set(withSpring(flipped ? 0 : 1, { damping: 15, stiffness: 120 }));
    setFlipped(!flipped);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>MYTH VS FACT</Text>
      <Pressable onPress={handlePress} style={styles.flipContainer}>
        <Animated.View style={[styles.flipCard, frontStyle]}>
          <Text style={styles.flipBadge}>MYTH</Text>
          <Text style={styles.flipText}>{content.myth}</Text>
          <Text style={styles.flipHint}>Tap to reveal fact</Text>
        </Animated.View>
        <Animated.View style={[styles.flipCard, styles.flipCardBack, backStyle]}>
          <Text style={[styles.flipBadge, { color: '#54C78A' }]}>FACT</Text>
          <Text style={styles.flipText}>{content.fact}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
};

// ==========================================
// 8. ACADEMY TIMELINE
// ==========================================
const Academy = () => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>CREDIT CARD ACADEMY</Text>
      <View style={styles.academyBox}>
        {[
          { title: "FOUNDATIONS", sub: "Bill, due date and interest-free period", status: "active", q: "Explain the interest free period" },
          { title: "REWARDS", sub: "Points versus cashback", status: "active", q: "How do reward points work?" },
          { title: "OPTIMIZATION", sub: "Choose the right card", status: "active", q: "Is a new card worth it for me?" },
          { title: "ADVANCED", sub: "Transfer points to airlines", status: "active", q: "How do transfer partners and miles work?" }
        ].map((node, i) => (
          <Pressable key={i} style={styles.academyNode} onPress={() => router.push({ pathname: '/aura', params: { q: node.q } })}>
            <View style={styles.nodeLine}>
              <View style={[
                styles.nodeDot, 
                node.status === 'done' && styles.nodeDotDone,
                node.status === 'active' && styles.nodeDotActive
              ]}>
                {node.status === 'done' && <Text style={styles.checkIcon}>✓</Text>}
              </View>
              {i < 3 && <View style={[styles.nodePath, node.status === 'done' && styles.nodePathDone]} />}
            </View>
            <View style={styles.nodeContent}>
              <Text style={[styles.nodeTitle, node.status === 'locked' && styles.textMuted]}>0{i+1} {node.title}</Text>
              <Text style={styles.nodeSub}>{node.sub}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

// ==========================================
// MAIN SCREEN COMPONENT
// ==========================================
export default function LearnScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; }
  });

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 100], [1, 0.9]),
    transform: [{ scale: interpolate(scrollY.value, [0, 100], [1, 0.98], Extrapolation.CLAMP) }]
  }));

  return (
    <View style={styles.container}>
      {/* Ambient Background */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={['rgba(245, 208, 111, 0.03)', 'transparent']} style={{ height: 400 }} />
      </View>

      <Animated.ScrollView 
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.header, headerStyle]}>
          <Text style={styles.headerLabel}>LEARN</Text>
          <Text style={styles.headerTitle}>Master Your{'\n'}Credit Cards</Text>
          <Text style={styles.headerSub}>Learn smarter.{'\n'}Optimize every swipe.</Text>
          
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⚲</Text>
            <TextInput 
              placeholder="Ask anything, e.g. what is a billing cycle?"
              returnKeyType="search"
              onSubmitEditing={(e) => {
                const q = e.nativeEvent.text.trim();
                if (q) router.push({ pathname: '/aura', params: { q } });
              }}
              placeholderTextColor="#6F6F6F"
              style={styles.searchInput}
            />
          </View>
        </Animated.View>

        {/* Start here: the one rule every new cardholder needs */}
        <View style={[styles.section, { paddingHorizontal: 24 }]}>
          <Text style={styles.sectionTitle}>START HERE</Text>
          <AnimatedCard style={styles.continueCard} onPress={() => router.push({ pathname: '/aura', params: { q: 'How does a credit card work?' } })}>
            <Text style={styles.continueTitle}>Rule one: pay the full bill, every month</Text>
            <Text style={styles.continueSub}>
              Rewards are only worth it when you never pay interest. Ask Aura how a credit card works, then take the quiz below.
            </Text>
            <Text style={styles.continueLink}>Ask Aura →</Text>
          </AnimatedCard>
          <AnimatedCard style={[styles.continueCard, { marginTop: 12 }]} onPress={() => router.push('/find-card')}>
            <Text style={styles.continueTitle}>Which card is right for me?</Text>
            <Text style={styles.continueSub}>Answer a few questions about your spending and get an honest pick from {catalog.cards.length} Indian cards.</Text>
            <Text style={styles.continueLink}>Find My Card →</Text>
          </AnimatedCard>
          <AnimatedCard style={[styles.continueCard, { marginTop: 12 }]} onPress={() => router.push('/build-credit')}>
            <Text style={styles.continueTitle}>Build your CIBIL score</Text>
            <Text style={styles.continueSub}>Six simple steps for a good credit score, whether you are getting your first card or already have one.</Text>
            <Text style={styles.continueLink}>See the plan →</Text>
          </AnimatedCard>
        </View>

        {/* Stay safe: rights, scams, family cards (src/app/rights.tsx, scam-check.tsx, family.tsx) */}
        <View style={[styles.section, { paddingHorizontal: 24, gap: 12 }]}>
          <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>STAY SAFE</Text>
          {SAFETY_LINKS.map((l) => (
            <AnimatedCard key={l.href} style={styles.continueCard} onPress={() => router.push(l.href)}>
              <Text style={styles.continueTitle}>{l.title}</Text>
              <Text style={[styles.continueSub, { marginBottom: 0 }]}>{l.sub}</Text>
            </AnimatedCard>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 24 }]}>BEGINNER VIDEOS</Text>
          <VideoRail level="Beginner" horizontalPadding={24} />
        </View>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 24 }]}>EARN MORE REWARDS</Text>
          <VideoRail level="Rewards" horizontalPadding={24} />
        </View>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: 24 }]}>TRAVEL WITH POINTS</Text>
          <VideoRail level="Travel" horizontalPadding={24} />
        </View>
        <ExploreTopics />
        <LearnWithCards />
        <InteractiveTools />
        <Academy />
        <MythVsFact />

      </Animated.ScrollView>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 24, marginBottom: 32 },
  headerLabel: { fontFamily: typography.fontFamily, fontSize: 12, color: colors.accent.goldStart, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  headerTitle: { fontFamily: typography.fontFamily, fontSize: 36, color: colors.text.primary, fontWeight: '600', letterSpacing: -1, lineHeight: 40 },
  headerSub: { fontFamily: typography.fontFamily, fontSize: 16, color: colors.text.secondary, marginTop: 12, lineHeight: 22 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, height: 48, marginTop: 24, borderWidth: 1, borderColor: '#333' },
  searchIcon: { fontSize: 20, color: '#6F6F6F', marginRight: 8, transform: [{rotate: '-45deg'}] },
  searchInput: { flex: 1, color: colors.text.primary, fontFamily: typography.fontFamily, fontSize: 16 },
  
  section: { marginBottom: 40 },
  sectionTitle: { fontFamily: typography.fontFamily, fontSize: 11, color: '#6F6F6F', fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 24, marginBottom: 16 },
  
  continueCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(245, 208, 111, 0.15)' },
  continueTitle: { fontFamily: typography.fontFamily, fontSize: 18, color: colors.text.primary, fontWeight: '600' },
  continueSub: { fontFamily: typography.fontFamily, fontSize: 14, color: colors.text.secondary, marginTop: 4, marginBottom: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressBar: { flex: 1, height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent.goldStart, borderRadius: 3 },
  progressText: { fontFamily: typography.fontFamily, fontSize: 12, color: colors.accent.goldStart, fontWeight: '700' },
  continueLink: { fontFamily: typography.fontFamily, fontSize: 14, color: colors.accent.goldStart, fontWeight: '600' },

  videoCard: { marginHorizontal: 24, backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  videoThumbnail: { height: 180, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  videoOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', padding: 12 },
  playButtonWrapper: { position: 'absolute', zIndex: 10 },
  playButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(7,7,7,0.7)', borderWidth: 1, borderColor: 'rgba(245, 208, 111, 0.4)', justifyContent: 'center', alignItems: 'center' },
  playIcon: { color: colors.accent.goldStart, fontSize: 20, marginLeft: 4 },
  videoBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  videoBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600', fontFamily: typography.fontFamily },
  videoMeta: { padding: 16 },
  videoTitle: { fontFamily: typography.fontFamily, fontSize: 16, color: colors.text.primary, fontWeight: '600', marginBottom: 4 },
  videoSub: { fontFamily: typography.fontFamily, fontSize: 13, color: colors.text.secondary },

  topicsScroll: { paddingHorizontal: 24, gap: 12 },
  topicPill: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#333' },
  topicPillActive: { backgroundColor: colors.accent.goldStart, borderColor: colors.accent.goldStart },
  topicText: { fontFamily: typography.fontFamily, fontSize: 14, color: colors.text.secondary, fontWeight: '500' },
  topicTextActive: { color: '#000', fontWeight: '700' },

  learnCard: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  learnCardArtworkWrapper: { height: 130, padding: 16, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  learnCardBank: { fontFamily: typography.fontFamily, fontSize: 12, color: colors.text.secondary, textTransform: 'uppercase', marginBottom: 4 },
  learnCardName: { fontFamily: typography.fontFamily, fontSize: 18, color: '#FFF', fontWeight: '600' },
  learnCardContent: { padding: 16 },
  learnCardDesc: { fontFamily: typography.fontFamily, fontSize: 14, color: colors.text.secondary, marginBottom: 16, marginTop: 4 },
  learnCardLink: { fontFamily: typography.fontFamily, fontSize: 13, color: colors.accent.goldStart, fontWeight: '600' },

  toolCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#333' },
  toolIcon: { fontSize: 24, color: colors.accent.goldStart, marginBottom: 12 },
  toolTitle: { fontFamily: typography.fontFamily, fontSize: 16, color: colors.text.primary, fontWeight: '600', marginBottom: 4 },
  toolSub: { fontFamily: typography.fontFamily, fontSize: 14, color: colors.text.secondary, lineHeight: 20, marginBottom: 16 },
  
  calcRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: '#222' },
  calcCurrency: { color: colors.text.secondary, fontSize: 18, marginRight: 8 },
  calcInput: { flex: 1, color: colors.text.primary, fontSize: 18, fontWeight: '600' },
  calcResultBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: 16, backgroundColor: 'rgba(245, 208, 111, 0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245, 208, 111, 0.15)' },
  calcResultText: { color: colors.accent.goldStart, fontSize: 14, fontWeight: '600' },
  calcResultValue: { color: '#FFF', fontSize: 18, fontWeight: '700' },

  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18, color: colors.accent.goldStart },
  quizDeckHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quizDeckCounter: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 12, fontWeight: '700' },
  quizProgressBar: { height: 4, backgroundColor: '#202020', borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  quizProgressFill: { height: '100%', backgroundColor: colors.accent.goldStart, borderRadius: 2 },
  quizNextBtn: { backgroundColor: 'rgba(245, 208, 111, 0.15)', borderWidth: 1, borderColor: colors.accent.goldStart, paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  quizNextBtnText: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 14, fontWeight: '700' },
  summaryBadge: { fontFamily: typography.fontFamily, color: colors.accent.goldStart, fontSize: 16, fontWeight: '700', marginTop: 4 },
  summaryTakeaway: { backgroundColor: '#141414', borderRadius: 10, borderWidth: 1, borderColor: '#222', padding: 12, marginVertical: 12 },
  summaryTakeawayTitle: { fontFamily: typography.fontFamily, color: '#F0F0F0', fontSize: 13, fontWeight: '600' },
  summaryTakeawayText: { fontFamily: typography.fontFamily, color: '#999', fontSize: 12, lineHeight: 17, marginTop: 4 },
  quizOptions: { gap: 12 },
  quizBtn: { backgroundColor: '#000', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#222' },
  quizBtnText: { color: colors.text.primary, fontSize: 15, fontWeight: '500', textAlign: 'center' },
  quizResult: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: 'rgba(84, 199, 138, 0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(84, 199, 138, 0.2)' },
  quizRing: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#54C78A', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  quizResultIcon: { color: '#000', fontSize: 16, fontWeight: '800' },
  quizResultTitle: { color: '#54C78A', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  quizResultDesc: { color: colors.text.secondary, fontSize: 13, lineHeight: 18 },

  flipContainer: { paddingHorizontal: 24, height: 160 },
  flipCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#333', backfaceVisibility: 'hidden', justifyContent: 'center' },
  flipCardBack: { backgroundColor: '#141414', borderColor: 'rgba(245, 208, 111, 0.3)' },
  flipBadge: { fontFamily: typography.fontFamily, fontSize: 11, color: '#6F6F6F', fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  flipText: { fontFamily: typography.fontFamily, fontSize: 18, color: colors.text.primary, fontWeight: '500', lineHeight: 26 },
  flipHint: { fontFamily: typography.fontFamily, fontSize: 12, color: colors.accent.goldStart, marginTop: 16, fontWeight: '600' },

  academyBox: { marginHorizontal: 24, backgroundColor: colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#333' },
  academyNode: { flexDirection: 'row', gap: 16 },
  nodeLine: { alignItems: 'center', width: 24 },
  nodeDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#222', borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  nodeDotDone: { backgroundColor: 'rgba(245, 208, 111, 0.1)', borderColor: colors.accent.goldStart },
  nodeDotActive: { backgroundColor: colors.surface, borderColor: colors.accent.goldStart, shadowColor: colors.accent.goldStart, shadowOpacity: 0.5, shadowRadius: 8 },
  checkIcon: { fontSize: 12, color: colors.accent.goldStart, fontWeight: '900' },
  nodePath: { width: 2, height: 40, backgroundColor: '#333', marginVertical: 4 },
  nodePathDone: { backgroundColor: colors.accent.goldStart },
  nodeContent: { flex: 1, paddingBottom: 24, marginTop: 2 },
  nodeTitle: { fontFamily: typography.fontFamily, fontSize: 16, color: colors.text.primary, fontWeight: '600' },
  nodeSub: { fontFamily: typography.fontFamily, fontSize: 13, color: colors.text.secondary, marginTop: 4 },
  textMuted: { color: '#6F6F6F' }
});
