/**
 * Where the money goes, geographically.
 *
 * Transactions carrying a location, clustered by proximity, shown as a heatmap over
 * real streets and ranked by spend below it.
 *
 * Rendered with MapLibre on OpenFreeMap tiles: no API key, no billing, no request
 * cap, and nothing to configure outside this repository — which is why it was chosen
 * over Google Maps, whose SDK would have made the feature wait on a Cloud console
 * setup step.
 *
 * Only money-out captured live carries a position (see tools/smsIngest
 * locationForParsed), so this list is always a subset of spending, and the empty
 * state says so rather than implying the data is missing.
 */
import {useQuery} from '@powersync/react-native';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {format} from 'date-fns';

// Aliased: MapLibre exports its map component as `Map`, which would shadow the
// JavaScript Map constructor used for clustering below.
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
} from '@maplibre/maplibre-react-native';

import {CatChip, Icon, Progress} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, FONTS, R, T, fmtAmount, resolveCat} from '../theme';

// OpenFreeMap: full street detail, no API key, no billing, no request cap. Chosen
// over Google Maps precisely because it needs nothing set up outside this repo.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Kigali, used only when there is nothing to fit the camera to.
const FALLBACK_CENTER: [number, number] = [30.0619, -1.9441];

// Layer paint hoisted to module scope. These were inline object literals, which are
// a new object on every render — and every new object is a prop change pushed across
// the bridge to a native layer, forcing MapLibre to re-evaluate the style. They never
// depend on state, so they should be created once for the life of the module.
const HEAT_PAINT = {
  'heatmap-weight': ['get', 'weight'],
  'heatmap-intensity': 1,
  'heatmap-radius': 42,
  'heatmap-opacity': 0.75,
  'heatmap-color': [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(34,197,94,0)',
    0.3,
    'rgba(34,197,94,0.45)',
    0.6,
    'rgba(251,191,36,0.7)',
    1,
    'rgba(220,38,38,0.85)',
  ],
} as const;

const DOT_PAINT = {
  // Scaled by spend share, floored so the smallest place is still a visible target
  // rather than a speck. Bumped from 11 to 14 at the top so the amount label sitting
  // beside it has something to anchor to.
  'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 0, 6, 1, 14],
  'circle-color': '#22C55E',
  'circle-opacity': 0.9,
  'circle-stroke-width': 2,
  'circle-stroke-color': '#0A0D10',
} as const;

// The amount, on the map itself. A heat blob says "money went here" but not how much,
// and comparing two blobs by colour alone is guesswork — the number is the whole point
// of the screen.
const LABEL_LAYOUT = {
  'text-field': ['get', 'label'],
  // MUST be a font the style's glyph server actually hosts. Omitting it is not neutral:
  // MapLibre falls back to "Open Sans Regular,Arial Unicode MS Regular", which
  // OpenFreeMap does not serve, so every glyph request 404s. That failure is not
  // confined to the labels — all three layers here share the `places` source, and a
  // symbol layout failure errors that source's tile, so the circles and the heatmap
  // disappeared along with the text. Liberty ships Noto Sans.
  'text-font': ['Noto Sans Regular'],
  'text-size': 11,
  'text-offset': [0, 1.6],
  'text-anchor': 'top',
  'text-allow-overlap': false,
  // Where labels would collide, keep the bigger spend visible rather than whichever
  // MapLibre happened to draw first.
  'symbol-sort-key': ['-', 0, ['get', 'total']],
} as const;

const LABEL_PAINT = {
  'text-color': '#F2F4F5',
  'text-halo-color': '#0A0D10',
  'text-halo-width': 1.6,
} as const;

// ~4 decimal places is roughly 11 m at this latitude, which is tighter than the
// accuracy of any cached fix we accept (up to 3 km, typically 100 m). Rounding to
// 3dp (~110 m) groups repeat visits to the same shop without merging neighbours on
// the same street.
const PLACE_PRECISION = 3;

// Map height + total card + margins. Used only to scroll a tapped place into view, so an
// approximation is fine — being a few pixels out is invisible, and measuring the layout
// for this would be more machinery than the job needs.
const MAP_BLOCK_H = 380;

interface Place {
  key: string;
  lat: number;
  lon: number;
  total: number;
  count: number;
  worstAccuracy: number;
  txns: any[];
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', {month: 'long', year: 'numeric'});
}

