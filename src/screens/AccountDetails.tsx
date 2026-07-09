import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useMemo} from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {TxRow} from '../Components/TxRow';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, accountIcon, accountTint, fmtAmount} from '../theme';

function dayLabel(dt: string): string {
  const date = new Date(dt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {return 'Today';}
  if (date.toDateString() === yesterday.toDateString()) {return 'Yesterday';}
  return format(date, 'MMM d, yyyy');
}

export default function AccountDetails({route, navigation}: any) {
  const {accountId} = route.params;
  const {userId} = useCurrentUser();
  const tabBarHeight = useBottomTabBarHeight();

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE id = ? AND owner_id = ?',
    [accountId, userId ?? ''],
  );

  const {data: transactions} = useQuery(
    'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.account_id = ? AND t.owner_id = ? ORDER BY t.date_time DESC',
    [accountId, userId ?? ''],
  );

  const account = (accounts as any[])[0];

  const {totalIncome, totalExpense, sections} = useMemo(() => {
    let income = 0;
    let expense = 0;
    const groups: Record<string, any[]> = {};

    for (const t of transactions as any[]) {
      if (t.transaction_type === 'income') {income += t.amount ?? 0;}
      else {expense += t.amount ?? 0;}

      const key = dayLabel(t.date_time);
      if (!groups[key]) {groups[key] = [];}
      groups[key].push(t);
    }

    const secs = Object.entries(groups).map(([title, data]) => ({
      title,
      data,
      dayIncome: data
        .filter(t => t.transaction_type === 'income')
        .reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
      dayExpense: data
        .filter(t => t.transaction_type !== 'income')
        .reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    }));

    return {totalIncome: income, totalExpense: expense, sections: secs};
  }, [transactions]);

  if (!account) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Account not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tint = accountTint(account.name ?? '');
  const icon = accountIcon(account.name ?? '', account.type ?? '');

  return (
    <SafeAreaView style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={({item}) => <TxRow tx={item} />}
        renderSectionHeader={({section}: any) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionDate}>{section.title}</Text>
            <View style={styles.dayTotals}>
              {section.dayIncome > 0 && (
                <Text style={styles.dayIn}>+{fmtAmount(section.dayIncome)}</Text>
              )}
              {section.dayExpense > 0 && (
                <Text style={styles.dayOut}>-{fmtAmount(section.dayExpense)}</Text>
              )}
            </View>
          </View>
        )}
        ListHeaderComponent={
          <>
            {/* Back + title */}
            <View style={styles.header}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
                <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.headerTitle} numberOfLines={1}>{account.name}</Text>
              <View style={{width: 36}} />
            </View>

            {/* Account summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View style={[styles.accountIcon, {backgroundColor: tint + '22'}]}>
                  <Icon name={icon} size={22} color={tint} strokeWidth={2} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={styles.accountType}>{account.type ?? 'Account'}</Text>
                </View>
              </View>
              <Text style={styles.balanceLabel}>Current balance</Text>
              <Text style={styles.balanceValue}>
                RWF {fmtAmount(account.available_balance ?? 0)}
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Icon name="TrendingUp" size={14} color={T.income} strokeWidth={2.2} />
                  <View>
                    <Text style={styles.statLabel}>Total income</Text>
                    <Text style={[styles.statValue, {color: T.income}]}>
                      +RWF {fmtAmount(totalIncome)}
                    </Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Icon name="TrendingDown" size={14} color={T.expense} strokeWidth={2.2} />
                  <View>
                    <Text style={styles.statLabel}>Total expenses</Text>
                    <Text style={[styles.statValue, {color: T.expense}]}>
                      -RWF {fmtAmount(totalExpense)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Section label */}
            {(transactions as any[]).length > 0 && (
              <Text style={styles.sectionLabel}>All transactions</Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="Receipt" size={38} color={T.text3} strokeWidth={1.4} />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        }
        contentContainerStyle={[styles.list, {paddingBottom: tabBarHeight + 28}]}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  list: {paddingBottom: 80},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {flex: 1, fontFamily: FONTS.semibold, fontSize: 16, color: T.text, textAlign: 'center'},
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 4,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {fontFamily: FONTS.semibold, fontSize: 14.5, color: T.text},
  accountType: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 1},
  balanceLabel: {fontFamily: FONTS.medium, fontSize: 12, color: T.text3},
  balanceValue: {fontFamily: FONTS.bold, fontSize: 26, color: T.text, marginBottom: 12},
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 12,
    marginTop: 4,
  },
  stat: {flexDirection: 'row', flex: 1, gap: 8, alignItems: 'center'},
  statDivider: {width: 1, height: 32, backgroundColor: T.border, marginHorizontal: 12},
  statLabel: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  statValue: {fontFamily: FONTS.semibold, fontSize: 13},
  sectionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionDate: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text3, textTransform: 'uppercase', letterSpacing: 0.5},
  dayTotals: {flexDirection: 'row', gap: 10},
  dayIn: {fontFamily: FONTS.semibold, fontSize: 12, color: T.income},
  dayOut: {fontFamily: FONTS.semibold, fontSize: 12, color: T.expense},
  empty: {alignItems: 'center', paddingTop: 40, gap: 8},
  emptyText: {fontFamily: FONTS.regular, fontSize: 14, color: T.text3},
  notFound: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  notFoundText: {fontFamily: FONTS.regular, fontSize: 14, color: T.text2},
});
