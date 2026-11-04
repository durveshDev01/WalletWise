import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { catalog } from '../../data/catalog';
import { checkRedemption, feeCheck } from '../../engine';
import type { Card, RedemptionBand } from '../../engine';
import { useCardStore } from '../../store/useCardStore';
import { theme } from '../../theme';
import { inr, toNumber } from './MoneyUi';

/**
 * Blocks added to the card detail screen by the money tools. Kept here so
 * card-detail.tsx only gains a few lines.
 */

/** "Is my fee worth it?" for a card in the wallet. */
export function FeeCheckBlock({ catalogId }: { catalogId: string }) {
  const holdings = useCardStore((s) => s.holdings);
  const profile = useCardStore((s) => s.profile);
  const profileSaved = useCardStore((s) => s.profileSaved);
  const walletCards = holdings.map((h) => catalog.byId.get(h.catalogId)).filter((c): c is Card => !!c);
  const check = feeCheck(catalog, walletCards, catalogId, profile);
  if (!check) return null;

  const tone = check.verdict === 'NOT_WORTH' ? styles.bad : check.verdict === 'WORTH_IT' ? styles.good : null;
  return (
    <View style={[styles.box, tone]}>
      <Text style={styles.label}>FEE CHECK</Text>
      <Text style={styles.headline}>{check.headline}</Text>
      <Row label="Rewards a year" value={inr(check.annualReward)} />
      {check.perks > 0 && <Row label="Perks a year (fuel waiver, lounges)" value={inr(check.perks)} />}
      <Row label="Annual fee incl. GST" value={check.feeWithGst === 0 ? 'None' : inr(check.feeWithGst)} />
      {check.feeWithGst > 0 && <Row label="Waived this year?" value={check.waived ? 'Yes, by your spend' : check.waiverSpend != null ? 'Not yet' : 'No waiver offered'} />}
      {check.spendToWaiver != null && check.spendToWaiver > 0 && check.feeWithGst > 0 && (
        <Row label="Spend still needed for the waiver" value={inr(check.spendToWaiver)} />
      )}
      {check.advice.map((a) => (
        <Text key={a} style={styles.advice}>
          • {a}
        </Text>
      ))}
      <Text style={styles.note}>
        {profileSaved
          ? 'Based on the spending you saved in Find My Card, split across the cards in your wallet.'
          : 'Based on typical spending. Save your own in Find My Card for a better answer.'}
      </Text>
    </View>
  );
}

