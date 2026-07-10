/**
 * Spending / income per category, expandable into subcategories.
 * Month-by-month, split-aware: split parts replace the parent transaction's
 * category, so a split "50k Simba" counts 30k groceries + 20k fun.
 */
import {useQuery} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CatChip, Icon, Progress} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, CategoryId, FONTS, R, T, fmtAmount, resolveCat} from '../theme';

type Flow = 'expense' | 'income';

interface SubRow {
  name: string;
  amount: number;
  count: number;
}

interface CatRow {
  cat: CategoryId;
  amount: number;
  count: number;
  subs: SubRow[];
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', {month: 'long', year: 'numeric'});
}

export default function CategoryStats({navigation}: any) {
  const {userId} = useCurrentUser();
  const [flow, setFlow] = useState<Flow>('expense');
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const [openCat, setOpenCat] = useState<CategoryId | null>(null);

  const {start, end, label, isCurrent} = useMemo(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const e = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);
    return {
      start: s.toISOString(),
      end: e.toISOString(),
      label: monthLabel(s),
      isCurrent: monthOffset === 0,
    };
  }, [monthOffset]);

  // Effective category rows: split parts replace the parent's category.
  const {data: rows} = useQuery(
    `SELECT COALESCE(s.category, t.category) AS category,
            COALESCE(s.subcategory, t.subcategory) AS subcategory,
            COALESCE(s.amount, t.amount) AS amount
     FROM transactions t
     LEFT JOIN split_details s ON s.transaction_id = t.id
     WHERE t.owner_id = ? AND t.transaction_type = ?
       AND t.date_time >= ? AND t.date_time < ?`,
    [userId ?? '', flow, start, end],
  );

  const stats = useMemo(() => {
    const byCat = new Map<CategoryId, CatRow>();
    let total = 0;
    for (const r of rows as any[]) {
      const cat = resolveCat(r.category ?? '');
      const amount = r.amount ?? 0;
      total += amount;
      const entry = byCat.get(cat) ?? {cat, amount: 0, count: 0, subs: []};
      entry.amount += amount;
      entry.count += 1;
      const subName = (r.subcategory ?? '').trim() || 'No subcategory';
      const sub = entry.subs.find(s => s.name === subName);
      if (sub) {
        sub.amount += amount;
        sub.count += 1;
      } else {
        entry.subs.push({name: subName, amount, count: 1});
      }
      byCat.set(cat, entry);
    }
    const list = [...byCat.values()].sort((a, b) => b.amount - a.amount);
    for (const c of list) {
      c.subs.sort((a, b) => b.amount - a.amount);
    }
    const max = list[0]?.amount ?? 0;
    return {list, total, max};
  }, [rows]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>Category insights</Text>
          <Text style={styles.subtitle}>Where the money actually goes</Text>
        </View>
      </View>

      {/* Month switcher */}
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setMonthOffset(o => o - 1)}
          style={({pressed}) => [styles.monthBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ChevronLeft" size={17} color={T.text2} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.monthLabel}>{label}</Text>
        <Pressable
          onPress={() => !isCurrent && setMonthOffset(o => o + 1)}
          style={({pressed}) => [
            styles.monthBtn,
            {opacity: isCurrent ? 0.3 : pressed ? 0.7 : 1},
          ]}>
          <Icon name="ChevronRight" size={17} color={T.text2} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Flow toggle */}
      <View style={styles.tabRow}>
        {([['expense', 'Expenses'], ['income', 'Income']] as const).map(([id, lbl]) => (
          <Pressable
            key={id}
            onPress={() => {
              setFlow(id);
              setOpenCat(null);
            }}
            style={[styles.tabBtn, flow === id && styles.tabBtnActive]}>
            <Text style={[styles.tabText, flow === id && styles.tabTextActive]}>{lbl}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {/* Total */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            Total {flow === 'expense' ? 'spent' : 'received'}
          </Text>
          <Text
            style={[
              styles.totalValue,
              {color: flow === 'expense' ? T.expense : T.income},
            ]}>
            {flow === 'expense' ? '-' : '+'}
            {fmtAmount(stats.total)}
            <Text style={styles.totalUnit}> RWF</Text>
          </Text>
        </View>

        {stats.list.length === 0 && (
          <View style={styles.empty}>
            <Icon name="PieChart" size={38} color={T.text3} strokeWidth={1.5} />
            <Text style={styles.emptyText}>
              No {flow === 'expense' ? 'expenses' : 'income'} in {label}
            </Text>
          </View>
        )}

        {/* Category bars */}
        <View style={{gap: 8}}>
          {stats.list.map(c => {
            const meta = CATS[c.cat];
            const pct = stats.total > 0 ? Math.round((c.amount / stats.total) * 100) : 0;
            const isOpen = openCat === c.cat;
            return (
              <View key={c.cat} style={styles.catCard}>
                <Pressable
                  onPress={() => setOpenCat(prev => (prev === c.cat ? null : c.cat))}
                  style={({pressed}) => [{opacity: pressed ? 0.85 : 1, gap: 9}]}>
                  <View style={styles.catHead}>
                    <CatChip cat={c.cat} size={34} />
                    <View style={{flex: 1, minWidth: 0}}>
                      <Text style={styles.catLabel} numberOfLines={1}>{meta.label}</Text>
                      <Text style={styles.catSub}>
                        {c.count} transaction{c.count === 1 ? '' : 's'} · {pct}%
                      </Text>
                    </View>
                    <View style={{alignItems: 'flex-end', gap: 2}}>
                      <Text style={styles.catAmt}>{fmtAmount(c.amount)}</Text>
                      <Icon
                        name={isOpen ? 'ChevronDown' : 'ChevronRight'}
                        size={14}
                        color={T.text3}
                        strokeWidth={2}
                      />
                    </View>
                  </View>
                  <Progress value={c.amount} max={Math.max(stats.max, 1)} color={meta.color} />
                </Pressable>

                {/* Subcategory breakdown */}
                {isOpen && (
                  <View style={styles.subWrap}>
                    {c.subs.map(s => {
                      const subPct = c.amount > 0 ? Math.round((s.amount / c.amount) * 100) : 0;
                      return (
                        <View key={s.name} style={styles.subRow}>
                          <View
                            style={[
                              styles.subDot,
                              {
                                backgroundColor:
                                  s.name === 'No subcategory' ? T.text3 : meta.color,
                              },
                            ]}
                          />
                          <Text style={styles.subName} numberOfLines={1}>
                            {s.name}
                          </Text>
                          <Text style={styles.subPct}>{subPct}%</Text>
                          <Text style={styles.subAmt}>{fmtAmount(s.amount)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  monthBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  tabRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8},
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  tabBtnActive: {backgroundColor: T.accent, borderColor: 'transparent'},
  tabText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text2},
  tabTextActive: {color: T.accentInk},
  scroll: {padding: 16, paddingTop: 6, paddingBottom: 40},
  totalCard: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    marginBottom: 14,
  },
  totalLabel: {fontFamily: FONTS.regular, fontSize: 12, color: T.text2},
  totalValue: {fontFamily: FONTS.bold, fontSize: 26, marginTop: 2},
  totalUnit: {fontFamily: FONTS.regular, fontSize: 13, color: T.text3},
  empty: {alignItems: 'center', gap: 10, paddingTop: 40},
  emptyText: {fontFamily: FONTS.regular, fontSize: 13, color: T.text3},
  catCard: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 12,
  },
  catHead: {flexDirection: 'row', alignItems: 'center', gap: 11},
  catLabel: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  catSub: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, marginTop: 1},
  catAmt: {fontFamily: FONTS.bold, fontSize: 13.5, color: T.text},
  subWrap: {
    marginTop: 11,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 9,
    gap: 8,
  },
  subRow: {flexDirection: 'row', alignItems: 'center', gap: 9},
  subDot: {width: 8, height: 8, borderRadius: 4, flexShrink: 0},
  subName: {flex: 1, fontFamily: FONTS.medium, fontSize: 12.5, color: T.text2},
  subPct: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, width: 38, textAlign: 'right'},
  subAmt: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text, minWidth: 70, textAlign: 'right'},
});
