import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

interface WalletWiseIntroProps {
  onFinish: () => void;
}

export function WalletWiseIntro({ onFinish }: WalletWiseIntroProps) {
  const player = useVideoPlayer(require('../../assets/intro.mp4'), (player) => {
    player.play();
  });

  useEffect(() => {
    // The splash (logo) normally hides on the video's first frame; if that frame is slow,
    // hide it anyway so the logo never sits over the playing intro.
    const splashFallback = setTimeout(() => SplashScreen.hideAsync(), 3000);
    // If the video hangs or errors, this will ensure the app still opens
    const safetyTimeout = setTimeout(() => {
      console.log('Intro safety timeout triggered (15s fallback)');
      SplashScreen.hideAsync();
      onFinish();
    }, 15000);

    return () => {
      clearTimeout(splashFallback);
      clearTimeout(safetyTimeout);
    };
  }, [onFinish]);

  useEventListener(player, 'statusChange', (payload) => {
    if (payload.status === 'error') {
      console.log('Video Player Error:', payload.error);
      SplashScreen.hideAsync();
      onFinish();
    }
  });

  useEventListener(player, 'playToEnd', () => {
    onFinish();
  });

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="cover"
        // Hide the splash only once the video is actually on screen.
        onFirstFrameRender={() => SplashScreen.hideAsync()}
      />
      <Pressable
        onPress={() => {
          player.pause();
          SplashScreen.hideAsync();
          onFinish();
        }}
        accessibilityRole="button"
        accessibilityLabel="Skip intro"
        hitSlop={12}
        style={styles.skip}
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  skip: {
    position: 'absolute',
    top: 56,
    right: 20,
    minHeight: 44,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(245,208,111,0.6)',
  },
  skipText: { color: '#F5D06F', fontSize: 15, fontWeight: '700' },
});
