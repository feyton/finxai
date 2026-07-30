/**
 * The transactions behind one bar on Category insights — a specific category
 * (optionally one subcategory) within a specific month and flow.
 *
 * Exists so an insight is actionable: seeing "Transport 231,480 across 19
 * transactions" immediately raises "which 19?", and the answer used to require
 * leaving for Records and reconstructing the same filter by hand — with no way to
 * restrict to the month or the subcategory at all.
 *
 * Reuses TxRow and TransactionDetailSheet, so a row found to be miscategorised
 * can be opened and corrected in place (Edit / Split) rather than noted down and
 * fixed elsewhere.
 */
import {useQuery} from '@powersync/react-native';
import React, {useCallback, useMemo, useRef} from 'react';
import {SectionList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {format} from 'date-fns';

import TransactionDetailSheet, {
  TransactionDetailSheetHandle,
} from '../Components/TransactionDetailSheet';
import {TxRow} from '../Components/TxRow';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, CategoryId, FONTS, R, T, fmtAmount, resolveCat} from '../theme';

// Matches the placeholder CategoryStats shows for an empty subcategory, so the
// two screens agree on what "no subcategory" is called.
export const NO_SUB = 'No subcategory';

export default function CategoryTransactions({route, navigation}: any) {
  const {
    category,
    subcategory = null,
    flow = 'expense',
    start,
    end,
    monthLabel,
  }: {
    category: CategoryId;
    subcategory?: string | null;
    flow: 'expense' | 'income';
    start: string;
    end: string;
    monthLabel: string;
  } = route.params ?? {};

  const {userId} = useCurrentUser();
  const sheetRef = useRef<TransactionDetailSheetHandle>(null);
  const meta = CATS[category];

  // Deliberately the SAME shape as the aggregate query in CategoryStats: the
  // same LEFT JOIN on split_details and the same COALESCE precedence, so a split
  // part is attributed to its own category here exactly as it is there. If these
  // two diverged, this list would quietly disagree with the bar that opened it.
  const {data: rows} = useQuery(
    `SELECT t.*,
            a.name AS account_name,
            COALESCE(s.category, t.category)       AS eff_category,
            COALESCE(s.subcategory, t.subcategory) AS eff_subcategory,
            COALESCE(s.amount, t.amount)           AS eff_amount,
            s.id                                   AS split_id
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     LEFT JOIN split_details s ON s.transaction_id = t.id
     WHERE t.owner_id = ? AND t.transaction_type = ?
       AND t.date_time >= ? AND t.date_time < ?
     ORDER BY t.date_time DESC`,
    [userId ?? '', flow, start, end],
  );

  // Category matching runs in JS through resolveCat rather than in SQL, because
  // resolveCat is what CategoryStats groups by — stored values are a mix of
  // canonical ids ('rent') and display labels ('Personal Care'), and a SQL
  // equality test would silently drop one of the two forms.
  const {sections, total, count} = useMemo(() => {
    const matched = (rows as any[])
      .filter(r => resolveCat(r.eff_category ?? '') === category)
      .filter(r => {
        if (!subcategory) {
          return true;
        }
        const sub = (r.eff_subcategory ?? '').trim();
        return subcategory === NO_SUB ? sub === '' : sub === subcategory;
      })
      // Present the amount attributed to THIS category, which for a split part
      // is the part, not the parent's total — otherwise the rows would not sum
      // to the figure on the bar. `id` stays the parent's so the detail sheet
      // and Edit screen still act on the real transaction.
      .map(r => ({
        ...r,
        amount: r.eff_amount ?? r.amount,
        category: r.eff_category ?? r.category,
        subcategory: r.eff_subcategory ?? r.subcategory,
        isSplitPart: !!r.split_id,
      }));

    const sum = matched.reduce((acc, r) => acc + (r.amount ?? 0), 0);

    // Group by day, matching how Records presents a list.
    const byDay = new Map<string, any[]>();
    for (const r of matched) {
      const key = r.date_time ? r.date_time.slice(0, 10) : 'unknown';
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.push(r);
      } else {
        byDay.set(key, [r]);
      }
    }
    return {
      sections: [...byDay.entries()].map(([day, data]) => ({
        title: day,
        data,
        dayTotal: data.reduce((a, r) => a + (r.amount ?? 0), 0),
      })),
      total: sum,
      count: matched.length,
    };
  }, [rows, category, subcategory]);

  const openDetail = useCallback((tx: any) => {
    sheetRef.current?.open(tx);
  }, []);

  const renderItem = useCallback(
    ({item}: {item: any}) => <TxRow tx={item} onPress={() => openDetail(item)} />,
    [openDetail],
  );

  const heading = subcategory
    ? subcategory === NO_SUB
      ? `${meta?.label ?? category} · no subcategory`
      : subcategory
    : meta?.label ?? category;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={styles.title} numberOfLines={1}>
            {heading}
          </Text>
          <Text style={styles.subtitle}>
            {monthLabel} · {count} transaction{count === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <View style={[styles.totalCard, {borderColor: (meta?.color ?? T.accent) + '33'}]}>
        <Text style={styles.totalLabel}>
          {flow === 'expense' ? 'Total spent' : 'Total received'}
        </Text>
        <Text
          style={[
            styles.totalValue,
            {color: flow === 'expense' ? T.expense : T.income},
          ]}>
          {flow === 'expense' ? '−' : '+'}
          {fmtAmount(total)} <Text style={styles.totalCcy}>RWF</Text>
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${item.id}-${item.split_id ?? 'x'}-${i}`}
        renderItem={renderItem}
        renderSectionHeader={({section}) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionDate}>{dayLabel(section.title)}</Text>
            <Text style={styles.sectionTotal}>{fmtAmount(section.dayTotal)}</Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="Receipt" size={34} color={T.text3} strokeWidth={1.5} />
            <Text style={styles.emptyText}>Nothing here</Text>
            <Text style={styles.emptyHint}>
              No {heading} transactions in {monthLabel}.
            </Text>
          </View>
        }
      />

      <TransactionDetailSheet ref={sheetRef} navigation={navigation} flatList={flatten(sections)} />
    </SafeAreaView>
  );
}

// The sheet's prev/next arrows walk a flat ordered list, so it needs the rows in
// the same order they are displayed — sections flattened, headers dropped.
function flatten(sections: {data: any[]}[]): any[] {
  return sections.flatMap(s => s.data);
}

function dayLabel(iso: string): string {
  if (iso === 'unknown') {
    return 'Undated';
  }
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (isSameDay(d, today)) {
    return 'Today';
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, yesterday)) {
    return 'Yesterday';
  }
  return format(d, 'EEE d MMM');
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: FONTS.bold, fontSize: 19, color: T.text, lineHeight: 25},
  subtitle: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, lineHeight: 17},
  totalCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
  },
  totalLabel: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, lineHeight: 17},
  totalValue: {fontFamily: FONTS.bold, fontSize: 24, lineHeight: 32, marginTop: 2},
  totalCcy: {fontFamily: FONTS.medium, fontSize: 13, color: T.text3},
  list: {paddingBottom: 40},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionDate: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 17,
  },
  sectionTotal: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2, lineHeight: 17},
  empty: {alignItems: 'center', paddingTop: 70, gap: 6},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 15, color: T.text2, marginTop: 4},
  emptyHint: {fontFamily: FONTS.regular, fontSize: 13, color: T.text3, textAlign: 'center'},
});
