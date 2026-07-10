import {usePowerSync, useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useMemo, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CatChip, Icon, Progress} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, CategoryId, FONTS, R, T, fmtAmount, resolveCat} from '../theme';
import {computeBudgetSpend} from './BudgetScreen';

const EVENT_LABEL: Record<string, string> = {
  category: 'Category budget',
  shared: 'Shared budget',
  party: 'Party / event',
};

function fmtDay(dt?: string): string {
  return dt ? format(new Date(dt), 'MMM d') : '—';
}

// Attribute an expense row to the best-matching budget item: same category,
// preferring an exact subcategory match, then the item without a subcategory.
function matchItem(items: any[], category: string, subcategory?: string | null) {
  const cat = resolveCat(category ?? '');
  const candidates = items.filter(it => resolveCat(it.category ?? '') === cat);
  if (candidates.length === 0) {
    return null;
  }
  if (subcategory) {
    const exact = candidates.find(it => it.subcategory === subcategory);
    if (exact) {
      return exact;
    }
  }
  return candidates.find(it => !it.subcategory) ?? candidates[0];
}

export default function BudgetDetails({route, navigation}: any) {
  const {budgetId} = route.params;
  const {userId} = useCurrentUser();
  const db = usePowerSync();

  const [claimOpen, setClaimOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const {data: budgets} = useQuery(
    'SELECT * FROM budgets WHERE id = ? AND owner_id = ?',
    [budgetId, userId ?? ''],
  );
  const {data: items} = useQuery(
    'SELECT * FROM budget_items WHERE budget_id = ? AND owner_id = ?',
    [budgetId, userId ?? ''],
  );
  // Split-aware effective rows (splits replace the parent's category).
  const {data: effRows} = useQuery(
    `SELECT t.id, t.budget_id, t.date_time, t.transaction_type,
            COALESCE(s.category, t.category) AS category,
            COALESCE(s.subcategory, t.subcategory) AS subcategory,
            COALESCE(s.amount, t.amount) AS amount
     FROM transactions t
     LEFT JOIN split_details s ON s.transaction_id = t.id
     WHERE t.owner_id = ? AND t.transaction_type IN ('expense','income')
       AND t.date_time >= ?`,
    [userId ?? '', new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString()],
  );
  const {data: claimedTxns} = useQuery(
    `SELECT t.*, a.name as account_name FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.budget_id = ? AND t.owner_id = ?
     ORDER BY t.date_time DESC`,
    [budgetId, userId ?? ''],
  );
  const {data: candidates} = useQuery(
    `SELECT t.*, a.name as account_name FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.owner_id = ? AND t.budget_id IS NULL
       AND t.transaction_type != 'transfer' AND t.date_time >= ?
     ORDER BY t.date_time DESC LIMIT 200`,
    [userId ?? '', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()],
  );

  const budget = (budgets as any[])?.[0];
  const itemList = items as any[];

  const summary = useMemo(() => {
    if (!budget) {
      return null;
    }
    const spend = computeBudgetSpend(budget, itemList, effRows as any[]);
    const planned = itemList.reduce((s, it) => s + (it.amount ?? 0), 0);

    // Per-item spend attribution over claimed + auto-matched rows
    const perItem = new Map<string, number>();
    let otherClaimed = 0;
    for (const r of effRows as any[]) {
      const isClaimed = r.budget_id === budget.id;
      const inWindow =
        (r.date_time ?? '') >= spend.winStart && (r.date_time ?? '') <= spend.winEnd;
      const isAuto =
        spend.isCategoryBudget && !r.budget_id && inWindow;
      if (r.transaction_type !== 'expense' || (!isClaimed && !isAuto)) {
        continue;
      }
      const item = matchItem(itemList, r.category, r.subcategory);
      if (item) {
        perItem.set(item.id, (perItem.get(item.id) ?? 0) + (r.amount ?? 0));
      } else if (isClaimed) {
        // claimed spending whose category has no planned item
        otherClaimed += r.amount ?? 0;
      }
    }
    return {...spend, planned, perItem, otherClaimed};
  }, [budget, itemList, effRows]);

  const claimSelected = async () => {
    for (const id of picked) {
      await db.execute('UPDATE transactions SET budget_id = ? WHERE id = ?', [
        budgetId,
        id,
      ]);
    }
    setPicked(new Set());
    setClaimOpen(false);
  };

  const unclaim = async (txId: string) => {
    await db.execute('UPDATE transactions SET budget_id = NULL WHERE id = ?', [txId]);
  };

  const deleteBudget = () => {
    Alert.alert(
      'Delete budget?',
      'Claimed transactions stay in your records — they are just unlinked.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await db.execute(
              'UPDATE transactions SET budget_id = NULL WHERE budget_id = ?',
              [budgetId],
            );
            await db.execute('DELETE FROM budget_items WHERE budget_id = ?', [budgetId]);
            await db.execute('DELETE FROM budgets WHERE id = ?', [budgetId]);
            navigation.goBack();
          },
        },
      ],
    );
  };

  if (!budget || !summary) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Budget not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pct = summary.planned > 0 ? Math.round((summary.spent / summary.planned) * 100) : 0;
  const over = summary.planned > 0 && summary.spent > summary.planned;
  const claimed = claimedTxns as any[];
  const contributionsList = claimed.filter(t => t.transaction_type === 'income');

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
          <Text style={styles.headerTitle} numberOfLines={1}>{budget.name}</Text>
          <Text style={styles.headerSub}>
            {EVENT_LABEL[budget.event ?? 'category'] ?? 'Budget'}
            {' · '}
            {budget.recurring
              ? `resets ${budget.period ?? 'monthly'}`
              : `${fmtDay(budget.start_date)} – ${fmtDay(budget.end_date)}`}
          </Text>
        </View>
        <Pressable
          onPress={deleteBudget}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Trash2" size={16} color={T.expense} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={styles.summaryCard}>
          <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
            <Text style={[styles.spentBig, over && {color: T.expense}]}>
              {fmtAmount(summary.spent)}
            </Text>
            <Text style={styles.plannedSmall}>/ {fmtAmount(summary.planned)} RWF</Text>
            <View style={{flex: 1}} />
            <Text style={[styles.pctText, {color: over ? T.expense : pct > 85 ? T.warn : T.text2}]}>
              {pct}%
            </Text>
          </View>
          <Progress value={summary.spent} max={Math.max(summary.planned, 1)} color={over ? T.expense : T.accent} />
          <View style={styles.summaryFoot}>
            <Text style={styles.mutedSmall}>
              {over
                ? `${fmtAmount(summary.spent - summary.planned)} RWF over budget`
                : `${fmtAmount(summary.planned - summary.spent)} RWF left`}
            </Text>
            {summary.contributions > 0 && (
              <Text style={styles.contribText}>
                +{fmtAmount(summary.contributions)} RWF contributed
              </Text>
            )}
          </View>
        </View>

        {/* Items with per-category spending */}
        <Text style={styles.sectionLabel}>Planned items</Text>
        <View style={{gap: 8}}>
          {itemList.map(it => {
            const catId = resolveCat(it.category ?? '') as CategoryId;
            const spent = summary.perItem.get(it.id) ?? 0;
            const itemOver = (it.amount ?? 0) > 0 && spent > it.amount;
            return (
              <View key={it.id} style={styles.itemCard}>
                <View style={styles.itemHead}>
                  <CatChip cat={catId} size={32} />
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {it.name || it.subcategory || CATS[catId].label}
                    </Text>
                    <Text style={styles.mutedSmall} numberOfLines={1}>
                      {CATS[catId].label}
                      {it.subcategory ? ` · ${it.subcategory}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.itemAmt, itemOver && {color: T.expense}]}>
                    {fmtAmount(spent)}
                    <Text style={styles.mutedSmall}> / {fmtAmount(it.amount ?? 0)}</Text>
                  </Text>
                </View>
                <Progress
                  value={spent}
                  max={Math.max(it.amount ?? 0, 1)}
                  color={itemOver ? T.expense : CATS[catId].color}
                />
              </View>
            );
          })}
          {summary.otherClaimed > 0 && (
            <View style={styles.itemCard}>
              <View style={styles.itemHead}>
                <View style={styles.otherIcon}>
                  <Icon name="Tag" size={15} color={T.text2} strokeWidth={2} />
                </View>
                <Text style={[styles.itemName, {flex: 1}]}>Other claimed spending</Text>
                <Text style={styles.itemAmt}>{fmtAmount(summary.otherClaimed)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Claimed transactions */}
        <View style={styles.claimHead}>
          <Text style={styles.sectionLabel}>Claimed transactions</Text>
          <Pressable
            onPress={() => setClaimOpen(true)}
            style={({pressed}) => [styles.claimBtn, {opacity: pressed ? 0.8 : 1}]}>
            <Icon name="Plus" size={13} color={T.accent} strokeWidth={2.6} />
            <Text style={styles.claimBtnText}>Claim</Text>
          </Pressable>
        </View>
        <View style={{gap: 6}}>
          {claimed.length === 0 && (
            <Text style={styles.emptyHint}>
              Nothing claimed yet — pull in the expenses (and contributions
              people sent you) that belong to this budget.
            </Text>
          )}
          {claimed.map(t => {
            const isIncome = t.transaction_type === 'income';
            const catId = resolveCat(t.category ?? '');
            return (
              <View key={t.id} style={styles.txRow}>
                <CatChip cat={catId} size={30} />
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.txLabel} numberOfLines={1}>
                    {t.merchant || t.payee || CATS[catId].label}
                  </Text>
                  <Text style={styles.mutedSmall}>
                    {[t.account_name, fmtDay(t.date_time)].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
                <Text style={[styles.txAmt, {color: isIncome ? T.income : T.expense}]}>
                  {isIncome ? '+' : '-'}
                  {fmtAmount(t.amount ?? 0)}
                </Text>
                <Pressable onPress={() => unclaim(t.id)} hitSlop={8}>
                  <Icon name="X" size={15} color={T.text3} strokeWidth={2.2} />
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Contributions summary */}
        {contributionsList.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Contributions</Text>
            <View style={styles.contribCard}>
              <Icon name="Gift" size={17} color={T.income} strokeWidth={2} />
              <Text style={styles.contribCardText}>
                {contributionsList.length} contribution
                {contributionsList.length === 1 ? '' : 's'} received
              </Text>
              <Text style={[styles.txAmt, {color: T.income}]}>
                +{fmtAmount(summary.contributions)} RWF
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Claim modal */}
      <Modal
        visible={claimOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setClaimOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setClaimOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Claim transactions</Text>
          <Text style={styles.sheetHint}>
            Link records to “{budget.name}” — incoming money counts as a
            contribution, spending counts against the plan.
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{paddingHorizontal: 16}}>
            {(candidates as any[]).length === 0 && (
              <Text style={[styles.emptyHint, {paddingVertical: 20}]}>
                No unclaimed transactions in the last 90 days.
              </Text>
            )}
            {(candidates as any[]).map(t => {
              const on = picked.has(t.id);
              const isIncome = t.transaction_type === 'income';
              const catId = resolveCat(t.category ?? '');
              return (
                <Pressable
                  key={t.id}
                  onPress={() =>
                    setPicked(prev => {
                      const next = new Set(prev);
                      if (next.has(t.id)) {
                        next.delete(t.id);
                      } else {
                        next.add(t.id);
                      }
                      return next;
                    })
                  }
                  style={[styles.candRow, on && styles.candRowOn]}>
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Icon name="Check" size={12} color={T.accentInk} strokeWidth={3} />}
                  </View>
                  <CatChip cat={catId} size={28} />
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={styles.txLabel} numberOfLines={1}>
                      {t.merchant || t.payee || CATS[catId].label}
                    </Text>
                    <Text style={styles.mutedSmall}>
                      {[t.account_name, fmtDay(t.date_time)].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                  <Text style={[styles.txAmt, {color: isIncome ? T.income : T.expense}]}>
                    {isIncome ? '+' : '-'}
                    {fmtAmount(t.amount ?? 0)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            onPress={claimSelected}
            disabled={picked.size === 0}
            style={({pressed}) => [
              styles.sheetSave,
              {opacity: picked.size === 0 ? 0.5 : pressed ? 0.85 : 1},
            ]}>
            <Icon name="Check" size={16} color={T.accentInk} strokeWidth={2.6} />
            <Text style={styles.sheetSaveText}>
              Claim {picked.size > 0 ? `${picked.size} ` : ''}transaction
              {picked.size === 1 ? '' : 's'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
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
  headerTitle: {fontFamily: FONTS.bold, fontSize: 16, color: T.text},
  headerSub: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, marginTop: 1},
  scroll: {padding: 16, paddingTop: 4, paddingBottom: 40},
  summaryCard: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 10,
    marginBottom: 18,
  },
  spentBig: {fontFamily: FONTS.bold, fontSize: 26, color: T.text},
  plannedSmall: {fontFamily: FONTS.regular, fontSize: 13, color: T.text3},
  pctText: {fontFamily: FONTS.bold, fontSize: 14},
  summaryFoot: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  mutedSmall: {fontFamily: FONTS.regular, fontSize: 11, color: T.text2},
  contribText: {fontFamily: FONTS.semibold, fontSize: 11.5, color: T.income},
  sectionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  itemCard: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 12,
    gap: 9,
  },
  itemHead: {flexDirection: 'row', alignItems: 'center', gap: 10},
  itemName: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  itemAmt: {fontFamily: FONTS.bold, fontSize: 12.5, color: T.text},
  otherIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: R.small,
    backgroundColor: T.accentSoft,
    marginTop: 8,
  },
  claimBtnText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.accent},
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.surface,
    borderRadius: R.small,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  txLabel: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.text},
  txAmt: {fontFamily: FONTS.bold, fontSize: 12.5},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: T.text3,
    lineHeight: 17,
  },
  contribCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.2)',
    borderRadius: R.card,
    padding: 13,
  },
  contribCardText: {flex: 1, fontFamily: FONTS.medium, fontSize: 12.5, color: T.text2},
  // claim sheet
  sheetOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)'},
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: R.large,
    borderTopRightRadius: R.large,
    paddingBottom: 28,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: T.text,
    textAlign: 'center',
    paddingTop: 12,
  },
  sheetHint: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: T.text2,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 12,
  },
  candRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: R.small,
    marginBottom: 6,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  candRowOn: {borderColor: 'rgba(34,197,94,0.45)', backgroundColor: T.accentSoft},
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: T.border2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxOn: {backgroundColor: T.accent, borderColor: T.accent},
  sheetSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: R.card,
    backgroundColor: T.accent,
  },
  sheetSaveText: {fontFamily: FONTS.bold, fontSize: 15, color: T.accentInk},
});
