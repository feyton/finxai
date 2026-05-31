import React from 'react';
import {Pressable, View, ViewStyle} from 'react-native';
import {T, R} from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  pad?: number;
  onPress?: () => void;
  radius?: number;
}

export default function Card({children, style, pad = 16, onPress, radius = R.card}: CardProps) {
  const base: ViewStyle = {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: radius,
    padding: pad,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({pressed}) => [base, {opacity: pressed ? 0.85 : 1, transform: [{scale: pressed ? 0.97 : 1}]}, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
