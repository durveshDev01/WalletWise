import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Linking, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { FlatList, Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

import { CardArt } from '../../components/CardArt';
import { Icon } from '../../components/Icon';
import { MapboxMap } from '../../components/maps/MapboxMap';
import type { MapboxMapHandle, MapMarker, MapState } from '../../components/maps/MapboxMap';
import { PlacePanel } from '../../components/PlacePanel';
import type { RankMode } from '../../components/PlacePanel';
import { enrichPlace, RADIUS_OPTIONS, useBestCardLogic } from '../../hooks/useBestCardLogic';
import type { EnrichedPlace } from '../../hooks/useBestCardLogic';
import { HAS_MAPBOX_TOKEN, MAPBOX_TOKEN, SPEND_FILTERS } from '../../services/mapbox';
import type { MapPlace, SpendFilter } from '../../services/mapbox';
import { useCardStore } from '../../store/useCardStore';
import { theme } from '../../theme';
import { haversineDistance } from '../../utils/geospatial';
import type { MerchantCategory } from '../../utils/merchantClassifier';
import type { RecommendationResult } from '../../utils/recommendationEngine';

/**
 * The map is Mapbox's own (Mapbox GL JS in a WebView, see components/maps), so it needs only
 * the Mapbox token: no Google Maps key, and it works the same in Expo Go and in the APK.
 */
const MAP_AVAILABLE = HAS_MAPBOX_TOKEN;

/** Whole of India, used until the phone's location is known. */
const INDIA_CAMERA = { lat: 20.59, lon: 78.96, zoom: 3.8 };
/** Zoom that shows about a 5 km radius, and a single place. */
const AREA_ZOOM = 12.3;
const PLACE_ZOOM = 14.8;
/** Distance the map must be dragged before "Search this area" appears, in km. */
const SEARCH_AREA_THRESHOLD_KM = 1;
const CAMERA_MS = 700;

const CATEGORY_ICON: Record<string, string> = {
  Dining: '🍴',
  Grocery: '🛒',
  Fuel: '⛽',
  Electronics: '📱',
  Shopping: '🛍️',
  Travel: '🏨',
  'Pharmacy / Health': '💊',
  Entertainment: '🎬',
  Business: '🏢',
  Unknown: '📍',
};
const FILTER_LABEL = (f: SpendFilter) => (f === 'Pharmacy / Health' ? 'Pharmacy' : f);
const inr = (n: number) => `₹${n >= 100 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(2).replace(/\.00$/, '')}`;
const distanceText = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

/** Best card for a place under the chosen mode. Transfer upsides remain estimates. */
function bestFor(place: EnrichedPlace, mode: RankMode): RecommendationResult | null {
  const rows = mode === 'Cashback' ? place.ranked.filter((row) => row.rewardUnit === 'CASHBACK') : place.ranked;
  if (rows.length === 0) return null;
  if (mode === 'Cashback') return rows[0];
  return [...rows].sort((a, b) => b.bestValue - a.bestValue || b.estimatedValue - a.estimatedValue)[0];
}

// ── Place row in the sheet ─────────────────────────────
const PlaceRow = React.memo(function PlaceRow({
  place,
  mode,
  selected,
  onOpen,
}: {
  place: EnrichedPlace;
  mode: RankMode;
  selected: boolean;
  onOpen: (p: EnrichedPlace) => void;
}) {
  const best = bestFor(place, mode);
  const earns = !!best && best.estimatedValue > 0;
  const amount = mode === 'Max Value' && best ? best.bestValue : best?.estimatedValue ?? 0;
  const units = best && best.rewardUnit !== 'CASHBACK' ? `${best.pointsEarned.toLocaleString('en-IN')} ${best.rewardUnit === 'MILES' ? 'miles' : 'pts'}` : 'cashback';
  return (
    <Pressable
      onPress={() => onOpen(place)}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${place.category}, ${distanceText(place.distanceKm)} away. ${
        best ? `Best card ${best.card.bankName} ${best.card.cardName}, ${inr(amount)} back on ₹2,000` : 'No card in wallet'
      }`}
      style={({ pressed }) => [styles.placeCard, selected && styles.placeCardSelected, pressed && styles.pressed]}
    >
      <View style={styles.placeHeader}>
        <View style={styles.placeIcon}>
          <Text style={styles.placeIconText}>{CATEGORY_ICON[place.category] ?? '📍'}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[theme.text.body, styles.placeName]} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={theme.text.caption} numberOfLines={1}>
            {place.category === 'Unknown' ? 'Shop' : FILTER_LABEL(place.category as SpendFilter)} · {distanceText(place.distanceKm)}
          </Text>
        </View>
        <Icon name="chevron-right" color={theme.colors.textMuted} size={theme.sizes.icon} />
      </View>
      {best ? (
        <View style={styles.bestRow}>
          <View style={styles.bestArt}>
            <CardArt card={best.card} />
          </View>
          <View style={styles.flex}>
            <Text style={[theme.text.caption, earns ? styles.bestLabel : undefined]}>{earns ? 'BEST CARD HERE' : 'NO REWARD LISTED'}</Text>
            <Text style={[theme.text.body, styles.bestName]} numberOfLines={1}>
              {best.card.bankName} {best.card.cardName}
            </Text>
          </View>
          <View style={styles.bestValue}>
            <Text style={[theme.text.body, styles.bestAmount]}>{inr(amount)}</Text>
            <Text style={theme.text.caption}>{earns ? units : 'on ₹2,000'}</Text>
          </View>
        </View>
      ) : (
        <Text style={[theme.text.caption, styles.noCard]}>Add a card to see which one to use here</Text>
      )}
    </Pressable>
  );
});

// ── Screen ─────────────────────────────────────────────
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const mapRef = useRef<MapboxMapHandle>(null);
  const cards = useCardStore((s) => s.cards);
  const liteMode = useCardStore((s) => s.liteMode === true);

  const {
    permission,
    retryLocation,
    userLocation,
    customCenter,
    setCustomCenter,
    backToMyLocation,
    activeLocation,
    areaLabel,
    activeCategory,
    setActiveCategory,
    radiusKm,
    setRadiusKm,
    places,
    placesState,
    placesError,
    refreshPlaces,
    searchQuery,
    setSearchQuery,
    searchResults,
    searchState,
    searchError,
    isSearching,
    setIsSearching,
    clearSearch,
    submitSearch,
    selectedPlaceId,
    setSelectedPlaceId,
    hasMapboxKey,
  } = useBestCardLogic();

  const [rankMode, setRankMode] = useState<RankMode>('Max Value');
  const [openPlace, setOpenPlace] = useState<EnrichedPlace | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [readyToCheckKey, setReadyToCheckKey] = useState(false);

  useEffect(() => {
    // Avoid flashing "Map key missing" warning during initial mount before token/location settles
    const timer = setTimeout(() => setReadyToCheckKey(true), 600);
    return () => clearTimeout(timer);
  }, []);

  // Lite mode opens a list of places; the map is one tap away (Map button in the sheet).
  const [showMap, setShowMap] = useState(MAP_AVAILABLE && !liteMode);

  // ── Bottom sheet ───────────────────────────────────
  const snaps = useMemo(
    () => ({ expanded: screenHeight * 0.85, mid: screenHeight * 0.5, collapsed: screenHeight * 0.2 }),
    [screenHeight],
  );
  /** Sheet height in list view: everything below the search box and the location button. */
  const listHeight = screenHeight - (insets.top + theme.sizes.touch * 2 + theme.spacing.lg * 2);
  const restHeight = showMap ? snaps.mid : listHeight;
  const sheetHeight = useSharedValue(restHeight);
  const dragStart = useSharedValue(0);
  const snapTo = useCallback(
    (h: number) => {
      sheetHeight.set(withSpring(h, { damping: 18, stiffness: 150, overshootClamping: true }));
    },
    [sheetHeight],
  );
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      dragStart.set(sheetHeight.get());
    })
    .onUpdate((e) => {
      sheetHeight.set(Math.max(snaps.collapsed / 2, Math.min(snaps.expanded, dragStart.get() - e.translationY)));
    })
    .onEnd((e) => {
      const projected = sheetHeight.get() - e.velocityY * 0.1;
      const dest =
        projected > (snaps.expanded + snaps.mid) / 2 ? snaps.expanded : projected > (snaps.mid + snaps.collapsed) / 2 ? snaps.mid : snaps.collapsed;
      sheetHeight.set(withSpring(dest, { velocity: -e.velocityY, damping: 18, stiffness: 150, overshootClamping: true }));
    });
  const sheetStyle = useAnimatedStyle(() => ({ height: sheetHeight.get() }));

  // ── Camera ─────────────────────────────────────────
  const flyTo = useCallback((lat: number, lon: number, zoom: number) => {
    mapRef.current?.flyTo(lat, lon, zoom, CAMERA_MS);
  }, []);

  // Centre the map once the first location (or a new search area) is known.
  const centerKey = activeLocation ? `${activeLocation.lat.toFixed(3)},${activeLocation.lon.toFixed(3)}` : null;
  useEffect(() => {
    if (activeLocation) flyTo(activeLocation.lat, activeLocation.lon, AREA_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey]);

  const openPlacePanel = useCallback(
    (place: EnrichedPlace) => {
      Keyboard.dismiss();
      setOpenPlace(place);
      setSelectedPlaceId(place.id);
      snapTo(showMap ? snaps.expanded : listHeight);
      flyTo(place.center[1], place.center[0], PLACE_ZOOM);
    },
    [setSelectedPlaceId, snapTo, snaps.expanded, flyTo, showMap, listHeight],
  );

  const closePlacePanel = useCallback(() => {
    setOpenPlace(null);
    setSelectedPlaceId(null);
    snapTo(restHeight);
  }, [setSelectedPlaceId, snapTo, restHeight]);

  const toggleMap = useCallback(() => {
    const next = !showMap;
    setShowMap(next);
    snapTo(next ? snaps.mid : listHeight);
  }, [showMap, snapTo, snaps.mid, listHeight]);

  // A shop opens its card ranking; an area ("Karve Nagar") becomes the new search centre.
  const onSearchResult = useCallback(
    (p: MapPlace) => {
      clearSearch();
      Keyboard.dismiss();
      if (p.isPoi) {
        const fallback: MerchantCategory = activeCategory === 'All' ? 'Unknown' : activeCategory;
        openPlacePanel(enrichPlace(p, fallback, userLocation ?? activeLocation, cards));
      } else {
        setOpenPlace(null);
        setCustomCenter({ lat: p.lat, lon: p.lon });
      }
    },
    [clearSearch, activeCategory, openPlacePanel, userLocation, activeLocation, cards, setCustomCenter],
  );

  const onMoveEnd = useCallback((c: { lat: number; lon: number }) => setMapCenter(c), []);
  const onMarkerPress = useCallback(
    (id: string) => {
      const place = places.find((p) => p.id === id);
      if (place) openPlacePanel(place);
    },
    [places, openPlacePanel],
  );
  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  // What the map draws: the search radius, your location, and the places (selected one larger).
  const mapState: MapState = useMemo(() => {
    const markers: MapMarker[] = places.map((p) => ({
      id: p.id,
      lat: p.center[1],
      lon: p.center[0],
      emoji: CATEGORY_ICON[p.category] ?? '📍',
      selected: p.id === selectedPlaceId,
      label: p.name,
    }));
    if (openPlace && !places.some((p) => p.id === openPlace.id)) {
      markers.push({ id: openPlace.id, lat: openPlace.center[1], lon: openPlace.center[0], emoji: CATEGORY_ICON[openPlace.category] ?? '📍', selected: true, label: openPlace.name });
    }
    return {
      markers,
      user: userLocation,
      circle: activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon, radiusKm } : null,
    };
  }, [places, selectedPlaceId, openPlace, userLocation, activeLocation, radiusKm]);
  const movedAway =
    !!mapCenter && !!activeLocation && haversineDistance(mapCenter.lat, mapCenter.lon, activeLocation.lat, activeLocation.lon) > SEARCH_AREA_THRESHOLD_KM;

  const searchThisArea = useCallback(() => {
    if (mapCenter) setCustomCenter(mapCenter);
  }, [mapCenter, setCustomCenter]);

  const goToMyLocation = useCallback(() => {
    if (permission !== 'granted') {
      retryLocation();
      return;
    }
    backToMyLocation();
    if (userLocation) flyTo(userLocation.lat, userLocation.lon, AREA_ZOOM);
  }, [permission, retryLocation, backToMyLocation, userLocation, flyTo]);

  const renderPlace = useCallback(
    ({ item }: { item: EnrichedPlace }) => <PlaceRow place={item} mode={rankMode} selected={item.id === selectedPlaceId} onOpen={openPlacePanel} />,
    [rankMode, selectedPlaceId, openPlacePanel],
  );

  // ── Status shown above the list ────────────────────
  let status: { title: string; body: string; action?: { label: string; onPress: () => void } } | null = null;
  if (!hasMapboxKey && readyToCheckKey) {
    status = {
      title: 'Map key missing',
      body: 'Add EXPO_PUBLIC_MAPBOX_TOKEN to the .env file in the project folder, then restart with "npx expo start -c".',
    };
  } else if (!activeLocation && (permission === 'denied' || permission === 'services-off')) {
    status = {
      title: permission === 'services-off' ? 'Location is turned off' : 'Location permission needed',
      body: 'Allow location to see places within 5 km, or search for an area above.',
      action: { label: permission === 'denied' ? 'Open settings' : 'Try again', onPress: permission === 'denied' ? () => Linking.openSettings() : retryLocation },
    };
  } else if (!activeLocation) {
    status = { title: 'Finding your location…', body: 'You can also search for an area or a shop above.' };
  } else if (placesState === 'error') {
    status = { title: 'Could not load places', body: placesError ?? '', action: { label: 'Retry', onPress: refreshPlaces } };
  }

  const listHeader = (
    <View>
      {status && (
        <View style={styles.statusBox}>
          <Text style={[theme.text.body, styles.statusTitle]}>{status.title}</Text>
          <Text style={theme.text.body}>{status.body}</Text>
          {status.action && (
            <Pressable
              onPress={status.action.onPress}
              accessibilityRole="button"
              accessibilityLabel={status.action.label}
              style={({ pressed }) => [styles.statusButton, pressed && styles.pressed]}
            >
              <Text style={[theme.text.body, styles.statusButtonText]}>{status.action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {activeLocation && placesState !== 'error' && (
        <View style={styles.listHeader}>
          <Text style={[theme.text.body, styles.listTitle]}>
            {placesState === 'loading' ? 'Finding places…' : `${places.length} ${places.length === 1 ? 'place' : 'places'} within ${radiusKm} km`}
          </Text>
          {placesState === 'loading' && <ActivityIndicator color={theme.colors.gold} />}
          {placesState === 'ready' && <Text style={theme.text.caption}>Values on ₹2,000 · tap for any amount</Text>}
        </View>
      )}
    </View>
  );

  const emptyList =
    activeLocation && placesState === 'ready' ? (
      <View style={styles.statusBox}>
        <Text style={[theme.text.body, styles.statusTitle]}>No {activeCategory === 'All' ? '' : `${FILTER_LABEL(activeCategory).toLowerCase()} `}places found</Text>
        <Text style={theme.text.body}>Try a bigger radius, another category, or search for a shop by name.</Text>
      </View>
    ) : null;

  return (
    <View style={styles.container}>
      {/* MAP */}
      {showMap && (
        <MapboxMap
          ref={mapRef}
          token={MAPBOX_TOKEN}
          style={StyleSheet.absoluteFill}
          // Opened from the list view, the map starts on the current area.
          initialCamera={activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon, zoom: AREA_ZOOM } : INDIA_CAMERA}
          state={mapState}
          controlsTop={insets.top + theme.sizes.touch + theme.spacing.lg}
          onMoveEnd={onMoveEnd}
          onMarkerPress={onMarkerPress}
          onPress={dismissKeyboard}
        />
      )}

      {/* SEARCH */}
      <View style={[styles.searchWrap, !showMap && styles.searchOnTop, { top: insets.top + theme.spacing.sm }]}>
        <View style={styles.searchBox}>
          <Icon name="pin" color={theme.colors.gold} size={theme.sizes.icon} />
          <TextInput
            style={[theme.text.body, styles.searchInput]}
            placeholder="Search a shop or area, e.g. DMart Karve Nagar"
            placeholderTextColor={theme.colors.textMuted}
            keyboardAppearance="dark"
            returnKeyType="search"
            onSubmitEditing={submitSearch}
            value={searchQuery}
            onChangeText={(t) => {
              setSearchQuery(t);
              setIsSearching(true);
            }}
            onFocus={() => setIsSearching(true)}
            accessibilityLabel="Search for a shop or area"
          />
          {searchState === 'loading' && <ActivityIndicator color={theme.colors.gold} />}
          {searchQuery.length > 0 && (
            <Pressable
              onPress={clearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={theme.spacing.sm}
              style={styles.clearButton}
            >
              <Text style={[theme.text.body, styles.clearText]}>✕</Text>
            </Pressable>
          )}
        </View>

        {isSearching && searchQuery.trim().length >= 2 && searchState !== 'idle' && (
          <View style={styles.dropdown}>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.dropdownScroll}>
              {searchState === 'error' && <Text style={[theme.text.body, styles.dropdownMessage]}>{searchError}</Text>}
              {searchState === 'ready' && searchResults.length === 0 && (
                <Text style={[theme.text.body, styles.dropdownMessage]}>No matches. Try the shop name and area.</Text>
              )}
              {searchResults.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => onSearchResult(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.name}, ${r.address}`}
                  style={({ pressed }) => [styles.dropdownRow, pressed && styles.pressed]}
                >
                  <View style={styles.dropdownIcon}>
                    <Text>{r.isPoi ? '🏪' : '📍'}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[theme.text.body, styles.dropdownTitle]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={theme.text.caption} numberOfLines={1}>
                      {r.isPoi ? '' : 'Area · '}
                      {r.address}
                    </Text>
                  </View>
                  {activeLocation && (
                    <Text style={theme.text.caption}>{distanceText(haversineDistance(activeLocation.lat, activeLocation.lon, r.lat, r.lon))}</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {!isSearching && movedAway && (
          <Pressable
            onPress={searchThisArea}
            accessibilityRole="button"
            accessibilityLabel="Search this area"
            style={({ pressed }) => [styles.searchAreaButton, pressed && styles.pressed]}
          >
            <Text style={[theme.text.body, styles.searchAreaText]}>Search this area</Text>
          </Pressable>
        )}
      </View>

      {/* SETTINGS */}
      <Pressable
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        style={({ pressed }) => [styles.locateButton, { top: insets.top + theme.spacing.sm }, pressed && styles.pressed]}
      >
        <Icon name="settings" color={theme.colors.gold} size={theme.sizes.icon} />
      </Pressable>

      {/* MY LOCATION */}
      <Pressable
        onPress={goToMyLocation}
        accessibilityRole="button"
        accessibilityLabel="Show places near my location"
        style={({ pressed }) => [styles.locateButton, { top: insets.top + theme.sizes.touch + theme.spacing.lg }, pressed && styles.pressed]}
      >
        <Icon name="pin" color={customCenter ? theme.colors.textPrimary : theme.colors.gold} size={theme.sizes.iconLarge} />
      </Pressable>

      {/* SHEET */}
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleArea} accessibilityLabel="Drag to resize the list" accessibilityRole="adjustable">
            <View style={styles.handle} />
          </View>
        </GestureDetector>

        {openPlace ? (
          <PlacePanel place={openPlace} cards={cards} mode={rankMode} onClose={closePlacePanel} />
        ) : (
          <>
            <View style={styles.sheetHeader}>
              <View style={styles.titleRow}>
                <View style={styles.flex}>
                  <Text style={theme.text.title}>Best Card</Text>
                  <View style={styles.areaRow}>
                    <View style={[styles.areaDot, customCenter && styles.areaDotCustom]} />
                    <Text style={theme.text.caption} numberOfLines={1}>
                      {customCenter ? `Around ${areaLabel ?? 'the chosen area'}` : areaLabel ? `Near you · ${areaLabel}` : 'Near you'}
                    </Text>
                  </View>
                </View>
                {MAP_AVAILABLE && (
                  <Pressable
                    onPress={toggleMap}
                    accessibilityRole="button"
                    accessibilityLabel={showMap ? 'Show places as a list' : 'Show places on the map'}
                    style={({ pressed }) => [styles.tripButton, pressed && styles.pressed]}
                  >
                    <Icon name="pin" color={theme.colors.gold} size={theme.sizes.icon} />
                    <Text style={[theme.text.caption, styles.tripText]}>{showMap ? 'List' : 'Map'}</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => router.push('/trip-planner')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Trip Planner"
                  style={({ pressed }) => [styles.tripButton, pressed && styles.pressed]}
                >
                  <Icon name="plane" color={theme.colors.gold} size={theme.sizes.icon} />
                  <Text style={[theme.text.caption, styles.tripText]}>Trip Planner</Text>
                </Pressable>
              </View>

              <View style={styles.segment} accessibilityRole="radiogroup">
                {(['Max Value', 'Cashback'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setRankMode(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: rankMode === m }}
                    accessibilityLabel={m === 'Max Value' ? 'Rank by maximum estimated value including transfers' : 'Show cashback cards only'}
                    style={[styles.segmentItem, rankMode === m && styles.segmentItemOn]}
                  >
                    <Text style={[theme.text.body, styles.segmentText, rankMode === m && styles.segmentTextOn]}>{m}</Text>
                  </Pressable>
                ))}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {SPEND_FILTERS.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setActiveCategory(f)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: activeCategory === f }}
                    accessibilityLabel={`Show ${FILTER_LABEL(f)} places`}
                    style={[styles.chip, activeCategory === f && styles.chipOn]}
                  >
                    <Text style={[theme.text.body, styles.chipText, activeCategory === f && styles.chipTextOn]}>
                      {f === 'All' ? 'All' : `${CATEGORY_ICON[f]} ${FILTER_LABEL(f)}`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.radiusRow}>
                <Text style={theme.text.caption}>RADIUS</Text>
                {RADIUS_OPTIONS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRadiusKm(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: radiusKm === r }}
                    accessibilityLabel={`Within ${r} kilometres`}
                    style={[styles.radiusChip, radiusKm === r && styles.radiusChipOn]}
                  >
                    <Text style={[theme.text.body, styles.radiusText, radiusKm === r && styles.radiusTextOn]}>{r} km</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <FlatList
              data={activeLocation && placesState !== 'error' ? places : []}
              keyExtractor={(p) => p.id}
              renderItem={renderPlace}
              extraData={`${rankMode}|${selectedPlaceId}`}
              ListHeaderComponent={listHeader}
              ListEmptyComponent={emptyList}
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + theme.sizes.tabBarHeight + theme.spacing.lg }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={8}
            />
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },

  // Map markers
  userDot: {
    width: theme.spacing.md,
    height: theme.spacing.md,
    borderRadius: theme.spacing.sm,
    backgroundColor: theme.colors.gold,
    borderWidth: 3,
    borderColor: theme.colors.background,
  },
  marker: {
    width: theme.sizes.badgeSmall + theme.spacing.xs,
    height: theme.sizes.badgeSmall + theme.spacing.xs,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
  },
  markerSelected: { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold, transform: [{ scale: 1.2 }] },
  markerText: { fontSize: theme.fontSize.body },

  // Search
  searchWrap: { position: 'absolute', left: theme.spacing.md, right: theme.spacing.md + theme.sizes.touch + theme.spacing.sm, gap: theme.spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.sizes.touch + theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, paddingVertical: theme.spacing.sm },
  clearButton: { minWidth: theme.sizes.touch / 2, alignItems: 'center' },
  clearText: { color: theme.colors.textMuted },
  dropdown: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 360 },
  dropdownMessage: { padding: theme.spacing.md },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.sizes.touch + theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.hairline,
    borderBottomColor: theme.colors.border,
  },
  dropdownIcon: {
    width: theme.sizes.badgeSmall + theme.spacing.xs,
    height: theme.sizes.badgeSmall + theme.spacing.xs,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.goldSoft,
  },
  dropdownTitle: { color: theme.colors.textPrimary, fontWeight: '600' },
  searchAreaButton: {
    alignSelf: 'center',
    minHeight: theme.sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.gold,
  },
  searchAreaText: { color: theme.colors.onGold, fontWeight: '700' },
  locateButton: {
    position: 'absolute',
    right: theme.spacing.md,
    width: theme.sizes.touch + theme.spacing.xs,
    height: theme.sizes.touch + theme.spacing.xs,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },

  // Sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg + theme.spacing.sm,
    borderTopRightRadius: theme.radius.lg + theme.spacing.sm,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', justifyContent: 'center', minHeight: theme.sizes.touch / 2 + theme.spacing.sm },
  handle: { width: theme.sizes.badge, height: theme.spacing.xs, borderRadius: theme.spacing.xs, backgroundColor: theme.colors.borderStrong },
  // In list view the sheet is tall, so search results must draw above it.
  searchOnTop: { zIndex: 10, elevation: 10 },
  sheetHeader: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  areaDot: { width: theme.sizes.dot, height: theme.sizes.dot, borderRadius: theme.sizes.dot / 2, backgroundColor: theme.colors.positive },
  areaDotCustom: { backgroundColor: theme.colors.gold },
  tripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: theme.sizes.touch,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
  },
  tripText: { color: theme.colors.gold },
  segment: {
    flexDirection: 'row',
    padding: theme.spacing.xs,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.hairline,
    borderColor: theme.colors.border,
  },
  segmentItem: { flex: 1, minHeight: theme.sizes.touch - theme.spacing.xs, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm },
  segmentItemOn: { backgroundColor: theme.colors.surfaceRaised },
  segmentText: { color: theme.colors.textMuted, fontWeight: '600' },
  segmentTextOn: { color: theme.colors.gold },
  chipRow: { gap: theme.spacing.sm },
  chip: {
    minHeight: theme.sizes.touch - theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  chipOn: { borderColor: theme.colors.gold, backgroundColor: theme.colors.goldSoft },
  chipText: { color: theme.colors.textSecondary },
  chipTextOn: { color: theme.colors.gold, fontWeight: '700' },
  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  radiusChip: {
    minHeight: theme.sizes.touch - theme.spacing.sm,
    minWidth: theme.sizes.touch + theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceRaised,
  },
  radiusChipOn: { backgroundColor: theme.colors.gold },
  radiusText: { color: theme.colors.textPrimary, fontWeight: '600' },
  radiusTextOn: { color: theme.colors.onGold },

  // List
  listContent: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm, flexWrap: 'wrap' },
  listTitle: { color: theme.colors.textPrimary, fontWeight: '700' },
  statusBox: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSoft,
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  statusTitle: { color: theme.colors.textPrimary, fontWeight: '700' },
  statusButton: {
    alignSelf: 'flex-start',
    minHeight: theme.sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.gold,
  },
  statusButtonText: { color: theme.colors.onGold, fontWeight: '700' },
  placeCard: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  placeCardSelected: { borderColor: theme.colors.gold },
  placeHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  placeIcon: {
    width: theme.sizes.badge,
    height: theme.sizes.badge,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.goldSoft,
  },
  placeIconText: { fontSize: theme.fontSize.title },
  placeName: { color: theme.colors.textPrimary, fontWeight: '700' },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
  },
  bestArt: { width: theme.sizes.badge + theme.spacing.lg, height: theme.sizes.badge, borderRadius: theme.radius.sm, overflow: 'hidden' },
  bestLabel: { color: theme.colors.gold },
  bestName: { color: theme.colors.textPrimary, fontWeight: '600' },
  bestValue: { alignItems: 'flex-end' },
  bestAmount: { color: theme.colors.positive, fontWeight: '700' },
  noCard: { color: theme.colors.gold },
});
