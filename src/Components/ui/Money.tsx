import React from 'react';
import {Text} from 'react-native';
import {T, FONTS, fmtAmount} from '../../theme';

interface MoneyProps {
  amount: number;
  size?: number;
  weight?: 'regular' | 'semibold' | 'bold';
  showSign?: boolean;
  muteRwf?: boolean;
  color?: string;
}

export default function Money({
  amount,
  size = 14,
  weight = 'bold',
  showSign = true,
  muteRwf = true,
  color,
}: MoneyProps) {
  const positive = amount >= 0;
  const resolved = color ?? (showSign ? (positive ? T.income : T.expense) : T.text);
  const fontFamily = weight === 'bold' ? FONTS.bold : weight === 'semibold' ? FONTS.semibold : FONTS.regular;
  const sign = showSign ? (positive ? '+' : '-') : '';
  return (
    <Text style={{fontFamily, fontSize: size, color: resolved}} numberOfLines={1}>
      {sign}{fmtAmount(amount)}
      <Text style={{fontSize: size * 0.66, color: muteRwf ? T.text3 : resolved, fontFamily: FONTS.medium}}>
        {' '}RWF
      </Text>
    </Text>
  );
}
