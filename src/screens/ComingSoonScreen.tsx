import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {T, FONTS, R} from '../theme';
import {Icon} from '../Components/ui';

export default function ComingSoonScreen({navigation, route}: any) {
  const name = route?.name ?? 'Screen';
  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => navigation.goBack()}
        style={({pressed}) => [styles.back, {opacity: pressed ? 0.7 : 1}]}>
        <Icon name="ArrowLeft" size={19} color={T.text} />
      </Pressable>
      <View style={styles.center}>
        <View style={styles.icon}>
          <Icon name="Sparkles" size={32} color={T.accent} strokeWidth={1.8} />
        </View>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.sub}>
          This feature is coming soon. We're building it as part of the full FinXAI overhaul.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg, padding: 16},
  back: {
    width: 38,
    height: 38,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32},
  icon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: FONTS.bold, fontSize: 22, color: T.text},
  sub: {fontFamily: FONTS.regular, fontSize: 14, color: T.text2, textAlign: 'center', lineHeight: 22},
});
