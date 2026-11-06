import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon } from '../../components/Icon';
import { catalog } from '../../data/catalog';
import { AuraError, askAura } from '../../services/auraApi';
import type { AuraCta, AuraErrorKind, AuraTurn } from '../../services/auraApi';
import { AURA_STRINGS } from '../../services/auraStrings';
import { answerOffline, offlineUnavailableText } from '../../services/offlineAura';
import { useCardStore } from '../../store/useCardStore';
import { theme } from '../../theme';

// Aura answers on the WalletWise server (server/): a Groq model that calls the app's
// engine and a verified card knowledge base. Suggestion chips and the welcome text
// come from services/auraStrings.ts in the chosen language.

/** Errors after which the phone answers common questions itself (services/offlineAura.ts). */
const OFFLINE_FALLBACK: AuraErrorKind[] = ['offline', 'busy', 'timeout', 'setup'];
/** Wait before the one automatic retry when Aura is busy. */
const BUSY_RETRY_MS = 3000;

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cta?: AuraCta | null;
  state?: 'streaming' | 'done' | 'error';
  /** For error bubbles and offline answers: the question to send again. */
  retryQuestion?: string;
  /** Answered on the phone because Aura could not be reached. */
  offline?: boolean;
};

/** Removes markdown emphasis and headings the model sometimes adds, so no raw * or # shows. */
const plain = (text: string) =>
  text
    .replace(/\*\*|__/g, '')
    .replace(/(^|\s)\*(?=\S)([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '');

let nextId = 0;
const newId = () => `m${++nextId}`;

/** Three gold dots that pulse while Aura is working. */
function TypingDots({ label }: { label: string }) {
  const dots = [useSharedValue(0.3), useSharedValue(0.3), useSharedValue(0.3)];
  useEffect(() => {
    dots.forEach((d, i) =>
      d.set(withDelay(i * 150, withRepeat(withSequence(withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }), withTiming(0.3, { duration: 400 })), -1))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const s0 = useAnimatedStyle(() => ({ opacity: dots[0].get() }));
  const s1 = useAnimatedStyle(() => ({ opacity: dots[1].get() }));
  const s2 = useAnimatedStyle(() => ({ opacity: dots[2].get() }));
  return (
    <View style={styles.dots} accessibilityLabel={label}>
      {[s0, s1, s2].map((s, i) => (
        <Animated.View key={i} style={[styles.dot, s]} />
      ))}
    </View>
  );
}

export default function AuraScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { userId, holdings, profile } = useCardStore();
  const language = useCardStore((s) => s.auraLanguage ?? 'en');
  const simple = useCardStore((s) => s.auraSimple === true);
  const setAuraLanguage = useCardStore((s) => s.setAuraLanguage);
  const savedMessages = useCardStore((s) => s.auraMessages);
  const setAuraMessages = useCardStore((s) => s.setAuraMessages);
  const clearAuraMessages = useCardStore((s) => s.clearAuraMessages);
  const t = AURA_STRINGS[language];
  const scrollRef = useRef<ScrollView>(null);
  const handledQuery = useRef<string | undefined>(undefined);

  const [messages, setMessages] = useState<Message[]>(() => {
    if (savedMessages && savedMessages.length > 0) return savedMessages;
    return [{ id: 'welcome', role: 'assistant', content: '', state: 'done' }];
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!busy && messages.length > 0 && messages.every((m) => m.state !== 'streaming')) {
      setAuraMessages(messages);
    }
  }, [messages, busy, setAuraMessages]);

  const handleClearChat = () => {
    clearAuraMessages();
    setMessages([{ id: 'welcome', role: 'assistant', content: '', state: 'done' }]);
  };

  const patch = (id: string, change: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)));

  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

  const ask = useCallback(
    async (text: string, options: { retryOf?: string } = {}) => {
      const question = text.trim();
      if (!question || busy) return;
      setInput('');
      setBusy(true);
      setStatus(null);

      // History for the server: finished messages only, plus this question.
      const history: AuraTurn[] = messages
        .filter((m) => m.id !== 'welcome' && m.state !== 'error' && !m.offline && m.id !== options.retryOf && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));
      const replyId = newId();
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== options.retryOf),
        ...(options.retryOf ? [] : [{ id: newId(), role: 'user' as const, content: question, state: 'done' as const }]),
        { id: replyId, role: 'assistant', content: '', state: 'streaming' },
      ]);
      scrollToEnd();

      const request = () => {
        // A failed attempt may have streamed part of an answer; start clean.
        patch(replyId, { content: '' });
        return askAura(
          {
            userId,
            messages: [...history, { role: 'user' as const, content: question }].slice(-12),
            wallet: {
              cards: holdings.map((h) => ({ catalogId: h.catalogId, points: h.points })),
              profile: { experience: profile.experience, repayment: profile.repayment, monthlySpend: profile.monthlySpend as Record<string, number> },
            },
            language,
            simple,
          },
          {
            onStatus: (message) => setStatus(t.statuses[message] ?? message),
            onText: (delta) => {
              setStatus(null);
              patch(replyId, (m) => ({ content: m.content + delta }));
            },
          },
        );
      };

      try {
        let result;
        try {
          result = await request();
        } catch (error) {
          // Busy usually clears quickly: retry once before falling back.
          if (!(error instanceof AuraError) || error.kind !== 'busy') throw error;
          await new Promise((r) => setTimeout(r, BUSY_RETRY_MS));
          result = await request();
        }
        patch(replyId, { content: result.text, cta: result.cta, state: 'done' });
      } catch (error) {
        const kind: AuraErrorKind = error instanceof AuraError ? error.kind : 'failed';
        const local = OFFLINE_FALLBACK.includes(kind)
          ? answerOffline(question, {
              catalog,
              holdings: holdings.map((h) => ({ catalogId: h.catalogId, points: h.points })),
              language,
              simple,
              experience: profile.experience,
            })
          : null;
        if (local) {
          patch(replyId, { content: local.text, state: 'done', offline: true, cta: null, retryQuestion: question });
        } else {
          const message = kind === 'offline' ? offlineUnavailableText(language) : t.errors[kind];
          patch(replyId, { content: message, state: 'error', retryQuestion: question });
        }
      } finally {
        setBusy(false);
        setStatus(null);
        scrollToEnd();
      }
    },
    [busy, messages, userId, holdings, profile, language, simple, t],
  );

  // Questions sent from other screens (for example the Home Aura bar).
  useEffect(() => {
    if (q && handledQuery.current !== q) {
      handledQuery.current = q;
      ask(q);
    }
  }, [q, ask]);

  const openCta = (cta: AuraCta) => {
    // Card details open by wallet entry; the server refers to cards by catalog id.
    if (cta.route === '/card-detail' && cta.params?.catalogId) {
      const holding = holdings.find((h) => h.catalogId === cta.params?.catalogId);
      if (holding) router.push({ pathname: '/card-detail', params: { id: holding.id } });
      return;
    }
    router.push({ pathname: cta.route as never, params: cta.params });
  };

  const showSuggestions = messages.length === 1 && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerTopActions}>
            {messages.length > 1 && (
              <Pressable
                onPress={handleClearChat}
                accessibilityRole="button"
                accessibilityLabel="Clear chat history"
                hitSlop={theme.spacing.sm}
                style={styles.clearChatBtn}
              >
                <Text style={styles.clearChatText}>Clear</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setAuraLanguage(language === 'hi' ? 'en' : 'hi')}
              accessibilityRole="button"
              accessibilityLabel={t.languageToggle}
              hitSlop={theme.spacing.sm}
              style={({ pressed }) => [styles.langToggle, pressed && styles.pressed]}
            >
              <Text style={[theme.text.caption, language === 'en' ? styles.langOn : undefined]}>EN</Text>
              <Text style={theme.text.caption}>|</Text>
              <Text style={[theme.text.caption, language === 'hi' ? styles.langOn : undefined]}>हिं</Text>
            </Pressable>
          </View>
          <View style={styles.headerIcon}>
            <Icon name="sparkle" color={theme.colors.gold} size={theme.sizes.icon} />
          </View>
          <Text style={[theme.text.body, styles.headerTitle]} accessibilityRole="header">
            AURA
          </Text>
          <Text style={theme.text.caption}>{simple ? `${t.caption} · ${t.simpleOn}` : t.caption}</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chat}
          contentContainerStyle={{ paddingBottom: theme.sizes.tabBarHeight * 2 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => {
            const isUser = m.role === 'user';
            const streamingEmpty = m.state === 'streaming' && !m.content;
            return (
              <View key={m.id} style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}>
                {!isUser && (
                  <View style={styles.avatar}>
                    <Icon name="sparkle" color={theme.colors.gold} size={theme.fontSize.caption} />
                  </View>
                )}
                <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi, m.state === 'error' && styles.bubbleError, m.offline && styles.bubbleOffline]}>
                  {m.offline && <Text style={[theme.text.caption, styles.offlineLabel]}>{t.offlineLabel}</Text>}
                  {streamingEmpty ? (
                    <View>
                      <TypingDots label={t.typing} />
                      {!!status && <Text style={[theme.text.caption, styles.status]}>{status}</Text>}
                    </View>
                  ) : (
                    <Text style={[theme.text.body, styles.text]} accessibilityLiveRegion={m.state === 'streaming' ? 'polite' : 'none'}>
                      {m.id === 'welcome' ? t.welcome : m.role === 'assistant' ? plain(m.content) : m.content}
                    </Text>
                  )}
                  {m.state === 'done' && m.cta && (
                    <Pressable
                      onPress={() => openCta(m.cta!)}
                      accessibilityRole="button"
                      accessibilityLabel={m.cta.label}
                      style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
                    >
                      <Text style={[theme.text.body, styles.ctaText]}>{m.cta.label} →</Text>
                    </Pressable>
                  )}
                  {(m.state === 'error' || m.offline) && m.retryQuestion && (
                    <Pressable
                      onPress={() => ask(m.retryQuestion!, { retryOf: m.id })}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={m.offline ? t.askOnline : t.tryAgain}
                      style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
                    >
                      <Text style={[theme.text.body, styles.ctaText]}>{m.offline ? t.askOnline : t.tryAgain}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}

          {showSuggestions && (
            <View style={styles.suggestions}>
              {t.suggestions.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => ask(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.askPrefix}: ${s}`}
                  style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                >
                  <Text style={[theme.text.body, styles.chipText]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputArea, { paddingBottom: insets.bottom + theme.sizes.tabBarHeight + theme.spacing.sm }]}>
          <LinearGradient colors={['rgba(10,10,10,0)', theme.colors.background]} style={StyleSheet.absoluteFill} />
          <View style={styles.inputBox}>
            <TextInput
              style={[theme.text.body, styles.input]}
              placeholder={t.placeholder}
              placeholderTextColor={theme.colors.textMuted}
              keyboardAppearance="dark"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => ask(input)}
              returnKeyType="send"
              multiline
              maxLength={1000}
              accessibilityLabel={t.messageLabel}
            />
            <Pressable
              onPress={() => ask(input)}
              disabled={busy || !input.trim()}
              accessibilityRole="button"
              accessibilityLabel={t.send}
              accessibilityState={{ disabled: busy || !input.trim() }}
              style={({ pressed }) => [styles.send, (busy || !input.trim()) && styles.sendDisabled, pressed && styles.pressed]}
            >
              <Text style={styles.sendIcon}>↑</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  pressed: { opacity: 0.8 },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.hairline,
    borderBottomColor: theme.colors.border,
    position: 'relative',
  },
  headerTopActions: {
    position: 'absolute',
    right: theme.spacing.md,
    top: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    zIndex: 10,
  },
  headerIcon: {
    width: theme.sizes.touch,
    height: theme.sizes.touch,
    borderRadius: theme.sizes.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
  },
  headerTitle: { color: theme.colors.gold, fontWeight: '700', letterSpacing: 2 },
  clearChatBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  clearChatText: {
    fontFamily: theme.fontFamily,
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 28,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  langOn: { color: theme.colors.gold },
  chat: { flex: 1, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: theme.spacing.md },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  avatar: {
    width: theme.sizes.badgeSmall,
    height: theme.sizes.badgeSmall,
    borderRadius: theme.sizes.badgeSmall / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
  },
  bubble: { maxWidth: '85%', padding: theme.spacing.md, borderRadius: theme.radius.lg + theme.spacing.xs },
  bubbleAi: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.spacing.xs, borderWidth: 1, borderColor: theme.colors.border },
  bubbleUser: { backgroundColor: theme.colors.surfaceRaised, borderTopRightRadius: theme.spacing.xs },
  bubbleError: { borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft },
  bubbleOffline: { borderColor: theme.colors.goldBorder },
  offlineLabel: { color: theme.colors.gold, marginBottom: theme.spacing.xs },
  text: { color: theme.colors.textPrimary },
  status: { marginTop: theme.spacing.sm },
  dots: { flexDirection: 'row', gap: theme.spacing.xs, paddingVertical: theme.spacing.xs },
  dot: { width: theme.sizes.dot, height: theme.sizes.dot, borderRadius: theme.sizes.dot / 2, backgroundColor: theme.colors.gold },
  cta: {
    alignSelf: 'flex-start',
    minHeight: theme.sizes.touch,
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
    backgroundColor: theme.colors.goldSoft,
  },
  ctaText: { color: theme.colors.gold, fontWeight: '700' },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, paddingLeft: theme.sizes.badgeSmall + theme.spacing.sm },
  chip: {
    minHeight: theme.sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
  },
  chipText: { color: theme.colors.gold },
  inputArea: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.lg + theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
  },
  input: { flex: 1, color: theme.colors.textPrimary, minHeight: theme.sizes.touch, maxHeight: theme.sizes.touch * 3, paddingVertical: theme.spacing.sm },
  send: {
    width: theme.sizes.touch,
    height: theme.sizes.touch,
    borderRadius: theme.sizes.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.gold,
  },
  sendDisabled: { backgroundColor: theme.colors.goldSoft },
  sendIcon: { color: theme.colors.onGold, fontSize: theme.fontSize.title, fontWeight: '800' },
});
