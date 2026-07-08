import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {T, FONTS, R} from '../theme';
import {Icon} from '../Components/ui';

interface NotifItem {
  id: string;
  type: 'ai' | 'budget' | 'partner' | 'bill' | 'salary';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const ITEMS: NotifItem[] = [
  {id: 'n1', type: 'ai', title: 'AI sorted 11 SMS', body: '3 need a quick check before saving.', time: '2 min ago', read: false},
  {id: 'n2', type: 'budget', title: 'Entertainment over budget', body: 'You\'ve spent 107% of your 45,000 entertainment budget.', time: '1 hr ago', read: false},
  {id: 'n3', type: 'bill', title: 'BK loan due in 2 days', body: '142,000 RWF installment on 1 Jun 2026.', time: '3 hr ago', read: true},
  {id: 'n4', type: 'salary', title: 'Salary received', body: '620,000 RWF from Rw Tech Ltd credited to BK.', time: 'Yesterday', read: true},
];

const ICON_MAP: Record<string, {icon: string; color: string}> = {
  ai:      {icon: 'Sparkles', color: '#22C55E'},
  budget:  {icon: 'PieChart', color: '#FB7185'},
  partner: {icon: 'Users', color: '#60A5FA'},
  bill:    {icon: 'Clock', color: '#FBBF24'},
  salary:  {icon: 'Coins', color: '#34D399'},
};

export default function NotificationsScreen({navigation}: any) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={19} color={T.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>
      <FlatList
        data={ITEMS}
        keyExtractor={i => i.id}
        contentContainerStyle={{padding: 16, gap: 10}}
        renderItem={({item}) => {
          const meta = ICON_MAP[item.type] ?? {icon: 'Bell', color: T.text2};
          return (
            <View style={[styles.notif, item.read && {opacity: 0.6}]}>
              <View style={[styles.notifIcon, {backgroundColor: meta.color + '22'}]}>
                <Icon name={meta.icon} size={18} color={meta.color} strokeWidth={2} />
              </View>
              <View style={{flex: 1, gap: 2}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.notifTime}>{item.time}</Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: FONTS.bold, fontSize: 20, color: T.text},
  notif: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: R.card,
    padding: 14,
  },
  notifIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifTitle: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text, flex: 1},
  notifBody: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, lineHeight: 18},
  notifTime: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: T.expense,
    flexShrink: 0,
  },
});
