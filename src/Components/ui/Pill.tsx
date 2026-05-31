import React from 'react';
import {Text, View} from 'react-native';
import {T, FONTS} from '../../theme';
import Icon from './Icon';

interface PillProps {
  children: React.ReactNode;
  color?: string;
  bg?: string;
  icon?: string;
  size?: number;
}

export default function Pill({
  children,
  color = T.text2,
  bg = 'rgba(255,255,255,0.06)',
  icon,
  size = 11,
}: PillProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 99,
        backgroundColor: bg,
      }}>
      {icon && <Icon name={icon} size={size + 2} color={color} strokeWidth={2.2} />}
      <Text style={{fontFamily: FONTS.semibold, fontSize: size, color, lineHeight: size * 1.4}}>
        {children}
      </Text>
    </View>
  );
}

// Confidence badge for AI tagging
export function ConfPill({value}: {value: number}) {
  const pct = Math.round(value * 100);
  const high = value >= 0.92;
  const mid = value >= 0.8;
  const color = high ? T.accent : mid ? T.warn : T.expense;
  return (
    <Pill color={color} bg={color + '1f'} icon="Sparkles" size={10}>
      {pct}%
    </Pill>
  );
}
