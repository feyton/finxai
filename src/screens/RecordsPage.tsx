import TransactionDetailSheet, {
  TransactionDetailSheetHandle,
} from '../Components/TransactionDetailSheet';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {TxRow} from '../Components/TxRow';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, fmtAmount} from '../theme';

type FilterType = 'all' | 'income' | 'expense' | 'transfer' | 'ai';

const FILTERS: {key: FilterType; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'expense', label: 'Spending'},
  {key: 'income', label: 'Income'},
  {key: 'transfer', label: 'Transfers'},
  {key: 'ai', label: 'AI-tagged'},
];

function dayLabel(dt: string): string {
  const date = new Date(dt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {return 'Today';}
  if (date.toDateString() === yesterday.toDateString()) {return 'Yesterday';}
  return format(date, 'MMM d, yyyy');
}

export default function RecordsPage({navigation, route}: any) {
  const {userId} = useCurrentUser();

  const {data: txns} = useQuery(
    'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.owner_id = ? ORDER BY t.date_time DESC',
    [userId ?? ''],
  );

  const tabBarHeight = useBottomTabBarHeight();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const sheetRef = useRef<TransactionDetailSheetHandle>(null);

  const monthTotals = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const startIso = start.toISOString();
    let moneyIn = 0;
    let moneyOut = 0;
    for (const t of txns as any[]) {
      if ((t.date_time ?? '') < startIso) {
        continue;
      }
      if (t.transaction_type === 'income') {
        moneyIn += t.amount ?? 0;
      } else if (t.transaction_type === 'expense') {
        moneyOut += t.amount ?? 0; // transfers are net-zero — excluded
      }
    }
    return {moneyIn, moneyOut};
  }, [txns]);

  // flatList = the filtered rows in display order — powers prev/next
  // navigation in the detail sheet.
  const {sections, flatList} = useMemo(() => {
    let list = txns as any[];
    if (filter === 'ai') {
      list = list.filter(t => t.source === 'sms' || t.source === 'ai');
    } else if (filter !== 'all') {
      list = list.filter(t => t.transaction_type === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        t =>
          (t.merchant || t.payee || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q),
      );
    }

    const groups: Record<string, any[]> = {};
    for (const t of list) {
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
        .filter(t => t.transaction_type === 'expense')
        .reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    }));
    return {sections: secs, flatList: list};
  }, [txns, filter, search]);

  const openDetail = useCallback((tx: any) => {
    sheetRef.current?.open(tx);
  }, []);

  // Deeplink: open a transaction's detail when navigated with openTxId
  // (e.g. tapping a recent transaction on the Home landing page).
  useEffect(() => {
    const id = route?.params?.openTxId;
    if (!id) {
      return;
    }
    const tx = (txns as any[]).find(t => t.id === id);
    if (!tx) {
      return; // txns not loaded yet — effect re-runs when it is
    }
    // Delay the open: on first navigation into this tab the sheet may not be
    // laid out yet, so an immediate snapToIndex gets dropped.
    const t = setTimeout(() => sheetRef.current?.open(tx), 150);
    navigation.setParams({openTxId: undefined}); // consume it (only after we found the tx)
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.openTxId, txns]);

  const renderItem = useCallback(
    ({item}: {item: any}) => <TxRow tx={item} onPress={() => openDetail(item)} />,
    [openDetail],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Records</Text>
        <View style={{flexDirection: 'row', gap: 8}}>
          <Pressable
            onPress={() => navigation.navigate('CategoryStats')}
            style={({pressed}) => [styles.statsBtn, {opacity: pressed ? 0.7 : 1}]}>
            <Icon name="PieChart" size={17} color={T.accent} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('CreateRecord')}
            style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
            <Icon name="Plus" size={18} color={T.accentInk} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      {/* Money in / out summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHead}>
            <Icon name="ArrowDownLeft" size={14} color={T.income} strokeWidth={2.2} />
            <Text style={styles.summaryLabel}>Money in</Text>
          </View>
          <Text style={[styles.summaryValue, {color: T.income}]}>
            {fmtAmount(monthTotals.moneyIn)}
            <Text style={styles.summaryUnit}> RWF</Text>
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHead}>
            <Icon name="ArrowUpRight" size={14} color={T.expense} strokeWidth={2.2} />
            <Text style={styles.summaryLabel}>Money out</Text>
          </View>
          <Text style={[styles.summaryValue, {color: T.expense}]}>
            {fmtAmount(monthTotals.moneyOut)}
            <Text style={styles.summaryUnit}> RWF</Text>
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Icon name="Search" size={16} color={T.text3} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search transactions..."
          placeholderTextColor={T.text3}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Icon name="X" size={16} color={T.text3} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {/* Filter chips — horizontally scrollable so more filters never wrap/clip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}>
            <Text
              style={[
                styles.chipText,
                filter === f.key && styles.chipTextActive,
              ]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Transaction list */}
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="Receipt" size={42} color={T.text3} strokeWidth={1.4} />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptyHint}>Add one with the + button above</Text>
          </View>
        }
        contentContainerStyle={[styles.list, {paddingBottom: tabBarHeight + 28}]}
        stickySectionHeadersEnabled={false}
      />

      {/* Transaction detail sheet */}
      <TransactionDetailSheet ref={sheetRef} navigation={navigation} flatList={flatList} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {fontFamily: FONTS.bold, fontSize: 20, color: T.text},
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 12,
    gap: 4,
  },
  summaryHead: {flexDirection: 'row', alignItems: 'center', gap: 6},
  summaryLabel: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  summaryValue: {fontFamily: FONTS.bold, fontSize: 17},
  summaryUnit: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text3},
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: T.surface2,
    borderRadius: R.small,
    borderWidth: 1,
    borderColor: T.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: T.text,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipActive: {backgroundColor: T.accentSoft, borderColor: T.accent},
  chipText: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.text2},
  chipTextActive: {color: T.accent},
  list: {paddingBottom: 100},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionDate: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text3, textTransform: 'uppercase', letterSpacing: 0.5},
  dayTotals: {flexDirection: 'row', gap: 10},
  dayIn: {fontFamily: FONTS.semibold, fontSize: 12, color: T.income},
  dayOut: {fontFamily: FONTS.semibold, fontSize: 12, color: T.expense},
  empty: {alignItems: 'center', paddingTop: 80, gap: 8},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 15, color: T.text2, marginTop: 4},
  emptyHint: {fontFamily: FONTS.regular, fontSize: 13, color: T.text3},
});
