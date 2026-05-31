import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {T, FONTS} from '../../theme';
import Icon from './Icon';

interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export default function SectionHeader({title, action, onAction}: SectionHeaderProps) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10}}>
      <Text style={{fontFamily: FONTS.semibold, fontSize: 14, color: T.text, letterSpacing: 0.2}}>
        {title}
      </Text>
      {action && onAction && (
        <Pressable
          onPress={onAction}
          style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.7 : 1})}>
          <Text style={{fontFamily: FONTS.semibold, fontSize: 12, color: T.accent}}>{action}</Text>
          <Icon name="ChevronRight" size={14} color={T.accent} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );
}
