import {useQuery, usePowerSync} from '@powersync/react-native';
import React from 'react';
import {Alert, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {nextOccurrence} from '../tools/recurring';
import {FONTS, R, T, fmtAmount} from '../theme';

const FREQ_LABEL: Record<string, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
  once: 'One-off',
};

/** "in 3 days" / "today" / "5 days ago" — a raw ISO string tells nobody anything. */
function relativeDue(iso: string | null): {text: string; overdue: boolean} {
  if (!iso) {
    return {text: 'No date', overdue: false};
  }
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) {
    return {text: 'No date', overdue: false};
  }
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round(
    (startOfDay(due).getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
  );
  if (days === 0) {
    return {text: 'Due today', overdue: false};
  }
  if (days === 1) {
    return {text: 'Due tomorrow', overdue: false};
  }
  if (days > 1) {
    return {text: `Due in ${days} days`, overdue: false};
  }
  return {text: days === -1 ? 'Due yesterday' : `${Math.abs(days)} days overdue`, overdue: true};
}

export default function ScheduledPaymentsScreen({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const {data: scheduledPayments} = useQuery(
    'SELECT * FROM scheduled_payments WHERE owner_id = ? ORDER BY next_reminder_date',
    [userId ?? ''],
  );
  const rows = scheduledPayments as any[];

  // Marking one paid rolls it to its next occurrence. Without this the screen is a
  // read-only list that goes stale the moment a payment is actually made, and every row
  // eventually reads "overdue".
  const markPaid = async (item: any) => {
    const now = new Date().toISOString();
    const from = new Date(item.next_reminder_date ?? item.start_date ?? now);
    const recurring = item.is_recurring === 1 && item.frequency !== 'once';
    const next = recurring ? nextOccurrence(from, item.frequency, 1).toISOString() : null;
    await db.execute(
      'UPDATE scheduled_payments SET last_paid_date = ?, next_reminder_date = ? WHERE id = ?',
      [now, next, item.id],
    );
  };

  const remove = (item: any) => {
    Alert.alert('Delete schedule', `Stop tracking "${item.name}"?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          db.execute('DELETE FROM scheduled_payments WHERE id = ?', [item.id]),
      },
    ]);
  };

  const renderItem = ({item}: any) => {
    const income = item.transaction_type === 'income';
    const due = relativeDue(item.next_reminder_date);
    const settled = !item.next_reminder_date;
    return (
      <View style={styles.row}>
        <View
          style={[
            styles.rowIcon,
            {backgroundColor: income ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.12)'},
          ]}>
          <Icon
            name={income ? 'ArrowDownLeft' : 'ArrowUpRight'}
            size={16}
            color={income ? T.income : T.expense}
            strokeWidth={2.4}
          />
        </View>

        <View style={{flex: 1}}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {FREQ_LABEL[item.frequency] ?? item.frequency}
            {item.payee ? ` · ${item.payee}` : ''}
          </Text>
          <Text
            style={[
              styles.rowDue,
              due.overdue && {color: T.expense},
              settled && {color: T.text3},
            ]}>
            {settled ? 'Completed' : due.text}
          </Text>
        </View>

        <View style={{alignItems: 'flex-end', gap: 8}}>
          <Text style={[styles.rowAmount, {color: income ? T.income : T.text}]}>
            {income ? '+' : ''}
            {fmtAmount(Number(item.amount) || 0)}
          </Text>
          <View style={{flexDirection: 'row', gap: 6}}>
            {!settled && (
              <Pressable
                onPress={() => markPaid(item)}
                hitSlop={6}
                style={({pressed}) => [styles.miniBtn, {opacity: pressed ? 0.6 : 1}]}>
                <Icon name="Check" size={13} color={T.accent} strokeWidth={2.6} />
              </Pressable>
            )}
            <Pressable
              onPress={() => remove(item)}
              hitSlop={6}
              style={({pressed}) => [styles.miniBtn, {opacity: pressed ? 0.6 : 1}]}>
              <Icon name="Trash2" size={13} color={T.text3} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>Scheduled payments</Text>
        <View style={{flex: 1}} />
        <Pressable
          onPress={() => navigation.navigate('AddPlannedPayment')}
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.8 : 1}]}>
          <Icon name="Plus" size={16} color={T.accentInk} strokeWidth={2.6} />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={{padding: 16, gap: 10, paddingBottom: 32}}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="Repeat" size={26} color={T.text3} strokeWidth={1.8} />
            <Text style={styles.emptyTitle}>Nothing scheduled yet</Text>
            <Text style={styles.emptyText}>
              Add the payments that repeat — rent, subscriptions, loan instalments — and
              they will show up here before they fall due.
            </Text>
            <Pressable
              onPress={() => navigation.navigate('AddPlannedPayment')}
              style={({pressed}) => [styles.emptyBtn, {opacity: pressed ? 0.85 : 1}]}>
              <Text style={styles.emptyBtnText}>Add one</Text>
            </Pressable>
          </View>
        }
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 13,
  },
  rowIcon: {width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  rowName: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  rowMeta: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2, marginTop: 1},
  rowDue: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text2, marginTop: 3},
  rowAmount: {fontFamily: FONTS.bold, fontSize: 14.5},
  miniBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {alignItems: 'center', gap: 8, paddingTop: 64, paddingHorizontal: 24},
  emptyTitle: {fontFamily: FONTS.semibold, fontSize: 15, color: T.text, marginTop: 4},
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text2,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: R.card,
    backgroundColor: T.accent,
  },
  emptyBtnText: {fontFamily: FONTS.bold, fontSize: 13.5, color: T.accentInk},
});
