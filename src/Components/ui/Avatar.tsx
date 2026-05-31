import React from 'react';
import {Image, Text, View} from 'react-native';
import {FONTS} from '../../theme';

interface AvatarProps {
  initials?: string;
  tint?: string;
  size?: number;
  img?: string;
}

export default function Avatar({initials = '', tint = '#22C55E', size = 38, img}: AvatarProps) {
  if (img) {
    return (
      <Image
        source={{uri: img}}
        style={{width: size, height: size, borderRadius: size / 2}}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint + '26',
        borderWidth: 1,
        borderColor: tint + '44',
      }}>
      <Text
        style={{
          color: tint,
          fontFamily: FONTS.bold,
          fontSize: size * 0.36,
          lineHeight: size * 0.44,
        }}>
        {initials}
      </Text>
    </View>
  );
}
