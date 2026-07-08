import BottomSheet, {BottomSheetView} from '@gorhom/bottom-sheet';
import {useQuery, usePowerSync} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Pressable,
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
import {CATS, FONTS, R, T, fmtAmount, resolveCat} from '../theme';

type FilterType = 'all' | 'income' | 'expense' | 'ai';

function dayLabel(dt: string): string {
  const date = new Date(dt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {return 'Today';}
  if (date.toDateString() === yesterday.toDateString()) {return 'Yesterday';}
  return format(date, 'MMM d, yyyy');
}

function TxDetail({
  tx,
  onDelete,
  onClose,
}: {
  tx: any;
  onDelete: () => void;
  onClose: () => void;
}) {
  const cat = CATS[resolveCat(tx.category ?? '')];
  const isIncome = tx.transaction_type === 'income';
  const dateStr = tx.date_time
    ? format(new Date(tx.date_time), 'MMM d, yyyy  HH:mm')
    : '';

  return (
    <View style={styles.detail}>
      <View style={styles.detailTop}>
        <View style={[styles.detailIcon, {backgroundColor: cat.color + '22'}]}>
          <Icon name={cat.icon} size={22} color={cat.color} strokeWidth={2} />
        </View>
        <Text style={[styles.detailAmount, {color: isIncome ? T.income : T.expense}]}>
          {isIncome ? '+' : '-'}RWF {fmtAmount(tx.amount ?? 0)}
        </Text>
        <Text style={styles.detailLabel}>
          {tx.merchant || tx.payee || tx.category || '—'}
        </Text>
        <Text style={styles.detailSub}>
          {cat.label}{'  ·  '}{dateStr}
        </Text>
        {tx.account_name ? (
          <Text style={styles.detailSub}>{tx.account_name}</Text>
        ) : null}
        {tx.note ? (
          <Text style={styles.detailNote}>{tx.note}</Text>
        ) : null}
      </View>
      <View style={styles.detailBtns}>
        <Pressable
          onPress={onDelete}
          style={({pressed}) => [styles.deleteBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Trash2" size={16} color={T.expense} strokeWidth={2} />
          <Text style={styles.deleteBtnText}>Delete</Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          style={({pressed}) => [styles.closeBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const FILTERS: {key: FilterType; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'expense', label: 'Spending'},
  {key: 'income', label: 'Income'},
  {key: 'ai', label: 'AI-tagged'},
];

export default function RecordsPage({navigation}: any) {
  const {userId} = useCurrentUser();
  const db = usePowerSync();

  const {data: txns} = useQuery(
    'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.owner_id = ? ORDER BY t.date_time DESC',
    [userId ?? ''],
  );

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<any>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['45%', '75%'], []);

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
      } else {
        moneyOut += t.amount ?? 0;
      }
    }
    return {moneyIn, moneyOut};
  }, [txns]);

  const sections = useMemo(() => {
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

    return Object.entries(groups).map(([title, data]) => ({
      title,
      data,
      dayIncome: data
        .filter(t => t.transaction_type === 'income')
        .reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
      dayExpense: data
        .filter(t => t.transaction_type !== 'income')
        .reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    }));
  }, [txns, filter, search]);

  const openDetail = (tx: any) => {
    setSelected(tx);
    sheetRef.current?.snapToIndex(0);
  };

  const deleteSelected = useCallback(async () => {
    if (!selected) {return;}
    await db.execute('DELETE FROM transactions WHERE id = ?', [selected.id]);
    sheetRef.current?.close();
    setSelected(null);
  }, [db, selected]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Records</Text>
        <Pressable
          onPress={() => navigation.navigate('CreateRecord')}
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Plus" size={18} color={T.accentInk} strokeWidth={2.5} />
        </Pressable>
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

      {/* Filter chips */}
      <View style={styles.filterRow}>
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
      </View>

      {/* Transaction list */}
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={({item}) => <TxRow tx={item} onPress={() => openDetail(item)} />}
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
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
      />

      {/* Transaction detail sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
        onChange={i => {
          if (i === -1) {setSelected(null);}
        }}>
        <BottomSheetView style={styles.sheetWrap}>
          {selected && (
            <TxDetail
              tx={selected}
              onDelete={deleteSelected}
              onClose={() => sheetRef.current?.close()}
            />
          )}
        </BottomSheetView>
      </BottomSheet>
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
  sheetBg: {backgroundColor: T.surface},
  handle: {backgroundColor: T.border2},
  sheetWrap: {flex: 1},
  detail: {flex: 1, paddingHorizontal: 20, paddingBottom: 20, justifyContent: 'space-between'},
  detailTop: {alignItems: 'center', paddingVertical: 16, gap: 4},
  detailIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  detailAmount: {fontFamily: FONTS.bold, fontSize: 26},
  detailLabel: {fontFamily: FONTS.semibold, fontSize: 15.5, color: T.text, marginTop: 2},
  detailSub: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text3, marginTop: 1},
  detailNote: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: T.text2,
    backgroundColor: T.surface2,
    borderRadius: R.small,
    padding: 10,
    marginTop: 10,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  detailBtns: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: R.card,
    backgroundColor: 'rgba(251,113,133,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.2)',
  },
  deleteBtnText: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.expense},
  closeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: R.card,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  closeBtnText: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text2},
});
