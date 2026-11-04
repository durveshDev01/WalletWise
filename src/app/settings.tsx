import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as Device from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { SETTINGS_STRINGS } from '../services/auraStrings';
import type { AppLanguage } from '../services/auraStrings';
import { isLowMemory, memoryGbLabel } from '../services/liteMode';
import { useCardStore } from '../store/useCardStore';
import { theme } from '../theme';
import { getWalletBackupStatus, loadWalletSnapshot, saveWalletSnapshot, supabase } from '../services/cloudSync';

const LANGUAGES: { value: AppLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
];

/** Settings: Aura language, simple answers, Lite mode, and a link to the spending profile. */
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useCardStore((s) => s.auraLanguage ?? 'en');
  const simple = useCardStore((s) => s.auraSimple === true);
  const lite = useCardStore((s) => s.liteMode === true);
  const setAuraLanguage = useCardStore((s) => s.setAuraLanguage);
  const setAuraSimple = useCardStore((s) => s.setAuraSimple);
  const setLiteMode = useCardStore((s) => s.setLiteMode);
  const t = SETTINGS_STRINGS[language];
  const lowMemory = isLowMemory(Device.totalMemory);
  const [email, setEmail] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ exists: boolean; updatedAt: string | null; unlocked: boolean } | null>(null);
  const [backupStatusMessage, setBackupStatusMessage] = useState('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const linkingUrl = Linking.useLinkingURL();
  const { code: routeCode } = useLocalSearchParams<{ code?: string }>();
  const processedCallback = useRef<string | null>(null);

  const refreshBackupStatus = useCallback(async () => {
    if (!supabase) {
      setBackupStatus(null);
      setBackupStatusMessage('Cloud backup is not configured in this build.');
      return;
    }
    try {
      setBackupStatus(await getWalletBackupStatus());
      setBackupStatusMessage('');
    } catch {
      setBackupStatus(null);
      setBackupStatusMessage('Could not check cloud backup status. Check your connection and retry.');
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSignedInEmail(data.session?.user.email ?? null);
        if (data.session) void refreshBackupStatus();
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInEmail(session?.user.email ?? null);
      if (session) setTimeout(() => { void refreshBackupStatus(); }, 0);
      else setBackupStatus(null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [refreshBackupStatus]);

  useEffect(() => {
    if (!supabase || !linkingUrl) return;
    let parsed: URL;
    try { parsed = new URL(linkingUrl); } catch { return; }
    const query = parsed.searchParams;
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const code = query.get('code') ?? (typeof routeCode === 'string' ? routeCode : null);
    const accessToken = query.get('access_token') ?? hash.get('access_token');
    const refreshToken = query.get('refresh_token') ?? hash.get('refresh_token');
    const authError = query.get('error_description') ?? hash.get('error_description') ?? query.get('error') ?? hash.get('error');
    const callbackId = `${linkingUrl}`;
    if (processedCallback.current === callbackId) return;
    if (authError) {
      processedCallback.current = callbackId;
      setTimeout(() => setSyncMessage(authError), 0);
      return;
    }
    if (!code && !(accessToken && refreshToken)) return;
    processedCallback.current = callbackId;
    const complete = code
      ? supabase.auth.exchangeCodeForSession(code)
      : supabase.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! });
    complete.then(async ({ data, error }) => {
      if (error) throw error;
      setSignedInEmail(data.user?.email ?? data.session?.user.email ?? null);
      setSyncMessage('Signed in. Your wallet remains on this device until you create an encrypted backup.');
      await refreshBackupStatus();
      router.replace('/settings');
    }).catch((error: unknown) => {
      setSyncMessage(error instanceof Error ? error.message : 'Could not complete sign-in. Request a fresh email link.');
    });
  }, [linkingUrl, routeCode, router, refreshBackupStatus]);

  const sendSignInLink = async () => {
    if (!supabase) return setSyncMessage('Cloud backup is not configured in this build.');
    setBusy(true);
    try {
      const emailRedirectTo = Platform.OS === 'web' ? `${window.location.origin}/settings` : Linking.createURL('settings');
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo } });
      setSyncMessage(error ? error.message : 'Check your email and open the sign-in link on this device.');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Could not send a sign-in link.');
    } finally {
      setBusy(false);
    }
  };
  const snapshot = () => {
    const state = useCardStore.getState();
    return { holdings: state.holdings, profile: state.profile, isDemo: state.isDemo, profileSaved: state.profileSaved,
      goals: state.goals, auraLanguage: state.auraLanguage, auraSimple: state.auraSimple, liteMode: state.liteMode,
      introSeen: state.introSeen, billRemindersOn: state.billRemindersOn, spends: state.spends };
  };
  const backup = async () => {
    if (!backupStatus?.exists && backupPassphrase !== confirmPassphrase) {
      setSyncMessage('The backup passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      const { updatedAt } = await saveWalletSnapshot(snapshot(), backupPassphrase || undefined);
      setBackupPassphrase('');
      setConfirmPassphrase('');
      setSyncMessage(`Encrypted backup saved ${new Date(updatedAt).toLocaleString()}.`);
      await refreshBackupStatus();
    }
    catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Backup failed.'); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true);
    try {
      const result = await loadWalletSnapshot(backupPassphrase);
      if (!result || typeof result.snapshot !== 'object' || !result.snapshot) { setSyncMessage('No encrypted cloud backup found for this account.'); return; }
      const saved = result.snapshot;
      const applyRestore = () => {
        useCardStore.setState(saved as Partial<ReturnType<typeof useCardStore.getState>>);
        setSyncMessage('Cloud backup restored to this device.');
      };
      if (Platform.OS === 'web') {
        if (window.confirm('Restore cloud backup? This replaces the wallet data currently on this device.')) applyRestore();
      } else {
        Alert.alert('Restore cloud backup?', 'This replaces the wallet data currently on this device.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', style: 'destructive', onPress: applyRestore },
        ]);
      }
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Restore failed.'); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    await supabase?.auth.signOut();
    setSignedInEmail(null);
    setSyncMessage('Signed out. The local wallet remains on this device.');
  };

  const goBack = () => router.canGoBack() ? router.back() : router.replace('/');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + theme.spacing.sm, paddingBottom: insets.bottom + theme.spacing.lg, paddingHorizontal: theme.spacing.md }}
    >
      <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={t.back} style={styles.back}>
        <Text style={[theme.text.body, styles.backText]}>{t.back}</Text>
      </Pressable>
      <Text style={theme.text.title} accessibilityRole="header">
        {t.title}
      </Text>

      <Text style={[theme.text.caption, styles.section]}>{t.auraSection}</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[theme.text.body, styles.label]}>{t.language}</Text>
            <Text style={theme.text.caption}>{t.languageHint}</Text>
          </View>
        </View>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.value}
              onPress={() => setAuraLanguage(l.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: language === l.value }}
              accessibilityLabel={l.label}
              style={[styles.segmentItem, language === l.value && styles.segmentItemOn]}
            >
              <Text style={[theme.text.body, styles.segmentText, language === l.value && styles.segmentTextOn]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[theme.text.body, styles.label]}>{t.simple}</Text>
            <Text style={theme.text.caption}>{t.simpleHint}</Text>
          </View>
          <Switch
            value={simple}
            onValueChange={setAuraSimple}
            accessibilityLabel={t.simple}
            trackColor={{ false: theme.colors.borderStrong, true: theme.colors.goldBorder }}
            thumbColor={simple ? theme.colors.gold : theme.colors.textMuted}
          />
        </View>
      </View>

      <Text style={[theme.text.caption, styles.section]}>{t.phoneSection}</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[theme.text.body, styles.label]}>{t.lite}</Text>
            <Text style={theme.text.caption}>{t.liteHint}</Text>
            {lowMemory && Device.totalMemory != null && (
              <Text style={[theme.text.caption, styles.recommended]}>{t.liteRecommended(memoryGbLabel(Device.totalMemory))}</Text>
            )}
          </View>
          <Switch
            value={lite}
            onValueChange={setLiteMode}
            accessibilityLabel={t.lite}
            trackColor={{ false: theme.colors.borderStrong, true: theme.colors.goldBorder }}
            thumbColor={lite ? theme.colors.gold : theme.colors.textMuted}
          />
        </View>
      </View>

      <Text style={[theme.text.caption, styles.section]}>{t.profileSection}</Text>
      <Pressable
        onPress={() => router.push('/find-card')}
        accessibilityRole="button"
        accessibilityLabel={t.profile}
        style={({ pressed }) => [styles.group, styles.row, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text style={[theme.text.body, styles.label]}>{t.profile}</Text>
          <Text style={theme.text.caption}>{t.profileHint}</Text>
        </View>
        <Icon name="chevron-right" color={theme.colors.textMuted} size={theme.sizes.icon} />
      </Pressable>

      <Text style={[theme.text.caption, styles.section]}>{t.privacySection}</Text>
      <View style={styles.group}>
        <Text style={theme.text.body}>{t.privacy}</Text>
      </View>

      <Text style={[theme.text.caption, styles.section]}>ACCOUNT BACKUP</Text>
      <View style={styles.group}>
        <Text style={theme.text.caption}>{Platform.OS === 'web'
          ? 'Your wallet is stored locally in this browser. Cloud backups are encrypted on this device with your passphrase before upload. WalletWise and Supabase cannot decrypt them. Losing the passphrase means the cloud backup cannot be recovered.'
          : 'Your wallet is stored in encrypted local storage on this device. Cloud backups are encrypted here with your passphrase before upload. WalletWise and Supabase cannot decrypt them. Losing the passphrase means the cloud backup cannot be recovered.'}</Text>
        {signedInEmail ? <>
          <Text style={[theme.text.body, styles.label]}>Signed in</Text>
          <Text style={[theme.text.body, styles.label]}>{signedInEmail}</Text>
          <Text style={theme.text.caption}>{backupStatusMessage || (backupStatus?.exists
            ? `Encrypted cloud backup found${backupStatus.updatedAt ? ` · updated ${new Date(backupStatus.updatedAt).toLocaleString()}` : ''}${backupStatus.unlocked ? ' · unlocked on this device' : ' · enter its passphrase to restore or update'}`
            : backupStatus ? 'No cloud backup exists yet. Your current wallet is still only on this device.' : 'Checking cloud backup status…')}</Text>
          {!!backupStatusMessage && <Pressable disabled={busy} onPress={() => void refreshBackupStatus()} style={styles.action}><Text style={styles.actionText}>Check again</Text></Pressable>}
          <TextInput secureTextEntry value={backupPassphrase} onChangeText={setBackupPassphrase} placeholder={backupStatus?.exists ? 'Backup passphrase' : 'Create backup passphrase (12+ characters)'} placeholderTextColor={theme.colors.textMuted} style={styles.input} autoCapitalize="none" />
          {!backupStatus?.exists && <TextInput secureTextEntry value={confirmPassphrase} onChangeText={setConfirmPassphrase} placeholder="Confirm backup passphrase" placeholderTextColor={theme.colors.textMuted} style={styles.input} autoCapitalize="none" />}
          <Pressable disabled={busy || !backupStatus || (!backupPassphrase && !backupStatus.unlocked)} onPress={backup} style={styles.action}><Text style={styles.actionText}>{backupStatus?.exists ? 'Encrypt and update cloud backup' : 'Encrypt and back up this device'}</Text></Pressable>
          {backupStatus?.exists && <Pressable disabled={busy || !backupPassphrase} onPress={restore} style={styles.action}><Text style={styles.actionText}>Decrypt and restore cloud backup</Text></Pressable>}
          <Pressable onPress={signOut} style={styles.action}><Text style={styles.actionText}>Sign out</Text></Pressable>
        </> : <>
          <TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
          <Pressable disabled={busy || !email.trim()} onPress={sendSignInLink} style={styles.action}><Text style={styles.actionText}>Email me a sign-in link</Text></Pressable>
        </>}
        {!!syncMessage && <Text accessibilityRole="alert" style={theme.text.caption}>{syncMessage}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1, gap: theme.spacing.xs },
  back: { minHeight: theme.sizes.touch, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { color: theme.colors.gold, fontWeight: '600' },
  section: { marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  group: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.hairline,
    borderColor: theme.colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  label: { color: theme.colors.textPrimary, fontWeight: '600' },
  recommended: { color: theme.colors.gold },
  divider: { height: theme.sizes.hairline, backgroundColor: theme.colors.border },
  pressed: { backgroundColor: theme.colors.pressed },
  input: { minHeight: theme.sizes.touch, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.textPrimary, paddingHorizontal: theme.spacing.md },
  action: { minHeight: theme.sizes.touch, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.goldBorder, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.md },
  actionText: { color: theme.colors.gold, fontWeight: '700' },
  segment: { flexDirection: 'row', padding: theme.spacing.xs, borderRadius: theme.radius.md, backgroundColor: theme.colors.background },
  segmentItem: { flex: 1, minHeight: theme.sizes.touch, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm },
  segmentItemOn: { backgroundColor: theme.colors.goldSoft, borderWidth: 1, borderColor: theme.colors.goldBorder },
  segmentText: { color: theme.colors.textSecondary },
  segmentTextOn: { color: theme.colors.gold, fontWeight: '700' },
});
