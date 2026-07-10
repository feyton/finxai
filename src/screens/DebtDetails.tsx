// Debt detail: payoff progress, terms, and the full repayment schedule.
// Tap an installment to mark it paid (or unpaid) — outstanding, paid count
// and next_due recompute from the schedule.
import {usePowerSync, useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon, Progress} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {appAlert} from '../Components/AppDialog';
import {outstandingAfter} from '../tools/amortize';
import {FONTS, R, T, fmtAmount} from '../theme';

function fmtDay(d?: string | null): string {
  return d ? format(new Date(d), 'MMM d, yyyy') : '—';
}

export default function DebtDetails({route, navigation}: any) {
  const {debtId} = route.params;
  const db = usePowerSync();
  const {userId} = useCurrentUser();

  const {data: debts} = useQuery(
    'SELECT * FROM debts WHERE id = ? AND owner_id = ?',
    [debtId, userId ?? ''],
  );
  const {data: schedule} = useQuery(
    'SELECT * FROM debt_schedules WHERE debt_id = ? ORDER BY n ASC',
    [debtId],
  );

  const debt = (debts as any[])[0];
  const rows = schedule as any[];

  // Toggle one installment, then recompute the debt from the schedule.
  const setPaid = async (row: any, paid: boolean) => {
    const updated = rows.map(r =>
      r.id === row.id ? {...r, status: paid ? 'paid' : 'upcoming'} : {...r},
    );
    // earliest unpaid becomes 'due', the rest 'upcoming'
    let dueAssigned = false;
    for (const r of updated) {
      if (r.status === 'paid') {continue;}
      r.status = dueAssigned ? 'upcoming' : 'due';
      dueAssigned = true;
    }
    for (const r of updated) {
      await db.execute('UPDATE debt_schedules SET status = ? WHERE id = ?', [
        r.status,
        r.id,
      ]);
    }
    const paidCount = updated.filter(r => r.status === 'paid').length;
    const firstUnpaid = updated.find(r => r.status !== 'paid');
    // Amortized remaining balance (interest-aware) — NOT principal minus a
    // multiple of the installment, which overstates progress on real loans.
    const outstanding = outstandingAfter(
      debt.principal ?? 0,
      debt.rate ?? 0,
      updated.map(r => ({due_date: r.due_date, amount: r.amount ?? 0})),
      paidCount,
    );
    await db.execute(
      'UPDATE debts SET paid = ?, outstanding = ?, next_due = ? WHERE id = ?',
      [paidCount, outstanding, firstUnpaid?.due_date ?? null, debtId],
    );
  };

  const onRowPress = (row: any) => {
    const isPaid = row.status === 'paid';
    appAlert(
      isPaid ? 'Mark as unpaid?' : 'Mark as paid?',
      `Payment ${row.n} · ${fmtAmount(row.amount ?? 0)} RWF · due ${fmtDay(row.due_date)}`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: isPaid ? 'Mark unpaid' : 'Mark paid',
          onPress: () => setPaid(row, !isPaid),
        },
      ],
    );
  };

  const deleteDebt = () => {
    appAlert('Delete this debt?', `${debt?.party} and its schedule will be removed.`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await db.execute('DELETE FROM debt_schedules WHERE debt_id = ?', [debtId]);
          await db.execute('DELETE FROM debts WHERE id = ?', [debtId]);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!debt) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Debt not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwe = debt.dir === 'borrowed';
  const tint = debt.tint || (isOwe ? T.info : T.income);
  const pct = debt.term > 0 ? Math.round(((debt.paid ?? 0) / debt.term) * 100) : 0;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={styles.title} numberOfLines={1}>{debt.party}</Text>
          <Text style={styles.subtitle}>
            {isOwe ? 'You owe' : 'Owed to you'}
            {debt.rate > 0 ? ` · ${debt.rate}% p.a.` : ''}
            {debt.frequency ? ` · ${debt.frequency}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={deleteDebt}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Trash2" size={16} color={T.expense} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Outstanding</Text>
          <Text style={[styles.summaryValue, {color: isOwe ? T.expense : T.income}]}>
            {fmtAmount(debt.outstanding ?? 0)}
            <Text style={styles.summaryUnit}> of {fmtAmount(debt.principal ?? 0)} RWF</Text>
          </Text>
          <View style={{marginTop: 10}}>
            <Progress value={debt.paid ?? 0} max={debt.term || 1} color={tint} />
          </View>
          <View style={styles.statsRow}>
            <Stat label="Repaid" value={`${pct}%`} />
            <Stat label="Installment" value={fmtAmount(debt.installment ?? 0)} />
            <Stat label="Payments" value={`${debt.paid ?? 0}/${debt.term ?? '—'}`} />
            <Stat label="Next due" value={debt.next_due ? format(new Date(debt.next_due), 'MMM d') : '—'} />
          </View>
        </View>

        {/* Schedule */}
        <Text style={styles.sectionLabel}>Repayment schedule</Text>
        <Text style={styles.hint}>Tap an installment to mark it paid or unpaid.</Text>
        <View style={{gap: 7}}>
          {rows.map(row => {
            const isPaid = row.status === 'paid';
            const isDue = row.status === 'due';
            const overdue = isDue && row.due_date && row.due_date < new Date().toISOString();
            return (
              <Pressable
                key={row.id}
                onPress={() => onRowPress(row)}
                style={({pressed}) => [styles.schedRow, {opacity: pressed ? 0.8 : 1}]}>
                <View
                  style={[
                    styles.schedCheck,
                    isPaid && {backgroundColor: T.accent, borderColor: T.accent},
                    overdue && !isPaid && {borderColor: T.expense},
                  ]}>
                  {isPaid && <Icon name="Check" size={12} color={T.accentInk} strokeWidth={3} />}
                </View>
                <View style={{flex: 1}}>
                  <Text style={[styles.schedTitle, isPaid && styles.paidText]}>
                    Payment {row.n}
                  </Text>
                  <Text style={styles.schedSub}>{fmtDay(row.due_date)}</Text>
                </View>
                <View style={{alignItems: 'flex-end', gap: 3}}>
                  <Text style={[styles.schedAmt, isPaid && styles.paidText]}>
                    {fmtAmount(row.amount ?? 0)}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isPaid
                          ? 'rgba(52,211,153,0.15)'
                          : overdue
                          ? 'rgba(251,113,133,0.15)'
                          : isDue
                          ? 'rgba(251,191,36,0.15)'
                          : T.surface2,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: isPaid
                            ? T.income
                            : overdue
                            ? T.expense
                            : isDue
                            ? T.warn
                            : T.text3,
                        },
                      ]}>
                      {isPaid ? 'paid' : overdue ? 'overdue' : row.status}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
          {rows.length === 0 && (
            <Text style={styles.emptyText}>No schedule entries for this debt.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <View style={{flex: 1}}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {fontFamily: FONTS.bold, fontSize: 16, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, marginTop: 1},
  scroll: {padding: 16, paddingTop: 4, paddingBottom: 40},
  summaryCard: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  summaryLabel: {fontFamily: FONTS.regular, fontSize: 12, color: T.text2},
  summaryValue: {fontFamily: FONTS.bold, fontSize: 24, marginTop: 2},
  summaryUnit: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3},
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 12,
  },
  statLabel: {fontFamily: FONTS.regular, fontSize: 10, color: T.text3},
  statValue: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text, marginTop: 2},
  sectionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
  },
  hint: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, marginTop: 3, marginBottom: 8},
  schedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  schedCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: T.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schedTitle: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  schedSub: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, marginTop: 1},
  schedAmt: {fontFamily: FONTS.bold, fontSize: 13, color: T.text},
  paidText: {color: T.text3, textDecorationLine: 'line-through'},
  statusPill: {paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99},
  statusText: {fontFamily: FONTS.semibold, fontSize: 9.5},
  emptyText: {fontFamily: FONTS.regular, fontSize: 13, color: T.text3, textAlign: 'center', paddingVertical: 12},
});
