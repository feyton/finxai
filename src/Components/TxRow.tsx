import {format} from 'date-fns';
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CATS, FONTS, R, T, fmtAmount, resolveCat} from '../theme';
import {Icon} from './ui';

interface TxRowProps {
  tx: any;
  onPress?: () => void;
}

export function TxRow({tx, onPress}: TxRowProps) {
  const cat = CATS[resolveCat(tx.category ?? '')];
  const label = tx.merchant || tx.payee || tx.category || 'Unknown';
  const isIncome = tx.transaction_type === 'income';
  const timeStr = tx.date_time
    ? format(new Date(tx.date_time), 'HH:mm')
    : '';

  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.row, {opacity: pressed ? 0.8 : 1}]}>
      <View style={[styles.iconCircle, {backgroundColor: cat.color + '22'}]}>
        <Icon name={cat.icon} size={17} color={cat.color} strokeWidth={2} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[tx.account_name, timeStr].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
      <Text style={[styles.amount, {color: isIncome ? T.income : T.expense}]}>
        {isIncome ? '+' : '-'}RWF {fmtAmount(tx.amount ?? 0)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn + 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mid: {flex: 1},
  label: {fontFamily: FONTS.medium, fontSize: 13.5, color: T.text},
  sub: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, marginTop: 1},
  amount: {fontFamily: FONTS.semibold, fontSize: 13, flexShrink: 0},
});
