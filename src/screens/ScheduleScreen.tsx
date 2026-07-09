import {useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useMemo} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Card, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, fmtAmount} from '../theme';

interface AgendaItem {
  date: Date;
  title: string;
  sub: string;
  amount: number;
  income: boolean;
  icon: string;
  tint: string;
}

export default function ScheduleScreen({navigation}: any) {
  const {userId} = useCurrentUser();
  const uid = userId ?? '';

  const {data: scheduled} = useQuery('SELECT * FROM scheduled_payments WHERE owner_id = ?', [uid]);
  const {data: subs} = useQuery('SELECT * FROM subscriptions WHERE owner_id = ? AND active = 1', [uid]);
  const {data: sched} = useQuery(
    "SELECT ds.due_date, ds.amount, ds.status, d.party FROM debt_schedules ds JOIN debts d ON ds.debt_id = d.id WHERE ds.owner_id = ? AND ds.status != 'paid'",
    [uid],
  );

  const {sections, dueThisWeek, comingIn} = useMemo(() => {
    const items: AgendaItem[] = [];
    const parse = (s: string) => new Date(s);

    for (const p of scheduled as any[]) {
      if (!p.next_reminder_date) {continue;}
      items.push({
        date: parse(p.next_reminder_date),
        title: p.name,
        sub: 'Scheduled',
        amount: p.amount ?? 0,
        income: p.transaction_type === 'income',
        icon: 'Calendar',
        tint: T.warn,
      });
    }
    for (const s of subs as any[]) {
      if (!s.due_date) {continue;}
      items.push({
        date: parse(s.due_date),
        title: s.provider_name,
        sub: 'Subscription',
        amount: s.amount ?? 0,
        income: false,
        icon: 'Repeat',
        tint: '#FB923C',
      });
    }
    for (const s of sched as any[]) {
      if (!s.due_date) {continue;}
      items.push({
        date: parse(s.due_date),
        title: `${s.party} installment`,
        sub: 'Debt',
        amount: s.amount ?? 0,
        income: false,
        icon: 'Coins',
        tint: T.info,
      });
    }

    items.sort((a, b) => a.date.getTime() - b.date.getTime());

    const now = new Date();
    const weekEnd = new Date();
    weekEnd.setDate(now.getDate() + 7);
    let due = 0;
    let incoming = 0;
    for (const it of items) {
      if (it.date >= now && it.date <= weekEnd) {
        if (it.income) {
          incoming += it.amount;
        } else {
          due += it.amount;
        }
      }
    }

    // group by day
    const groups: Record<string, {label: string; dow: string; items: AgendaItem[]}> = {};
    for (const it of items) {
      const key = format(it.date, 'yyyy-MM-dd');
      if (!groups[key]) {
        groups[key] = {label: format(it.date, 'd MMM'), dow: format(it.date, 'EEE'), items: []};
      }
      groups[key].items.push(it);
    }
    const secs = Object.keys(groups)
      .sort()
      .map(k => groups[k]);

    return {sections: secs, dueThisWeek: due, comingIn: incoming};
  }, [scheduled, subs, sched]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>Upcoming money</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('AddPlannedPayment')}
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Plus" size={18} color={T.accent} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{padding: 16, paddingTop: 4, gap: 16, paddingBottom: 40}}>
        {/* Summary tiles */}
        <View style={styles.tileRow}>
          <View style={styles.tile}>
            <View style={styles.tileHead}>
              <Icon name="ArrowUpRight" size={14} color={T.expense} strokeWidth={2.2} />
              <Text style={styles.tileLabel}>Due this week</Text>
            </View>
            <Text style={[styles.tileValue, {color: T.expense}]}>{fmtAmount(dueThisWeek)}<Text style={styles.tileUnit}> RWF</Text></Text>
          </View>
          <View style={styles.tile}>
            <View style={styles.tileHead}>
              <Icon name="ArrowDownLeft" size={14} color={T.income} strokeWidth={2.2} />
              <Text style={styles.tileLabel}>Coming in</Text>
            </View>
            <Text style={[styles.tileValue, {color: T.income}]}>{fmtAmount(comingIn)}<Text style={styles.tileUnit}> RWF</Text></Text>
          </View>
        </View>

        {/* Agenda */}
        {sections.map((sec, i) => (
          <View key={i} style={{gap: 8}}>
            <View style={styles.dayHead}>
              <Text style={styles.dayLabel}>{sec.label}</Text>
              <Text style={styles.dayDow}>{sec.dow}</Text>
            </View>
            <Card pad={6}>
              {sec.items.map((it, j) => (
                <View key={j} style={[styles.item, j < sec.items.length - 1 && styles.itemBorder]}>
                  <View style={[styles.itemIcon, {backgroundColor: it.tint + '22'}]}>
                    <Icon name={it.icon} size={18} color={it.tint} strokeWidth={2} />
                  </View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{it.title}</Text>
                    <Text style={styles.itemSub}>{it.sub}</Text>
                  </View>
                  {it.income ? (
                    <Text style={[styles.amount, {color: T.income}]}>+{fmtAmount(it.amount)}</Text>
                  ) : (
                    <View style={styles.payPill}>
                      <Text style={styles.payText}>{fmtAmount(it.amount)}</Text>
                    </View>
                  )}
                </View>
              ))}
            </Card>
          </View>
        ))}

        {sections.length === 0 && (
          <Card style={{alignItems: 'center', gap: 6}} pad={24}>
            <Icon name="Calendar" size={36} color={T.text3} strokeWidth={1.5} />
            <Text style={styles.emptyText}>Nothing scheduled yet</Text>
            <Text style={styles.emptyHint}>Planned payments, subscriptions and loan installments show here</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  iconBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center'},
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  addBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center'},
  tileRow: {flexDirection: 'row', gap: 10},
  tile: {flex: 1, backgroundColor: T.surface, borderRadius: R.card, borderWidth: 1, borderColor: T.border, padding: 13, gap: 4},
  tileHead: {flexDirection: 'row', alignItems: 'center', gap: 6},
  tileLabel: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  tileValue: {fontFamily: FONTS.bold, fontSize: 18},
  tileUnit: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text3},
  dayHead: {flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4},
  dayLabel: {fontFamily: FONTS.bold, fontSize: 14, color: T.text},
  dayDow: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3},
  item: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10},
  itemBorder: {borderBottomWidth: 1, borderBottomColor: T.border},
  itemIcon: {width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  itemTitle: {fontFamily: FONTS.medium, fontSize: 13.5, color: T.text},
  itemSub: {fontFamily: FONTS.regular, fontSize: 11, color: T.text2, marginTop: 1},
  amount: {fontFamily: FONTS.bold, fontSize: 13.5},
  payPill: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: T.accentSoft},
  payText: {fontFamily: FONTS.bold, fontSize: 12.5, color: T.accent},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  emptyHint: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, textAlign: 'center'},
});
