/**
 * The Best Card map: Mapbox GL JS in a WebView (see mapHtml.ts). The same code runs in
 * Expo Go and in the APK, with no Google Maps key. The page is created once and only
 * updated through messages, so moving around or picking places is not a new map load.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { mapHtml } from './mapHtml';
import type { MapCamera, MapState } from './mapHtml';

export type { MapCamera, MapMarker, MapState } from './mapHtml';

export type MapboxMapHandle = { flyTo: (lat: number, lon: number, zoom: number, durationMs?: number) => void };

type Props = {
  token: string;
  /** Where the map opens. Read once, when the page is created. */
  initialCamera: MapCamera;
  state: MapState;
  /** Space covered by the search box at the top, so Mapbox's logo and attribution stay visible. */
  controlsTop: number;
  style?: StyleProp<ViewStyle>;
  onMarkerPress: (id: string) => void;
  onMoveEnd: (center: { lat: number; lon: number }) => void;
  onPress?: () => void;
};

export const MapboxMap = forwardRef<MapboxMapHandle, Props>(function MapboxMap(
  { token, initialCamera, state, controlsTop, style, onMarkerPress, onMoveEnd, onPress },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // The page is built once; later camera and data changes go through messages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => mapHtml(token, initialCamera, controlsTop), [token]);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon, zoom, durationMs = 700) => {
      webRef.current?.injectJavaScript(`window.WW && window.WW.flyTo(${lat}, ${lon}, ${zoom}, ${durationMs}); true;`);
    },
  }));

  // Send the markers, circle and location dot whenever they change (and once the map is ready).
  const payload = JSON.stringify(state);
  useEffect(() => {
    if (ready) webRef.current?.injectJavaScript(`window.WW && window.WW.state(${payload}); true;`);
  }, [ready, payload]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type: string; id?: string; lat?: number; lon?: number; message?: string };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === 'ready') {
      setReady(true);
      setFailed(null);
    } else if (m.type === 'marker' && m.id) onMarkerPress(m.id);
    else if (m.type === 'moveend' && typeof m.lat === 'number' && typeof m.lon === 'number') onMoveEnd({ lat: m.lat, lon: m.lon });
    else if (m.type === 'press') onPress?.();
    else if (m.type === 'error' && !ready) setFailed(m.message ?? 'Map error');
  };

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: 'https://walletwise.app/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        // The map handles its own gestures; the page itself must not scroll or bounce.
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={styles.web}
        containerStyle={styles.web}
        onError={() => setFailed('No connection to the map')}
        androidLayerType="hardware"
      />
      {failed && !ready && (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>The map could not load ({failed}). The list below still works.</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#0b0d10' },
  web: { flex: 1, backgroundColor: '#0b0d10' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  overlayText: { color: '#8A8A8A', fontSize: 13, textAlign: 'center' },
});