export default function SpendingPlaces({navigation}: any) {
  const {userId} = useCurrentUser();
  const [monthOffset, setMonthOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const {start, end, label, isCurrent} = useMemo(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const e = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);
    return {
      start: s.toISOString(),
      end: e.toISOString(),
      label: monthLabel(s),
      isCurrent: monthOffset === 0,
    };
  }, [monthOffset]);

  // Expenses only, and only those that actually carry a fix. Transfers are excluded
  // upstream when the location is attached, but the filter is repeated here so this
  // screen cannot start showing them if that ever changes.
  const {data: rows} = useQuery(
    `SELECT t.*, a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.owner_id = ? AND t.transaction_type = 'expense'
        AND t.lat IS NOT NULL AND t.lon IS NOT NULL
        AND t.date_time >= ? AND t.date_time < ?
      ORDER BY t.date_time DESC`,
    [userId ?? '', start, end],
  );

  const {places, total} = useMemo(() => {
    const byKey = new Map<string, Place>();
    let sum = 0;
    for (const t of (rows as any[]) ?? []) {
      const lat = Number(t.lat);
      const lon = Number(t.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      const key = `${lat.toFixed(PLACE_PRECISION)},${lon.toFixed(PLACE_PRECISION)}`;
      const amt = t.amount ?? 0;
      sum += amt;
      const p = byKey.get(key);
      if (p) {
        p.total += amt;
        p.count += 1;
        p.worstAccuracy = Math.max(p.worstAccuracy, t.accuracy_m ?? 0);
        p.txns.push(t);
      } else {
        byKey.set(key, {
          key,
          lat,
          lon,
          total: amt,
          count: 1,
          worstAccuracy: t.accuracy_m ?? 0,
          txns: [t],
        });
      }
    }
    return {
      places: [...byKey.values()].sort((a, b) => b.total - a.total),
      total: sum,
    };
  }, [rows]);

  const max = places[0]?.total ?? 0;

  // GeoJSON for the map. `weight` is the place's share of the biggest place, so the
  // heat reflects how much was SPENT there rather than how many times — two visits
  // of 1,000 should not outrank one of 50,000.
  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: places.map(p => ({
        type: 'Feature' as const,
        id: p.key,
        properties: {
          weight: max > 0 ? p.total / max : 0,
          total: p.total,
          // Pre-formatted here rather than with a MapLibre number-format expression:
          // fmtAmount is what every other surface uses, so the map reads the same as
          // the list beneath it.
          label: fmtAmount(p.total),
          key: p.key,
        },
        geometry: {type: 'Point' as const, coordinates: [p.lon, p.lat]},
      })),
    }),
    [places, max],
  );

  // Fit to the data. With a single place there are no bounds to fit, so centre on it
  // at street zoom instead — otherwise MapLibre gets a zero-area box and zooms to
  // maximum, which looks broken.
  const camera = useMemo(() => {
    if (places.length === 0) {
      return {center: FALLBACK_CENTER, zoom: 11};
    }
    const lats = places.map(p => p.lat);
    const lons = places.map(p => p.lon);
    const spread = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lons) - Math.min(...lons),
    );
    if (places.length === 1 || spread < 0.002) {
      return {center: [places[0].lon, places[0].lat] as [number, number], zoom: 15};
    }
    // LngLatBounds is a flat [west, south, east, north] tuple per the GeoJSON RFC,
    // not the {ne, sw} object shape older versions used.
    return {
      bounds: [
        Math.min(...lons),
        Math.min(...lats),
        Math.max(...lons),
        Math.max(...lats),
      ] as [number, number, number, number],
      padding: {top: 40, right: 40, bottom: 40, left: 40},
    };
  }, [places]);

  // Tapping a marker selects that place: it expands in the list, and the list scrolls
  // to it. Without this the map was read-only — you could see where the money went but
  // not get from a dot to the transactions behind it, which is the only reason to look.
  const onMapPress = useCallback((e: any) => {
    const key = e?.features?.[0]?.properties?.key;
    if (!key) {
      return;
    }
    setOpen(prev => (prev === key ? null : key));
    setFullscreen(false);
    // Deferred a frame: in fullscreen the list is not mounted yet when the modal closes,
    // so scrolling immediately targets nothing.
    requestAnimationFrame(() => {
      const idx = places.findIndex(p => p.key === key);
      if (idx >= 0) {
        scrollRef.current?.scrollTo({y: MAP_BLOCK_H + idx * 92, animated: true});
      }
    });
  }, [places]);

  // One definition of the map, rendered inline and again full screen. Built with
  // useMemo so switching to fullscreen does not rebuild the layer tree — and so the
  // GeoJSON and camera props stay referentially stable across unrelated re-renders
  // (opening a place, changing month), which otherwise push new props to the native
  // layers on every state change.
  const mapBody = useMemo(
    () => (
      <MapLibreMap
        style={styles.map}
        mapStyle={MAP_STYLE}
        logo={false}
        compass={false}
        scaleBar={false}
        // Attribution stays on: OpenFreeMap serves OpenStreetMap data and the
        // licence requires crediting it.
        attribution>
        <Camera {...camera} duration={0} />
        {/* onPress on the SOURCE, so a tap anywhere on a dot or its label reports the
            feature under the finger. Tapping opens that place's row in the list below —
            the map and the list are two views of one thing, so selecting in either
            should select in both. */}
        <GeoJSONSource id="places" data={geojson} onPress={onMapPress}>
          {/* Heat first, circles above it, labels on top. The heatmap answers "where is
              the money concentrated" once there are dozens of points; the circles keep
              it legible at one or two, where a heat blob alone reads as a smudge; the
              labels answer "how much", which neither of the other two can. */}
          <Layer id="places-heat" type="heatmap" paint={HEAT_PAINT as any} />
          <Layer id="places-dots" type="circle" paint={DOT_PAINT as any} />
          <Layer
            id="places-labels"
            type="symbol"
            layout={LABEL_LAYOUT as any}
            paint={LABEL_PAINT as any}
          />
        </GeoJSONSource>
      </MapLibreMap>
    ),
    [camera, geojson],
  );

  const openInMaps = (p: Place) => {
    const q = `${p.lat},${p.lon}`;
    const nameHint = p.txns[0]?.merchant || 'Spending location';
    const url =
      Platform.OS === 'android'
        ? `geo:${q}?q=${q}(${encodeURIComponent(nameHint)})`
        : `https://maps.google.com/?q=${q}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${q}`).catch(() => {}),
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={styles.title}>Where you spend</Text>
          <Text style={styles.subtitle}>Money out, grouped by place</Text>
        </View>
      </View>

      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setMonthOffset(o => o - 1)}
          style={({pressed}) => [styles.monthBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ChevronLeft" size={17} color={T.text2} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.monthLabel}>{label}</Text>
        <Pressable
          onPress={() => !isCurrent && setMonthOffset(o => o + 1)}
          style={({pressed}) => [
            styles.monthBtn,
            {opacity: isCurrent ? 0.3 : pressed ? 0.7 : 1},
          ]}>
          <Icon name="ChevronRight" size={17} color={T.text2} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {places.length > 0 && (
          <View style={styles.mapWrap}>
            {mapBody}
            <Pressable
              onPress={() => setFullscreen(true)}
              hitSlop={8}
              style={({pressed}) => [styles.mapBtnFloat, {opacity: pressed ? 0.7 : 1}]}
              accessibilityLabel="View map full screen">
              <Icon name="Maximize2" size={15} color={T.text} strokeWidth={2.2} />
            </Pressable>
          </View>
        )}

        {places.length > 0 && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Traced to a place</Text>
            <Text style={styles.totalValue}>
              −{fmtAmount(total)} <Text style={styles.totalCcy}>RWF</Text>
            </Text>
            <Text style={styles.totalHint}>
              across {places.length} place{places.length === 1 ? '' : 's'} ·{' '}
              {(rows as any[])?.length ?? 0} transaction
              {((rows as any[])?.length ?? 0) === 1 ? '' : 's'}
            </Text>
          </View>
        )}

        {places.length === 0 && (
          <View style={styles.empty}>
            <Icon name="MapPin" size={34} color={T.text3} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No places yet in {label}</Text>
            <Text style={styles.emptyHint}>
              A location is attached only when a money-out SMS is captured as it
              arrives, and only from a position your phone already had — FinXAI never
              wakes the GPS. Income and transfers between your own accounts never get
              one.
            </Text>
          </View>
        )}

        <View style={{gap: 8}}>
          {places.map(p => {
            const isOpen = open === p.key;
            const topCat = resolveCat(p.txns[0]?.category ?? '');
            const meta = CATS[topCat];
            return (
              <View key={p.key} style={styles.card}>
                <Pressable
                  onPress={() => setOpen(prev => (prev === p.key ? null : p.key))}
                  style={({pressed}) => [{opacity: pressed ? 0.85 : 1, gap: 9}]}>
                  <View style={styles.cardHead}>
                    <CatChip cat={topCat} size={34} />
                    <View style={{flex: 1, minWidth: 0}}>
                      <Text style={styles.placeName} numberOfLines={1}>
                        {/* The merchant is the only human-readable handle we have —
                            there is no reverse geocoding here, which would be another
                            API dependency for a label the SMS already gives us. */}
                        {p.txns[0]?.merchant || 'Unnamed place'}
                        {p.count > 1 ? ` +${p.count - 1} more` : ''}
                      </Text>
                      <Text style={styles.placeMeta}>
                        {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                        {p.worstAccuracy ? ` · ±${Math.round(p.worstAccuracy)}m` : ''}
                      </Text>
                    </View>
                    <View style={{alignItems: 'flex-end', gap: 2}}>
                      <Text style={styles.placeAmt}>{fmtAmount(p.total)}</Text>
                      <Icon
                        name={isOpen ? 'ChevronDown' : 'ChevronRight'}
                        size={14}
                        color={T.text3}
                        strokeWidth={2}
                      />
                    </View>
                  </View>
                  <Progress value={p.total} max={Math.max(max, 1)} color={meta.color} />
                </Pressable>

                {isOpen && (
                  <View style={styles.expand}>
                    {p.txns.map(t => (
                      <View key={t.id} style={styles.txnRow}>
                        <View style={[styles.dot, {backgroundColor: CATS[resolveCat(t.category ?? '')].color}]} />
                        <Text style={styles.txnName} numberOfLines={1}>
                          {t.merchant || t.payee || 'Transaction'}
                        </Text>
                        <Text style={styles.txnWhen}>
                          {t.date_time ? format(new Date(t.date_time), 'd MMM HH:mm') : ''}
                        </Text>
                        <Text style={styles.txnAmt}>{fmtAmount(t.amount ?? 0)}</Text>
                      </View>
                    ))}

                    <Pressable
                      onPress={() => openInMaps(p)}
                      style={({pressed}) => [styles.mapBtn, {opacity: pressed ? 0.7 : 1}]}>
                      <Icon name="MapPin" size={13} color={T.accent} strokeWidth={2.2} />
                      <Text style={styles.mapBtnText}>Open in Maps</Text>
                      <Icon name="ChevronRight" size={13} color={T.accent} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Fullscreen map. `mapBody` is the same element tree as the inline map, so
          expanding does not tear down and rebuild the layers — it just gets a bigger
          container. onRequestClose wires up the Android back button, which is what
          people reach for first out of a fullscreen view. */}
      <Modal
        visible={fullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fsRoot}>
          {mapBody}
          <SafeAreaView style={styles.fsBar} edges={['top']} pointerEvents="box-none">
            <Pressable
              onPress={() => setFullscreen(false)}
              hitSlop={10}
              style={({pressed}) => [styles.fsClose, {opacity: pressed ? 0.7 : 1}]}
              accessibilityLabel="Close full screen map">
              <Icon name="Minimize2" size={16} color={T.text} strokeWidth={2.2} />
            </Pressable>
            <View style={styles.fsLegend}>
              <Text style={styles.fsLegendText}>
                {places.length} place{places.length === 1 ? '' : 's'} · {label}
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: FONTS.bold, fontSize: 19, color: T.text, lineHeight: 25},
  subtitle: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, lineHeight: 17},
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  monthBtn: {
    width: 34,
    height: 34,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  scroll: {paddingHorizontal: 16, paddingBottom: 40},
  mapWrap: {
    height: 260,
    borderRadius: R.card,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface2,
  },
  map: {flex: 1},
  // Floating control over the inline map.
  mapBtnFloat: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: R.small,
    backgroundColor: T.surface + 'E6',
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsRoot: {flex: 1, backgroundColor: T.bg},
  fsBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  fsClose: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface + 'E6',
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsLegend: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: T.surface + 'E6',
    borderWidth: 1,
    borderColor: T.border,
  },
  fsLegendText: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text2},
  totalCard: {
    padding: 14,
    marginBottom: 12,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  totalLabel: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, lineHeight: 17},
  totalValue: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: T.expense,
    lineHeight: 32,
    marginTop: 2,
  },
  totalCcy: {fontFamily: FONTS.medium, fontSize: 13, color: T.text3},
  totalHint: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2, lineHeight: 16},
  card: {
    padding: 13,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: 11},
  placeName: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text, lineHeight: 19},
  placeMeta: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: T.text3,
    lineHeight: 16,
  },
  placeAmt: {fontFamily: FONTS.bold, fontSize: 13.5, color: T.text},
  expand: {
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
    gap: 8,
  },
  txnRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  dot: {width: 7, height: 7, borderRadius: 4, flexShrink: 0},
  txnName: {flex: 1, fontFamily: FONTS.medium, fontSize: 12.5, color: T.text2},
  txnWhen: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  txnAmt: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: T.text,
    minWidth: 62,
    textAlign: 'right',
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  mapBtnText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.accent, lineHeight: 17},
  empty: {alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 8},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 15, color: T.text2, marginTop: 4},
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text3,
    textAlign: 'center',
    lineHeight: 18,
  },
});
