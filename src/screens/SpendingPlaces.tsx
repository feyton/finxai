/**
 * Where the money goes, geographically.
 *
 * This is the data layer of the map view: transactions carrying a location,
 * clustered by proximity, ranked by spend. It is deliberately shipped before the
 * tile layer — a rendered map needs a native SDK and (for Google) an API key,
 * whereas the clustering, ranking and drill-down are the parts that actually answer
 * "where do I spend the most", and they work from the first located transaction.
 *
 * Only money-out captured live carries a position (see tools/smsIngest
 * locationForParsed), so this list is always a subset of spending, and the empty
 * state says so rather than implying the data is missing.
 */
import {useQuery} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {format} from 'date-fns';

import {CatChip, Icon, Progress} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, FONTS, R, T, fmtAmount, resolveCat} from '../theme';

// ~4 decimal places is roughly 11 m at this latitude, which is tighter than the
// accuracy of any cached fix we accept (up to 3 km, typically 100 m). Rounding to
// 3dp (~110 m) groups repeat visits to the same shop without merging neighbours on
// the same street.
const PLACE_PRECISION = 3;

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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
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
