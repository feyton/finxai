import {usePowerSync, useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Card, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, fmtAmount} from '../theme';
import {detectRecurring, type RecurringCandidate} from '../tools/recurring';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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
  const db = usePowerSync();

  const {data: scheduled} = useQuery('SELECT * FROM scheduled_payments WHERE owner_id = ?', [uid]);
  const {data: subs} = useQuery('SELECT * FROM subscriptions WHERE owner_id = ? AND active = 1', [uid]);
  const {data: sched} = useQuery(
    "SELECT ds.due_date, ds.amount, ds.status, d.party FROM debt_schedules ds JOIN debts d ON ds.debt_id = d.id WHERE ds.owner_id = ? AND ds.status != 'paid'",
    [uid],
  );

  // Debts with a due date but NO generated schedule rows.
  //
  // This screen only ever read debt_schedules, which is populated when a debt is created
  // with a full amortisation plan. A debt entered with just "next due" and an instalment
  // — the common case — therefore appeared nowhere, and since scheduled_payments and
  // subscriptions were also empty the whole screen looked dead. The obligation was in the
  // database the entire time.
  const {data: plainDebts} = useQuery(
    `SELECT d.id, d.party, d.installment, d.next_due, d.frequency, d.dir, d.outstanding
       FROM debts d
      WHERE d.owner_id = ? AND d.next_due IS NOT NULL AND d.next_due != ''
        AND COALESCE(d.outstanding, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM debt_schedules ds
           WHERE ds.debt_id = d.id AND ds.status != 'paid'
        )`,
    [uid],
  );

  // History for recurring detection. Six months is enough to see a quarterly rhythm and
  // small enough to stay cheap on every open.
  const {data: history} = useQuery(
    `SELECT merchant, payee, amount, date_time, category, account_id, transaction_type
       FROM transactions
      WHERE owner_id = ? AND transaction_type = 'expense' AND date_time >= ?
      ORDER BY date_time DESC`,
    [uid, new Date(Date.now() - 190 * 86400_000).toISOString()],
  );

  // Suggestions, never writes. A detection the user has already turned into a scheduled
  // payment is dropped so accepting one makes it disappear from the suggestions.
  const suggestions = useMemo(() => {
    const taken = new Set(
      (scheduled as any[]).map(p => (p.name ?? '').trim().toLowerCase()),
    );
    return detectRecurring((history as any[]) ?? [])
      .filter(c => !taken.has(c.name.trim().toLowerCase()))
      .slice(0, 4);
  }, [history, scheduled]);

  // Accepting a suggestion writes the same row AddPlannedPayment writes, so a tracked
  // charge is indistinguishable from a hand-entered one afterwards — nothing special to
  // maintain, and it can be edited or deleted the same way.
  const [tracking, setTracking] = useState<string | null>(null);
  const trackSuggestion = useCallback(
    async (c: RecurringCandidate) => {
      setTracking(c.key);
      try {
        const now = new Date().toISOString();
        await db.execute(
          'INSERT INTO scheduled_payments (id, name, amount, account_id, payee, frequency, transaction_type, start_date, next_reminder_date, is_recurring, note, labels, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            uuid(),
            c.name,
            c.amount,
            c.accountId ?? '',
            c.name,
            c.cadence,
            'expense',
            c.lastSeen,
            c.nextDue,
            1,
            `Detected from ${c.occurrences} past payments`,
            '',
            uid,
            now,
          ],
        );
      } catch (e) {
        console.warn('[Schedule] could not track suggestion:', e);
      } finally {
        setTracking(null);
      }
    },
    [db, uid],
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

    // Debts that carry only a next-due date. `dir` matters: money you LENT coming back is
    // income on this agenda, not another bill.
    for (const d of plainDebts as any[]) {
      const owed = d.dir === 'borrowed';
      items.push({
        date: parse(d.next_due),
        title: owed ? `${d.party} installment` : `${d.party} owes you`,
        sub: owed ? 'Debt' : 'Repayment due',
        // Fall back to the whole outstanding balance when no instalment was set — a
        // lump-sum loan still has a date worth seeing.
        amount: d.installment || d.outstanding || 0,
        income: !owed,
        icon: 'Coins',
        tint: owed ? T.info : T.income,
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
  }, [scheduled, subs, sched, plainDebts]);

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
        {/* Detected from history. Suggestions, not entries: a wrong guess that silently
            created a scheduled payment would be worse than showing nothing, so each one
            has to be accepted. */}
        {suggestions.length > 0 && (
          <View>
            <Text style={styles.suggestHead}>Looks recurring</Text>
            <Text style={styles.suggestHint}>
              Spotted in your history. Track one and it joins the agenda below.
            </Text>
            {suggestions.map(c => (
              <View key={c.key} style={styles.suggestRow}>
                <View style={styles.suggestIcon}>
                  <Icon name="Repeat" size={14} color={T.warn} strokeWidth={2.2} />
                </View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.suggestName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.suggestMeta}>
                    {c.cadence} · {c.occurrences}× · next {format(new Date(c.nextDue), 'd MMM')}
                  </Text>
                </View>
                <Text style={styles.suggestAmt}>{fmtAmount(c.amount)}</Text>
                <Pressable
                  onPress={() => trackSuggestion(c)}
                  disabled={tracking === c.key}
                  style={({pressed}) => [
                    styles.trackBtn,
                    {opacity: tracking === c.key ? 0.5 : pressed ? 0.7 : 1},
                  ]}>
                  <Text style={styles.trackText}>
                    {tracking === c.key ? '…' : 'Track'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

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
  suggestHead: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text, marginBottom: 2},
  suggestHint: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: T.text3,
    marginBottom: 10,
    lineHeight: 16,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    marginBottom: 8,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    // Amber, matching the "needs a decision from you" language used elsewhere —
    // these are proposals, not commitments.
    borderColor: 'rgba(251,191,36,0.28)',
  },
  suggestIcon: {
    width: 30,
    height: 30,
    borderRadius: R.small,
    backgroundColor: 'rgba(251,191,36,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestName: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  suggestMeta: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, lineHeight: 15},
  suggestAmt: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text2},
  trackBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: R.small,
    backgroundColor: T.accentSoft,
  },
  trackText: {fontFamily: FONTS.semibold, fontSize: 11.5, color: T.accent},
});
