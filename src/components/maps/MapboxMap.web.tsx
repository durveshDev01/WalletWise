/**
 * Web build of the Best Card map: the same Mapbox GL JS page as the phone, in an iframe.
 * The iframe talks to the app with window.postMessage instead of the WebView bridge.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { mapHtml } from './mapHtml';
import type { MapCamera, MapState } from './mapHtml';

export type { MapCamera, MapMarker, MapState } from './mapHtml';

export type MapboxMapHandle = { flyTo: (lat: number, lon: number, zoom: number, durationMs?: number) => void };

type Props = {
  token: string;
  initialCamera: MapCamera;
  state: MapState;
  controlsTop: number;
  style?: StyleProp<ViewStyle>;
  onMarkerPress: (id: string) => void;
  onMoveEnd: (center: { lat: number; lon: number }) => void;
  onPress?: () => void;
};

// In the iframe, the page posts to window.ReactNativeWebView; this shim forwards to the parent.
const BRIDGE = '<script>window.ReactNativeWebView={postMessage:function(d){parent.postMessage({ww:d},"*")}};</script>';

export const MapboxMap = forwardRef<MapboxMapHandle, Props>(function MapboxMap(
  { token, initialCamera, state, controlsTop, style, onMarkerPress, onMoveEnd, onPress },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => mapHtml(token, initialCamera, controlsTop).replace('<head>', `<head>${BRIDGE}`), [token]);

  type Page = Window & { WW?: { state: (s: MapState) => void; flyTo: (lat: number, lon: number, zoom: number, ms: number) => void } };
  const page = () => (frameRef.current?.contentWindow as Page | null)?.WW;

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon, zoom, durationMs = 700) => page()?.flyTo(lat, lon, zoom, durationMs),
  }));

  const payload = JSON.stringify(state);
  useEffect(() => {
    if (ready) page()?.state(JSON.parse(payload));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, payload]);

  // Callbacks change on every render; the listener is added once and reads the latest ones,
  // so no message from the map is lost between renders.
  const handlers = useRef({ onMarkerPress, onMoveEnd, onPress });
  useEffect(() => {
    handlers.current = { onMarkerPress, onMoveEnd, onPress };
  });
  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || typeof e.data?.ww !== 'string') return;
      const m = JSON.parse(e.data.ww) as { type: string; id?: string; lat?: number; lon?: number };
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'marker' && m.id) handlers.current.onMarkerPress(m.id);
      else if (m.type === 'moveend' && typeof m.lat === 'number' && typeof m.lon === 'number') handlers.current.onMoveEnd({ lat: m.lat, lon: m.lon });
      else if (m.type === 'press') handlers.current.onPress?.();
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <View style={[styles.wrap, style]}>
      {React.createElement('iframe', { ref: frameRef, srcDoc: html, title: 'Map', style: { border: 0, width: '100%', height: '100%' } })}
    </View>
  );
});

const styles = StyleSheet.create({ wrap: { backgroundColor: '#0b0d10' } });
