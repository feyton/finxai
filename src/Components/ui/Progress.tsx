import React from 'react';
import {View} from 'react-native';
import {T} from '../../theme';

interface ProgressProps {
  value: number;
  max: number;
  color?: string;
  height?: number;
  bg?: string;
}

export default function Progress({
  value,
  max,
  color = T.accent,
  height = 7,
  bg = 'rgba(255,255,255,0.08)',
}: ProgressProps) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  const over = value > max;
  return (
    <View style={{height, borderRadius: height, backgroundColor: bg, overflow: 'hidden'}}>
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: over ? T.expense : color,
        }}
      />
    </View>
  );
}
