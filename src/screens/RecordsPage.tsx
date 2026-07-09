import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
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
import {CatChip, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {
  CATS,
  CategoryId,
  FONTS,
  R,
  T,
  accountIcon,
  accountTint,
  fmtAmount,
  resolveCat,
} from '../theme';

const SOURCE_LABEL: Record<string, string> = {
  sms: 'From SMS',
  ai: 'AI added',
  manual: 'Manual entry',
};

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

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function TxDetail({
  tx,
  accounts,
  onSave,
  onDelete,
  onClose,
}: {
  tx: any;
  accounts: any[];
  onSave: (updated: any) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(tx.amount ?? 0)));
  const [category, setCategory] = useState<CategoryId>(resolveCat(tx.category ?? ''));
  const [accountId, setAccountId] = useState<string>(tx.account_id ?? '');
  const [merchant, setMerchant] = useState<string>(tx.merchant || tx.payee || '');
  const [note, setNote] = useState<string>(tx.note || '');
  const [busy, setBusy] = useState(false);

  const catId = resolveCat(tx.category ?? '');
  const cat = CATS[catId];
  const isIncome = tx.transaction_type === 'income';
  const dateStr = tx.date_time ? format(new Date(tx.date_time), 'MMM d, yyyy  ·  HH:mm') : '—';
  const conf = tx.confidence != null && tx.confidence < 1 ? ` · ${Math.round(tx.confidence * 100)}%` : '';
  const sourceStr = (SOURCE_LABEL[tx.source] ?? 'Manual entry') + conf;

  const save = async () => {
    const amt = Math.abs(parseInt(amount, 10) || 0);
    if (amt <= 0) {
      return;
    }
    setBusy(true);
    await onSave({
      id: tx.id,
      transaction_type: tx.transaction_type,
      orig_amount: tx.amount ?? 0,
      orig_account_id: tx.account_id,
      amount: amt,
      account_id: accountId || tx.account_id,
      category: CATS[category]?.label ?? category,
      merchant,
      note,
    });
    setBusy(false);
  };

  if (editing) {
    return (
      <BottomSheetScrollView contentContainerStyle={styles.editWrap}>
        <Text style={styles.editTitle}>Edit transaction</Text>

        <Text style={styles.editLabel}>Amount (RWF)</Text>
        <BottomSheetTextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          style={styles.editInput}
          placeholderTextColor={T.text3}
        />

        <Text style={styles.editLabel}>Merchant / payee</Text>
        <BottomSheetTextInput
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Who"
          style={styles.editInput}
          placeholderTextColor={T.text3}
        />

        <Text style={styles.editLabel}>Category</Text>
        <BottomSheetScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {(Object.values(CATS) as {id: CategoryId; label: string; color: string}[]).map(c => {
            const on = category === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={[styles.pickChip, on && {borderColor: c.color, backgroundColor: c.color + '18'}]}>
                <CatChip cat={c.id} size={26} />
                <Text style={[styles.pickChipText, on && {color: T.text}]} numberOfLines={1}>{c.label}</Text>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>

        {accounts.length > 0 && (
          <>
            <Text style={styles.editLabel}>Account</Text>
            <BottomSheetScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {accounts.map(a => {
                const on = (accountId || tx.account_id) === a.id;
                const tint = accountTint(a.name ?? '');
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAccountId(a.id)}
                    style={[styles.pickChip, on && {borderColor: tint, backgroundColor: tint + '18'}]}>
                    <Icon name={accountIcon(a.name ?? '', a.type ?? '')} size={14} color={tint} strokeWidth={2} />
                    <Text style={[styles.pickChipText, on && {color: T.text}]} numberOfLines={1}>{a.name}</Text>
                  </Pressable>
                );
              })}
            </BottomSheetScrollView>
          </>
        )}

        <Text style={styles.editLabel}>Note</Text>
        <BottomSheetTextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional"
          style={styles.editInput}
          placeholderTextColor={T.text3}
        />

        <View style={styles.detailBtns}>
          <Pressable
            onPress={() => setEditing(false)}
            style={({pressed}) => [styles.closeBtn, {opacity: pressed ? 0.7 : 1}]}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={busy}
            style={({pressed}) => [styles.saveBtn, {opacity: busy ? 0.5 : pressed ? 0.85 : 1}]}>
            <Icon name="Check" size={16} color={T.accentInk} strokeWidth={2.5} />
            <Text style={styles.saveBtnText}>{busy ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </BottomSheetScrollView>
    );
  }

  return (
    <BottomSheetScrollView contentContainerStyle={styles.detail}>
      <View style={styles.detailTop}>
        <View style={[styles.detailIcon, {backgroundColor: cat.color + '22'}]}>
          <Icon name={cat.icon} size={22} color={cat.color} strokeWidth={2} />
        </View>
        <Text style={[styles.detailAmount, {color: isIncome ? T.income : T.expense}]}>
          {isIncome ? '+' : '-'}RWF {fmtAmount(tx.amount ?? 0)}
        </Text>
        <Text style={styles.detailLabel}>{tx.merchant || tx.payee || cat.label}</Text>
      </View>

      <View style={styles.infoCard}>
        <InfoRow label="Category" value={cat.label} />
        <View style={styles.infoDivider} />
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

      <View style={styles.detailBtns}>
        <Pressable
          onPress={() => setEditing(true)}
          style={({pressed}) => [styles.editBtn, {opacity: pressed ? 0.8 : 1}]}>
          <Icon name="Pencil" size={15} color={T.accent} strokeWidth={2.2} />
          <Text style={styles.editBtnText}>Edit</Text>
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
  {key: 'ai', label: 'AI-tagged'},
];

export default function RecordsPage({navigation, route}: any) {
  const {userId} = useCurrentUser();
  const db = usePowerSync();

  const {data: txns} = useQuery(
    'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.owner_id = ? ORDER BY t.date_time DESC',
    [userId ?? ''],
  );

  const {data: accounts} = useQuery(
    'SELECT id, name, type FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  const tabBarHeight = useBottomTabBarHeight();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<any>(null);
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
    const sign = selected.transaction_type === 'income' ? 1 : -1;
    if (selected.account_id) {
      await db.execute(
        'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
        [sign * (selected.amount ?? 0), selected.account_id],
      );
    }
    await db.execute('DELETE FROM transactions WHERE id = ?', [selected.id]);
    sheetRef.current?.close();
    setSelected(null);
  }, [db, selected]);

  const saveEdit = useCallback(
    async (u: any) => {
      const sign = u.transaction_type === 'income' ? 1 : -1;
      // revert original effect from the original account
      if (u.orig_account_id) {
        await db.execute(
          'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
          [sign * (u.orig_amount ?? 0), u.orig_account_id],
        );
      }
      // apply new effect to the (possibly new) account
      if (u.account_id) {
        await db.execute(
          'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
          [sign * u.amount, u.account_id],
        );
      }
      await db.execute(
        'UPDATE transactions SET amount = ?, account_id = ?, category = ?, merchant = ?, note = ? WHERE id = ?',
        [u.amount, u.account_id, u.category, u.merchant, u.note, u.id],
      );
      sheetRef.current?.close();
      setSelected(null);
    },
    [db],
  );

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
            accounts={accounts as any[]}
            onSave={saveEdit}
            onDelete={deleteSelected}
            onClose={() => sheetRef.current?.close()}
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