/** Link to Bill check with this card's interest rate. */
export function BillCheckLink({ catalogId }: { catalogId: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/bill-check', params: { card: catalogId } })}
      style={({ pressed }) => [styles.box, styles.linkBox, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle}>Bill check</Text>
        <Text style={styles.note}>What the minimum due, an EMI or a cash withdrawal costs on this card.</Text>
      </View>
      <Text style={styles.linkArrow}>→</Text>
    </Pressable>
  );
}

const BAND_TEXT: Record<RedemptionBand, string> = { POOR: 'Poor', FAIR: 'Fair', GOOD: 'Good', UNKNOWN: '' };

/** "Is this redemption good?": points needed, cash avoided and costs → net ₹ per point and a band. */
export function RedemptionCheckBlock({ catalogId }: { catalogId: string }) {
  const card = catalog.byId.get(catalogId);
  const [points, setPoints] = useState('');
  const [value, setValue] = useState('');
  const [costs, setCosts] = useState('');
  const [quoteSource, setQuoteSource] = useState('');
  if (!card) return null;
  const costsConfirmed = costs.trim().length > 0;
  const quoteDate = new Date().toISOString().slice(0, 10);
  const result = costsConfirmed
    ? checkRedemption(catalog, card, toNumber(points), toNumber(value), toNumber(costs), { source: quoteSource, verifiedAt: quoteDate })
    : checkRedemption(catalog, card, 0, 0);
  const bandStyle = result.band === 'GOOD' ? styles.bandGood : result.band === 'POOR' ? styles.bandPoor : styles.bandFair;

  return (
    <View style={styles.box}>
      <Text style={styles.label}>IS THIS REDEMPTION GOOD?</Text>
      <Text style={styles.note}>Enter the points used, the comparable cash price avoided, and all taxes, fees and surcharges. Net value = cash price avoided − costs.</Text>
      <View style={styles.inputs}>
        <TextInput
          value={points}
          onChangeText={setPoints}
          keyboardType="number-pad"
          placeholder="Points needed"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          keyboardAppearance="dark"
          accessibilityLabel="Points needed"
        />
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          placeholder="Cash price ₹"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          keyboardAppearance="dark"
          accessibilityLabel="Comparable cash price avoided"
        />
      </View>
      <TextInput
        value={costs}
        onChangeText={setCosts}
        keyboardType="number-pad"
        placeholder="Taxes, fees + surcharges ₹"
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, { marginTop: 8 }]}
        keyboardAppearance="dark"
        accessibilityLabel="Redemption taxes fees and surcharges; enter 0 if none"
      />
      <TextInput
        value={quoteSource}
        onChangeText={setQuoteSource}
        placeholder="Quote source or URL (optional)"
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, { marginTop: 8 }]}
        keyboardAppearance="dark"
        autoCapitalize="none"
        accessibilityLabel="Source of the redemption quote"
      />
      {result.band !== 'UNKNOWN' ? (
        <>
          <View style={styles.bandRow}>
            <Text style={styles.rpp}>₹{result.rupeesPerPoint.toFixed(2)} a point</Text>
            <View style={[styles.band, bandStyle]}>
              <Text style={styles.bandText}>{BAND_TEXT[result.band]}</Text>
            </View>
          </View>
          <Row label="Cash price avoided" value={inr(result.grossCashValueRs)} />
          <Row label="Taxes, fees and surcharges" value={`− ${inr(result.costsRs)}`} />
          <Row label="Net redemption value" value={inr(result.netValueRs)} />
          <Text style={styles.advice}>{result.message}</Text>
          <Text style={styles.note}>Quote checked {result.quoteVerifiedAt ?? quoteDate} · {result.quoteSource ?? 'user-entered; no source link provided'}; not independently verified by WalletWise.</Text>
        </>
      ) : (
        costsConfirmed && !!points && !!value ? <Text style={styles.advice}>{result.message}</Text> : <Text style={styles.note}>Enter total taxes, fees and surcharges. Enter 0 only if the issuer/programme confirms there are none.</Text>
      )}
      <Text style={styles.note}>
        For this card: poor below ₹{result.poorBelow.toFixed(2)}, good from ₹{result.goodFrom.toFixed(2)} a point (from its usual ₹
        {result.safeRupeesPerPoint.toFixed(2)} and best routes ₹{result.bestRupeesPerPoint.toFixed(2)}).
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 16,
  },
  good: { borderColor: 'rgba(95,211,148,0.4)' },
  bad: { borderColor: 'rgba(255,107,90,0.45)' },
  label: { fontFamily: theme.fontFamily, color: '#9A9A9A', fontSize: 11, letterSpacing: 1.5, fontWeight: '600', marginBottom: 8 },
  headline: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 21, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  rowLabel: { fontFamily: theme.fontFamily, color: '#9A9A9A', fontSize: 14, flex: 1 },
  rowValue: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 14, fontWeight: '500', textAlign: 'right' },
  advice: { fontFamily: theme.fontFamily, color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 8 },
  note: { fontFamily: theme.fontFamily, color: theme.colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkTitle: { fontFamily: theme.fontFamily, color: theme.colors.gold, fontSize: 15, fontWeight: '700' },
  linkArrow: { color: theme.colors.gold, fontSize: 20 },
  inputs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    fontFamily: theme.fontFamily,
    color: theme.colors.textPrimary,
    fontSize: 16,
    backgroundColor: '#181818',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    minHeight: theme.sizes.touch,
  },
  bandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  rpp: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 22, fontWeight: '300' },
  band: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 100, borderWidth: 1 },
  bandGood: { borderColor: theme.colors.positive, backgroundColor: 'rgba(95,211,148,0.12)' },
  bandFair: { borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft },
  bandPoor: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft },
  bandText: { fontFamily: theme.fontFamily, color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
});
