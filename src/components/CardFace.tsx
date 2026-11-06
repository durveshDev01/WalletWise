import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { typography } from '../theme';

type Props = {
  issuer: string;
  name: string;
  network?: string;
  tier?: string;
  lastFour?: string;
  /** Compact layout for thumbnails. */
  small?: boolean;
};

// Issuer brand-inspired gradients so cards are easy to tell apart.
export const ISSUER_COLORS: Record<string, [string, string]> = {
  HDFC: ['#0B2A5B', '#071733'],
  SBI: ['#1A4C8C', '#0B2346'],
  AXIS: ['#7A1638', '#3D0A1C'],
  ICICI: ['#8A2B10', '#45150A'],
  AMEX: ['#2A6F97', '#123247'],
  KOTAK: ['#B0161E', '#58070C'],
  HSBC: ['#3A3A3A', '#151515'],
  IDFC: ['#8C1D2A', '#420C14'],
  INDUSIND: ['#6B2D1A', '#33150B'],
  YES: ['#0D3E7A', '#061E3B'],
  RBL: ['#1E2F6B', '#0D1533'],
  AU: ['#5B2A86', '#2A1240'],
  BOB: ['#C2501A', '#5E260C'],
  SC: ['#0E6B4F', '#063527'],
  FEDERAL: ['#1D3E8C', '#0D1D42'],
};
const DEFAULT_COLORS: [string, string] = ['#1C1C1C', '#0A0A0A'];

const TIER_ACCENT: Record<string, string> = {
  SUPER_PREMIUM: '#F5D06F',
  PREMIUM: '#E3C27A',
  MID: '#C9C9C9',
  ENTRY: '#9AA7B5',
};

const NETWORK_LABEL: Record<string, string> = {
  VISA: 'VISA',
  MASTERCARD: 'Mastercard',
  RUPAY: 'RuPay',
  AMEX: 'American Express',
};

/** Strips the bank name and "Credit Card" so the face shows the product name. */
export function shortCardName(name: string, issuer: string) {
  return name
    .replace(/credit card/gi, '')
    .replace(new RegExp(`^(${issuer}|bank)\\s*(bank)?\\s*`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function CardFace({ issuer, name, network, tier, lastFour, small }: Props) {
  const colors = ISSUER_COLORS[issuer] ?? DEFAULT_COLORS;
  const accent = TIER_ACCENT[tier ?? ''] ?? '#C9C9C9';
  const networkLabel = network ? (NETWORK_LABEL[network] ?? network) : null;

  if (small) {
    return (
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.faceSmall}>
        <Text style={[styles.issuerSmall, { color: accent }]} numberOfLines={1}>{issuer}</Text>
        <Text style={styles.nameSmall} numberOfLines={2}>{shortCardName(name, issuer) || name}</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.face}>
      {/* Diagonal gloss overlay */}
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.00)', 'rgba(255,255,255,0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gloss}
        pointerEvents="none"
      />

      {/* Top row: issuer name + NFC icon */}
      <View style={styles.topRow}>
        <Text style={[styles.issuer, { color: accent }]} numberOfLines={1}>{issuer}</Text>
        {/* NFC contactless symbol */}
        <Text style={[styles.nfc, { color: accent }]}>))))</Text>
      </View>

      {/* EMV Chip */}
      <View style={[styles.chip, { borderColor: accent }]}>
        <View style={[styles.chipLine, { backgroundColor: accent, opacity: 0.5 }]} />
        <View style={[styles.chipCenter, { borderColor: accent }]}>
          <View style={[styles.chipCenterDot, { backgroundColor: accent, opacity: 0.4 }]} />
        </View>
        <View style={[styles.chipLine, { backgroundColor: accent, opacity: 0.5 }]} />
      </View>

      {/* Card number placeholder */}
      <Text style={[styles.cardNumber, { color: accent, opacity: 0.75 }]}>
        {`•••• •••• •••• ${lastFour ?? '••••'}`}
      </Text>

      {/* Bottom: card name + network badge */}
      <View style={styles.bottomRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{shortCardName(name, issuer) || name}</Text>
        </View>
        {networkLabel && (
          <Text style={[styles.network, { color: accent }]}>{networkLabel}</Text>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  face: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  faceSmall: { borderRadius: 8, padding: 6, flex: 1, justifyContent: 'space-between' },
  gloss: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 16,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  issuer: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  issuerSmall: { fontFamily: typography.fontFamily, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  nfc: { fontSize: 18, fontWeight: '300', letterSpacing: -4, opacity: 0.9 },
  // EMV chip
  chip: {
    width: 42, height: 32, borderRadius: 5,
    borderWidth: 1.5,
    backgroundColor: 'rgba(220,185,100,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 10,
    overflow: 'hidden',
  },
  chipLine: { width: 3, height: '80%', borderRadius: 2 },
  chipCenter: {
    flex: 1, height: '75%', marginHorizontal: 3,
    borderWidth: 1, borderRadius: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  chipCenterDot: { width: 8, height: 8, borderRadius: 4 },
  cardNumber: {
    fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '600',
    letterSpacing: 2.5, marginTop: 10,
  },
  name: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  nameSmall: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 9, letterSpacing: 0 },
  network: {
    fontFamily: typography.fontFamily, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'right', maxWidth: 100,
  },
});
