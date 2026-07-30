import {format} from 'date-fns';
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CATS, FONTS, R, T, fmtAmount, resolveCat} from '../theme';
import {Icon} from './ui';

interface TxRowProps {
  tx: any;
  onPress?: () => void;
}


// Memoized ignoring `onPress` identity: the parent's row-tap handler is
// typically a fresh closure every render (`() => openDetail(item)`), but as
// long as the underlying `tx` object is unchanged there is nothing new to
// draw — re-rendering every visible row on every keystroke of an unrelated
// search box is exactly the kind of avoidable jank that reads as "lag".
export const TxRow = React.memo(TxRowImpl, (prev, next) => prev.tx === next.tx);

function TxRowImpl({tx, onPress}: TxRowProps) {
  const cat = CATS[resolveCat(tx.category ?? '')];
  const label = tx.merchant || tx.payee || tx.category || 'Unknown';
  const isTransfer = tx.transaction_type === 'transfer';
  const isIncome = tx.transaction_type === 'income';
  const amountColor = isTransfer ? T.text2 : isIncome ? T.income : T.expense;
  const sign = isTransfer ? '' : isIncome ? '+' : '-';
  const timeStr = tx.date_time
    ? format(new Date(tx.date_time), 'HH:mm')
    : '';

  // Category is shown as text, not just as the icon's colour — the icon alone
  // needs the palette memorised, and it cannot express the subcategory at all.
  // Skipped for transfers, where the stored category is meaningless (money
  // between your own accounts is neither spend nor income).
  const catLabel = isTransfer ? '' : cat?.label ?? tx.category ?? '';
  const rest = [tx.subcategory, tx.account_name, timeStr]
    .filter(Boolean)
    .join('  ·  ');

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
          {/* Category tinted to match the icon so the two reinforce each other;
              subcategory, account and time stay muted so the row still scans
              top-to-bottom by merchant rather than becoming a wall of colour. */}
          {catLabel ? (
            <Text style={{color: cat.color}}>{catLabel}</Text>
          ) : null}
          {catLabel && rest ? '  ·  ' : ''}
          {rest}
        </Text>
      </View>
      <Text style={[styles.amount, {color: amountColor}]}>
        {sign}RWF {fmtAmount(tx.amount ?? 0)}
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
