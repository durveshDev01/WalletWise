import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography } from '../theme';
import { CardData } from '../store/useCardStore';

export function CardInfoPanel({ card }: { card: CardData }) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.bankName}>{card.bankName}</Text>
        <Text style={styles.cardName}>{card.cardName}</Text>
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>{card.currencyName.toUpperCase()} BALANCE</Text>
          <Text style={styles.statValue}>{card.points.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.statBlockRight}>
          <Text style={styles.statLabel}>EST. ₹ VALUE</Text>
          <Text style={[styles.statValue, { color: colors.accent.goldStart }]}>₹{card.highValue.toLocaleString('en-IN')}</Text>
        </View>
      </View>
      
      <LinearGradient
        colors={colors.border.hairline as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.divider}
      />
      
      <View style={styles.rewardBlock}>
        <Text style={styles.rewardHeadline}>{card.rewardHeadline}</Text>
      </View>
      
      <View style={styles.chipsRow}>
        <View style={styles.metadataChip}>
          <Text style={styles.chipText}>Fee: {card.annualFee}</Text>
        </View>
        <View style={styles.metadataChip}>
          <Text style={styles.chipText}>{card.currencyName}</Text>
        </View>
        <View style={styles.metadataChip}>
          <Text style={styles.chipText}>Forex: {card.forexMarkup}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 12, // 12px min gap as specified
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  header: {
    marginBottom: 16,
  },
  bankName: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardName: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBlock: {
    flex: 1,
  },
  statBlockRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  statLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.text.secondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: typography.fontFamily,
    fontSize: 24,
    fontWeight: '300',
    color: colors.text.primary,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 16,
  },
  rewardBlock: {
    marginBottom: 16,
  },
  rewardHeadline: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: colors.accent.goldStart,
    fontWeight: '500',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metadataChip: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.text.secondary,
  }
});
