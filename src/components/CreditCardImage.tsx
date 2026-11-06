import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { catalog } from '../data/catalog';
import { CardFace } from './CardFace';
import { CARD_IMAGES } from './cardImages';

type Props = {
  card: { id: string; catalogId?: string; cardName?: string; bankName?: string; lastFour?: string };
  style?: any;
};

const SAMPLE_NAME_IMAGES: Record<string, number> = {
  'Infinia': require('../../cards picture/infinia-credit-card.png'),
  'BPCL Octane': require('../../cards picture/bpcl-octane-sbi-card.png'),
  'Platinum Travel': require('../../cards picture/platinumCarddec.png'),
  'Regalia Gold': require('../../cards picture/facie-regalia-gold.png'),
  'Marriott Bonvoy': require('../../cards picture/Card-Facia-Marriott-Bonvoy.png'),
};

/** Full-size card artwork (1.586 aspect ratio). Any catalog card without artwork gets a generated face. */
export function CreditCardImage({ card, style }: Props) {
  const catalogId = card.catalogId;
  const imageSource = (catalogId ? CARD_IMAGES[catalogId] : undefined) ?? (card.cardName ? SAMPLE_NAME_IMAGES[card.cardName] : undefined);
  const data = catalogId ? catalog.byId.get(catalogId) : undefined;
  const issuer = data?.issuer ?? card.bankName ?? '';
  const name = data?.name ?? card.cardName ?? '';

  return (
    <View style={[styles.container, style]}>
      {imageSource ? (
        <Image
          source={imageSource}
          style={styles.image}
          contentFit="fill"
          transition={100}
          cachePolicy="memory-disk"
          priority="high"
        />
      ) : (
        <CardFace issuer={issuer} name={name} network={data?.network} tier={data?.tier} lastFour={card.lastFour} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1.586,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#121212',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
});
