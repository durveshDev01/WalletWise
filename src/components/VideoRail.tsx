import React from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { thumbnailUrl, VIDEOS, videoUrl } from '../data/videos';
import type { Video } from '../data/videos';
import { colors, typography } from '../theme';

const LEVEL_COLORS: Record<Video['level'], string> = { Beginner: '#54C78A', Rewards: '#F5D06F', Travel: '#6FB1FF' };

/** Swipeable rail of expert videos; tapping opens YouTube in the in-app browser. */
export function VideoRail({ level, horizontalPadding = 20 }: { level?: Video['level']; horizontalPadding?: number }) {
  const videos = level ? VIDEOS.filter((v) => v.level === level) : VIDEOS;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={252}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: horizontalPadding, gap: 12 }}
    >
      {videos.map((v) => (
        <Pressable key={v.id} style={styles.card} onPress={() => WebBrowser.openBrowserAsync(videoUrl(v.id))}>
          <View style={styles.thumbWrap}>
            <Image
              source={{ uri: thumbnailUrl(v.id) }}
              style={styles.thumb}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={200}
            />
            <View style={styles.play}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
            <View style={styles.length}>
              <Text style={styles.lengthText}>{v.length}</Text>
            </View>
          </View>
          <Text style={[styles.level, { color: LEVEL_COLORS[v.level] }]}>{v.level.toUpperCase()}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {v.title}
          </Text>
          <Text style={styles.channel} numberOfLines={1}>
            {v.channel}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { width: 240 },
  thumbWrap: { width: 240, height: 135, borderRadius: 14, overflow: 'hidden', backgroundColor: '#161616' },
  thumb: { width: '100%', height: '100%' },
  play: {
    position: 'absolute', top: '50%', left: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22,
    borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(245,208,111,0.6)',
  },
  playIcon: { color: colors.accent.goldStart, fontSize: 16, marginLeft: 3 },
  length: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lengthText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  level: { fontFamily: typography.fontFamily, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 10 },
  title: { fontFamily: typography.fontFamily, color: '#F5F5F5', fontSize: 14, fontWeight: '600', marginTop: 4, lineHeight: 19 },
  channel: { fontFamily: typography.fontFamily, color: '#8A8A8A', fontSize: 12, marginTop: 4 },
});
