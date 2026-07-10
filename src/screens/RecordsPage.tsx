import BottomSheet, {BottomSheetScrollView} from '@gorhom/bottom-sheet';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useQuery, usePowerSync} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import {
  CATS,
  FONTS,
  R,
  T,
  fmtAmount,
  resolveCat,
} from '../theme';

const SOURCE_LABEL: Record<string, string> = {
  sms: 'From SMS',
  ai: 'AI added',
  manual: 'Manual entry',
};

type FilterType = 'all' | 'income' | 'expense' | 'transfer' | 'ai';

function dayLabel(dt: string): string {
  const date = new Date(dt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {return 'Today';}
  if (date.toDateString() === yesterday.toDateString()) {return 'Yesterday';}
  return format(date, 'MMM d, yyyy');
}

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// View-only detail — editing/splitting live on the EditTransaction screen
// (horizontal chip rows inside the bottom sheet fought its pan gestures).
function TxDetail({
  tx,
  splits,
  onEdit,
  onDelete,
}: {
  tx: any;
  splits: any[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const catId = resolveCat(tx.category ?? '');
  const cat = CATS[catId];
  const isIncome = tx.transaction_type === 'income';
  const isTransfer = tx.transaction_type === 'transfer';
  const dateStr = tx.date_time ? format(new Date(tx.date_time), 'MMM d, yyyy  ·  HH:mm') : '—';
  const conf = tx.confidence != null && tx.confidence < 1 ? ` · ${Math.round(tx.confidence * 100)}%` : '';
  const sourceStr = (SOURCE_LABEL[tx.source] ?? 'Manual entry') + conf;

  return (
    <BottomSheetScrollView contentContainerStyle={styles.detail}>
      <View style={styles.detailTop}>
        <View style={[styles.detailIcon, {backgroundColor: (isTransfer ? T.info : cat.color) + '22'}]}>
          <Icon
            name={isTransfer ? 'ArrowLeftRight' : cat.icon}
            size={22}
            color={isTransfer ? T.info : cat.color}
            strokeWidth={2}
          />
        </View>
        <Text
          style={[
            styles.detailAmount,
            {color: isTransfer ? T.text : isIncome ? T.income : T.expense},
          ]}>
          {isTransfer ? '' : isIncome ? '+' : '-'}RWF {fmtAmount(tx.amount ?? 0)}
        </Text>
        <Text style={styles.detailLabel}>{tx.merchant || tx.payee || cat.label}</Text>
        {isTransfer && (
          <Text style={styles.detailSub}>Transfer between your accounts</Text>
        )}
      </View>

      <View style={styles.infoCard}>
        {!isTransfer && (
          <>
            <InfoRow
              label="Category"
              value={cat.label + (tx.subcategory ? ` · ${tx.subcategory}` : '')}
            />
            <View style={styles.infoDivider} />
          </>
        )}
        <InfoRow label="Account" value={tx.account_name ?? '—'} />
        <View style={styles.infoDivider} />
        <InfoRow label="When" value={dateStr} />
        <View style={styles.infoDivider} />
        <InfoRow label="Source" value={sourceStr} />
        {tx.fees > 0 && (
          <>
            <View style={styles.infoDivider} />
            <InfoRow label="Fee" value={`RWF ${fmtAmount(tx.fees)}`} />
          </>
        )}
        {tx.note ? (
          <>
            <View style={styles.infoDivider} />
            <InfoRow label="Note" value={tx.note} />
          </>
        ) : null}
      </View>

      {splits.length > 0 && (
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Split into</Text>
          </View>
          {splits.map((s: any) => {
            const sc = CATS[resolveCat(s.category ?? '')];
            return (
              <View key={s.id} style={styles.infoRow}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <View style={[styles.splitDot, {backgroundColor: sc.color}]} />
                  <Text style={styles.infoValue}>{sc.label}</Text>
                </View>
                <Text style={styles.infoValue}>RWF {fmtAmount(s.amount ?? 0)}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.detailBtns}>
        <Pressable
          onPress={onEdit}
          style={({pressed}) => [styles.editBtn, {opacity: pressed ? 0.8 : 1}]}>
          <Icon name="Pencil" size={15} color={T.accent} strokeWidth={2.2} />
          <Text style={styles.editBtnText}>
            {isTransfer ? 'Edit' : 'Edit / Split'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={({pressed}) => [styles.deleteBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Trash2" size={16} color={T.expense} strokeWidth={2} />
          <Text style={styles.deleteBtnText}>Delete</Text>
        </Pressable>
      </View>
    </BottomSheetScrollView>
  );
}

const FILTERS: {key: FilterType; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'expense', label: 'Spending'},
  {key: 'income', label: 'Income'},
  {key: 'transfer', label: 'Transfers'},
  {key: 'ai', label: 'AI-tagged'},
];

// Balance-movement sign of a transaction as it was originally recorded.
// Changing the TYPE re-classifies the record; it does not move money again.
function movementSign(txType: string, transferDirection?: string | null): number {
  if (txType === 'income') {
    return 1;
  }
  if (txType === 'transfer') {
    return transferDirection === 'in' ? 1 : -1;
  }
  return -1;
}

export default function RecordsPage({navigation, route}: any) {
  const {userId} = useCurrentUser();
  const db = usePowerSync();

  const {data: txns} = useQuery(
    'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.owner_id = ? ORDER BY t.date_time DESC',
    [userId ?? ''],
  );

  const tabBarHeight = useBottomTabBarHeight();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<any>(null);

  const {data: selectedSplits} = useQuery(
    'SELECT * FROM split_details WHERE transaction_id = ?',
    [selected?.id ?? ''],
  );
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['60%', '92%'], []);

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
        .filter(t => t.transaction_type === 'expense')
        .reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
    }));
  }, [txns, filter, search]);

  const openDetail = (tx: any) => {
    setSelected(tx);
    sheetRef.current?.snapToIndex(0);
  };

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
    setSelected(tx);
    // Delay the snap: on first navigation into this tab the sheet may not be
    // laid out yet, so an immediate snapToIndex gets dropped.
    const t = setTimeout(() => sheetRef.current?.snapToIndex(0), 150);
    navigation.setParams({openTxId: undefined}); // consume it (only after we found the tx)
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.openTxId, txns]);

  const deleteSelected = useCallback(async () => {
    if (!selected) {return;}
    // reverse the transaction's effect on its account balance
    const sign = movementSign(selected.transaction_type, selected.transfer_direction);
    if (selected.account_id) {
      await db.execute(
        'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
        [sign * (selected.amount ?? 0), selected.account_id],
      );
    }
    await db.execute('DELETE FROM split_details WHERE transaction_id = ?', [selected.id]);
    await db.execute('DELETE FROM transactions WHERE id = ?', [selected.id]);
    sheetRef.current?.close();
    setSelected(null);
  }, [db, selected]);

  // Editing/splitting happen on the EditTransaction screen — the bottom
  // sheet's pan gestures made in-sheet chip rows a hit-or-miss experience.
  const editSelected = useCallback(() => {
    if (!selected) {return;}
    const id = selected.id;
    sheetRef.current?.close();
    setSelected(null);
    navigation.navigate('EditTransaction', {txId: id});
  }, [navigation, selected]);

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
        contentContainerStyle={[styles.list, {paddingBottom: tabBarHeight + 28}]}
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
        {selected && (
          <TxDetail
            key={selected.id}
            tx={selected}
            splits={(selectedSplits as any[]) ?? []}
            onEdit={editSelected}
            onDelete={deleteSelected}
          />
        )}
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
  detail: {paddingHorizontal: 20, paddingBottom: 28},
  detailTop: {alignItems: 'center', paddingVertical: 8, gap: 4},
  infoCard: {
    backgroundColor: T.surface2,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  infoLabel: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2},
  infoValue: {fontFamily: FONTS.medium, fontSize: 13, color: T.text, flexShrink: 1, textAlign: 'right'},
  infoDivider: {height: 1, backgroundColor: T.border},
  editWrap: {paddingHorizontal: 20, paddingBottom: 28},
  editTitle: {fontFamily: FONTS.bold, fontSize: 16, color: T.text, textAlign: 'center', paddingVertical: 6},
  editLabel: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2, marginTop: 14, marginBottom: 7},
  editInput: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: T.text,
  },
  chipRow: {gap: 8, paddingVertical: 2, paddingRight: 8},
  typeRow: {flexDirection: 'row', gap: 8},
  typeChoice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  typeChoiceActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.35)'},
  typeChoiceText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2},
  typeHint: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, marginTop: 8, lineHeight: 16},
  splitHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: T.text2,
    textAlign: 'center',
    lineHeight: 17,
    paddingBottom: 10,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.surface2,
    borderRadius: R.small,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
  },
  splitRowLabel: {flex: 1, fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text},
  splitRowAmt: {fontFamily: FONTS.bold, fontSize: 12.5, color: T.text},
  splitRemaining: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 6,
  },
  splitAdderRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10},
  splitAddBtn: {
    width: 42,
    height: 42,
    borderRadius: R.small,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitDot: {width: 8, height: 8, borderRadius: 4},
  pickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  pickChipText: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text3, maxWidth: 110},
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: R.card,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  editBtnText: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.accent},
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: R.card,
    backgroundColor: T.accent,
  },
  saveBtnText: {fontFamily: FONTS.bold, fontSize: 13.5, color: T.accentInk},
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
