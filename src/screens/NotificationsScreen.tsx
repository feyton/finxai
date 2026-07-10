// Real notification feed — computed from the user's own data (no dummy rows):
// SMS awaiting review, budget overruns, installments due, planned payments &
// subscriptions coming up, fresh income, sharing activity, app updates.
import {useQuery} from '@powersync/react-native';
import {format, formatDistanceToNowStrict} from 'date-fns';
import React, {useEffect, useMemo, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {T, FONTS, R, fmtAmount} from '../theme';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {checkForUpdate} from '../tools/updateChecker';
import {computeBudgetSpend} from './BudgetScreen';

interface NotifItem {
  id: string;
  icon: string;
  color: string;
  title: string;
  body: string;
  when: Date | null; // null = pinned status item
  urgent?: boolean;
  onPress?: () => void;
}

function inDays(n: number): string {
  return new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();
}

export default function NotificationsScreen({navigation}: any) {
  const {userId} = useCurrentUser();
  const uid = userId ?? '';
  const [updateLatest, setUpdateLatest] = useState<string | null>(null);

  useEffect(() => {
    checkForUpdate()
      .then(info => info.available && setUpdateLatest(info.latest))
      .catch(() => {});
  }, []);

  const {data: reviewRows} = useQuery(
    'SELECT COUNT(*) as cnt, MAX(created_at) as latest FROM auto_records WHERE owner_id = ?',
    [uid],
  );
  const {data: budgets} = useQuery('SELECT * FROM budgets WHERE owner_id = ?', [uid]);
  const {data: items} = useQuery('SELECT * FROM budget_items WHERE owner_id = ?', [uid]);
  const {data: effRows} = useQuery(
    `SELECT t.id, t.budget_id, t.date_time, t.transaction_type,
            COALESCE(s.category, t.category) AS category,
            COALESCE(s.amount, t.amount) AS amount
     FROM transactions t
     LEFT JOIN split_details s ON s.transaction_id = t.id
     WHERE t.owner_id = ? AND t.transaction_type IN ('expense','income')
       AND t.date_time >= ?`,
    [uid, new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()],
  );
  const {data: dueInstallments} = useQuery(
    `SELECT ds.*, d.party, d.dir FROM debt_schedules ds
     JOIN debts d ON ds.debt_id = d.id
     WHERE ds.owner_id = ? AND ds.status != 'paid' AND ds.due_date <= ?
     ORDER BY ds.due_date ASC LIMIT 10`,
    [uid, inDays(7)],
  );
  const {data: planned} = useQuery(
    'SELECT * FROM scheduled_payments WHERE owner_id = ? AND next_reminder_date IS NOT NULL AND next_reminder_date <= ? ORDER BY next_reminder_date ASC LIMIT 10',
    [uid, inDays(7)],
  );
  const {data: subs} = useQuery(
    'SELECT * FROM subscriptions WHERE owner_id = ? AND active = 1 AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date ASC LIMIT 10',
    [uid, inDays(7)],
  );
  const {data: freshIncome} = useQuery(
    `SELECT t.*, a.name as account_name FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.owner_id = ? AND t.transaction_type = 'income' AND t.date_time >= ?
     ORDER BY t.date_time DESC LIMIT 5`,
    [uid, new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()],
  );
  const {data: shares} = useQuery(
    'SELECT * FROM account_shares WHERE (owner_id = ? OR shared_with_id = ?) AND created_at >= ?',
    [uid, uid, new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()],
  );
  const {data: accounts} = useQuery('SELECT id, name FROM accounts', []);

  const feed = useMemo<NotifItem[]>(() => {
    const out: NotifItem[] = [];
    const accName = new Map((accounts as any[]).map(a => [a.id, a.name ?? 'Account']));
    const nowIso = new Date().toISOString();

    // 1. SMS review queue — pinned while non-empty
    const cnt = (reviewRows?.[0] as any)?.cnt ?? 0;
    if (cnt > 0) {
      out.push({
        id: 'review',
        icon: 'Sparkles',
        color: T.accent,
        title: `AI sorted your SMS`,
        body: `${cnt} transaction${cnt === 1 ? '' : 's'} need a quick check before saving.`,
        when: (reviewRows?.[0] as any)?.latest ? new Date((reviewRows?.[0] as any).latest) : null,
        urgent: true,
        onPress: () => navigation.navigate('SMSReview'),
      });
    }

    // 2. Budget overruns / near-limit
    const itemsByBudget = new Map<string, any[]>();
    for (const it of items as any[]) {
      const list = itemsByBudget.get(it.budget_id) ?? [];
      list.push(it);
      itemsByBudget.set(it.budget_id, list);
    }
    for (const b of budgets as any[]) {
      const bItems = itemsByBudget.get(b.id) ?? [];
      const planned2 = bItems.reduce((s, it) => s + (it.amount ?? 0), 0) || (b.amount ?? 0);
      if (planned2 <= 0) {continue;}
      const {spent} = computeBudgetSpend(b, bItems, effRows as any[]);
      const pct = spent / planned2;
      if (pct > 1) {
        out.push({
          id: `budget-over-${b.id}`,
          icon: 'PieChart',
          color: T.expense,
          title: `${b.name} is over budget`,
          body: `${fmtAmount(spent)} of ${fmtAmount(planned2)} RWF spent — ${fmtAmount(spent - planned2)} over.`,
          when: null,
          urgent: true,
          onPress: () => navigation.navigate('BudgetDetails', {budgetId: b.id}),
        });
      } else if (pct >= 0.85) {
        out.push({
          id: `budget-near-${b.id}`,
          icon: 'PieChart',
          color: T.warn,
          title: `${b.name} at ${Math.round(pct * 100)}%`,
          body: `${fmtAmount(planned2 - spent)} RWF left of ${fmtAmount(planned2)}.`,
          when: null,
          onPress: () => navigation.navigate('BudgetDetails', {budgetId: b.id}),
        });
      }
    }

    // 3. Debt installments due within a week (or overdue)
    for (const ds of dueInstallments as any[]) {
      const overdue = (ds.due_date ?? '') < nowIso;
      out.push({
        id: `debt-${ds.id}`,
        icon: 'Clock',
        color: overdue ? T.expense : T.warn,
        title: overdue
          ? `${ds.party} installment overdue`
          : `${ds.party} installment due ${format(new Date(ds.due_date), 'MMM d')}`,
        body: `${fmtAmount(ds.amount ?? 0)} RWF · payment ${ds.n}${ds.dir === 'lent' ? ' (owed to you)' : ''}`,
        when: new Date(ds.due_date),
        urgent: overdue,
        onPress: () => navigation.navigate('Debt'),
      });
    }

    // 4. Planned payments + subscriptions coming up
    for (const p of planned as any[]) {
      out.push({
        id: `plan-${p.id}`,
        icon: 'Calendar',
        color: T.info,
        title: `${p.name ?? 'Planned payment'} coming up`,
        body: `${fmtAmount(p.amount ?? 0)} RWF · ${format(new Date(p.next_reminder_date), 'MMM d')}`,
        when: new Date(p.next_reminder_date),
        onPress: () => navigation.navigate('ScheduledPayment'),
      });
    }
    for (const s of subs as any[]) {
      out.push({
        id: `sub-${s.id}`,
        icon: 'Repeat',
        color: T.info,
        title: `${s.provider_name ?? 'Subscription'} renews soon`,
        body: `${fmtAmount(s.amount ?? 0)} RWF · ${format(new Date(s.due_date), 'MMM d')}`,
        when: new Date(s.due_date),
        onPress: () => navigation.navigate('ScheduledPayment'),
      });
    }

    // 5. Fresh income
    for (const t of freshIncome as any[]) {
      out.push({
        id: `income-${t.id}`,
        icon: 'Coins',
        color: T.income,
        title: 'Money in',
        body: `${fmtAmount(t.amount ?? 0)} RWF from ${t.merchant || t.payee || 'someone'} → ${t.account_name ?? 'account'}.`,
        when: t.date_time ? new Date(t.date_time) : null,
        onPress: () =>
          navigation.navigate('Home', {screen: 'Transactions', params: {openTxId: t.id}}),
      });
    }

    // 6. Sharing activity (last 14 days)
    for (const s of shares as any[]) {
      const acc = accName.get(s.account_id) ?? 'an account';
      if (s.owner_id === uid) {
        out.push({
          id: `share-out-${s.id}`,
          icon: 'Users',
          color: T.info,
          title: s.status === 'active' ? 'Share active' : 'Share pending',
          body:
            s.status === 'active'
              ? `${s.invitee_email} now sees ${acc}.`
              : `${s.invitee_email} hasn't signed in yet — ${acc} activates when they do.`,
          when: s.created_at ? new Date(s.created_at) : null,
        });
      } else {
        out.push({
          id: `share-in-${s.id}`,
          icon: 'Users',
          color: T.accent,
          title: 'Account shared with you',
          body: `${acc} was shared to your email (${s.access === 'edit' ? 'view & edit' : 'view only'}).`,
          when: s.created_at ? new Date(s.created_at) : null,
          onPress: () => navigation.navigate('Home', {screen: 'AccountsStack'}),
        });
      }
    }

    // 7. App update
    if (updateLatest) {
      out.push({
        id: 'update',
        icon: 'RefreshCcw',
        color: T.accent,
        title: `FinXAI ${updateLatest} is available`,
        body: 'Open Profile → Check for updates to install it in-app.',
        when: null,
        onPress: () => navigation.navigate('UserProfile'),
      });
    }

    // urgent first, then newest
    return out.sort((a, b) => {
      if (!!a.urgent !== !!b.urgent) {return a.urgent ? -1 : 1;}
      return (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0);
    });
  }, [
    reviewRows,
    budgets,
    items,
    effRows,
    dueInstallments,
    planned,
    subs,
    freshIncome,
    shares,
    accounts,
    updateLatest,
    uid,
    navigation,
  ]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={19} color={T.text} />
        </Pressable>
        <View>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Live from your data — nothing canned</Text>
        </View>
      </View>
      <FlatList
        data={feed}
        keyExtractor={i => i.id}
        contentContainerStyle={{padding: 16, gap: 10, flexGrow: 1}}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="CheckCircle" size={38} color={T.accent} strokeWidth={1.6} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptySub}>
              Nothing needs your attention — reviews, budgets and due dates are
              all clear.
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <Pressable
            onPress={item.onPress}
            disabled={!item.onPress}
            style={({pressed}) => [styles.notif, {opacity: pressed ? 0.85 : 1}]}>
            <View style={[styles.notifIcon, {backgroundColor: item.color + '22'}]}>
              <Icon name={item.icon} size={18} color={item.color} strokeWidth={2} />
            </View>
            <View style={{flex: 1, gap: 2}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                {item.urgent && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
              {item.when && (
                <Text style={styles.notifTime}>
                  {formatDistanceToNowStrict(item.when, {addSuffix: true})}
                </Text>
              )}
            </View>
            {item.onPress && (
              <Icon name="ChevronRight" size={16} color={T.text3} strokeWidth={2} />
            )}
          </Pressable>
        )}
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
  subtitle: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
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
  notifTitle: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text, flexShrink: 1},
  notifBody: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, lineHeight: 18},
  notifTime: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: T.expense,
    flexShrink: 0,
  },
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32},
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: T.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  emptySub: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text3, textAlign: 'center', lineHeight: 18},
});
