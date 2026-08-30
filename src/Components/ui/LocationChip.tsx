// Where a payment happened, and a tap to open it on a map.
//
// A position is captured only for money-out that arrived while the phone had a usable
// fix (see locationForParsed in tools/smsIngest), so most rows carry none — callers
// render this only when lat and lon are both present.
//
// It exists as one component because it is shown in two places that must agree: the
// transaction detail sheet, and the SMS review card, where recognising WHERE a payment
// happened is often the fastest way to decide whether the AI named the merchant
// correctly and the record can be approved as-is.
import React from 'react';
import {Linking, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {FONTS, R, T} from '../../theme';
import Icon from './Icon';

export function openMapAt(lat: number, lon: number, label?: string): void {
  const q = `${lat},${lon}`;
  const web = `https://maps.google.com/?q=${q}`;
  // A geo: URI lets Android hand this to whichever map app the user actually uses;
  // the https URL is the fallback for a device with none installed.
  const target =
    Platform.OS === 'android'
      ? `geo:${q}?q=${q}(${encodeURIComponent(label || 'Transaction')})`
      : web;
  Linking.openURL(target).catch(() => {
    Linking.openURL(web).catch(() => {});
  });
}

export default function LocationChip({
  lat,
  lon,
  accuracyM,
  label,
  /**
   * 'device' (or unset) — a real fix taken when this payment happened.
   * 'merchant' — inherited from a previous visit to the same merchant (v17).
   */
  source,
  /** Boxed presentation with a leading caption, for use inside a card. */
  boxed = false,
}: {
  lat: number;
  lon: number;
  accuracyM?: number | null;
  label?: string;
  source?: string | null;
  boxed?: boolean;
}) {
  const coords = `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
  const inherited = source === 'merchant';
  // A cached fix can be kilometres wide, and a 2km radius says something very
  // different about "were you at this shop" than a 20m one — so the accuracy is part
  // of the reading, never hidden behind it.
  //
  // An inherited pin shows no radius at all: the source fix's accuracy describes how
  // well a DIFFERENT visit was known, and printing it here would dress a lookup up as
  // a measurement of this payment.
  const accuracy = !inherited && accuracyM ? ` · ±${Math.round(accuracyM)}m` : '';

  const body = (
    <View style={styles.row}>
      <Icon name="MapPin" size={12} color={T.accent} strokeWidth={2.2} />
      <Text style={styles.text} numberOfLines={1}>
        {coords}
        {accuracy}
        {inherited ? ' · usual spot' : ''}
      </Text>
    </View>
  );

  return (
    <Pressable
      onPress={() => openMapAt(lat, lon, label)}
      hitSlop={6}
      style={({pressed}) => [boxed && styles.box, {opacity: pressed ? 0.6 : 1}]}>
      {boxed ? (
        <View style={styles.boxInner}>
          <Text style={styles.caption}>
            {inherited ? 'Where you usually pay them' : 'Where this happened'}
          </Text>
          {body}
        </View>
      ) : (
        body
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1},
  text: {
    // Monospaced so the two coordinates line up and read as data rather than prose;
    // accent-coloured because the row is tappable and opens a map.
    fontFamily: 'monospace',
    fontSize: 12,
    color: T.accent,
    flexShrink: 1,
  },
  box: {
    borderRadius: R.small,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  boxInner: {gap: 2},
  caption: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    color: T.text3,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
