import React from 'react';
import {View} from 'react-native';
import {CATS, CategoryId, resolveCat} from '../../theme';
import Icon from './Icon';

interface CatChipProps {
  cat: string; // CategoryId or legacy category string
  size?: number;
  radius?: number;
}

export default function CatChip({cat, size = 38, radius = 12}: CatChipProps) {
  const id = (cat in CATS ? cat : resolveCat(cat)) as CategoryId;
  const c = CATS[id] ?? CATS.shopping;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.color + '22',
        borderWidth: 1,
        borderColor: c.color + '33',
      }}>
      <Icon name={c.icon} size={size * 0.48} color={c.color} strokeWidth={2} />
    </View>
  );
}
