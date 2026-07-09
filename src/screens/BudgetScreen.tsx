import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useQuery} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle} from 'react-native-svg';
import {Avatar, Card, CatChip, Icon, Pill, Progress} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, CategoryId, FONTS, R, T, fmtAmount, resolveCat} from '../theme';

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function monthLabel() {
  const d = new Date();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const daysLeft = Math.max(0, end.getDate() - d.getDate());
  const month = d.toLocaleString('en-US', {month: 'long', year: 'numeric'});
  return `${month} · resets in ${daysLeft || 'less than a'} day${daysLeft === 1 ? '' : 's'}`;
}

// Circular progress ring
function Ring({pct, size = 74}: {pct: number; size?: number}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const capped = Math.min(100, pct);
  const over = pct > 100;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={size} height={size} style={{transform: [{rotate: '-90deg'}]}}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? T.expense : T.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(capped / 100) * c} ${c}`}
        />
      </Svg>
      <Text style={styles.ringPct}>{pct}%</Text>
    </View>
  );
}

function AvatarStack({people}: {people: any[]}) {
  return (
    <View style={{flexDirection: 'row'}}>
      {people.slice(0, 4).map((p, i) => (
        <View key={p.id ?? i} style={{marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: T.surface, borderRadius: 99}}>
          <Avatar initials={p.initials ?? '?'} tint={p.tint ?? T.accent} size={26} />
        </View>
      ))}
    </View>
  );
}

export default function BudgetScreen({navigation}: any) {
  const {userId} = useCurrentUser();
  const tabBarHeight = useBottomTabBarHeight();
  const [tab, setTab] = useState<'spending' | 'shared'>('spending');

  const {data: items} = useQuery(
    'SELECT bi.category, bi.amount FROM budget_items bi JOIN budgets b ON bi.budget_id = b.id WHERE bi.owner_id = ?',
    [userId ?? ''],
  );
  const {data: monthTxns} = useQuery(
    "SELECT category, amount FROM transactions WHERE owner_id = ? AND transaction_type = 'expense' AND date_time >= ?",
    [userId ?? '', monthStart()],
  );
  const {data: groups} = useQuery(
    'SELECT * FROM budget_groups WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );
  const {data: contributors} = useQuery(
    'SELECT * FROM budget_group_contributors WHERE owner_id = ?',
    [userId ?? ''],
  );

  const budgets = useMemo(() => {
    const limits = {} as Record<CategoryId, number>;
    for (const it of items as any[]) {
      const id = resolveCat(it.category ?? '');
      limits[id] = (limits[id] ?? 0) + (it.amount ?? 0);
    }
    const spent = {} as Record<CategoryId, number>;
    for (const t of monthTxns as any[]) {
      const id = resolveCat(t.category ?? '');
      spent[id] = (spent[id] ?? 0) + (t.amount ?? 0);
    }
    const list = (Object.keys(limits) as CategoryId[]).map(id => ({
      cat: id,
      limit: limits[id],
      spent: spent[id] ?? 0,
    }));
    const totalLimit = list.reduce((s, b) => s + b.limit, 0);
    const totalSpent = list.reduce((s, b) => s + b.spent, 0);
    const over = list.filter(b => b.spent > b.limit);
    return {list, totalLimit, totalSpent, over};
  }, [items, monthTxns]);

  const contributorsByGroup = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of contributors as any[]) {
      if (!map[c.group_id]) {
        map[c.group_id] = [];
      }
      map[c.group_id].push(c);
    }
    return map;
  }, [contributors]);

  const pct = budgets.totalLimit > 0 ? Math.round((budgets.totalSpent / budgets.totalLimit) * 100) : 0;
  const left = budgets.totalLimit - budgets.totalSpent;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{flex: 1}}>
          <Text style={styles.title}>Budgets</Text>
          <Text style={styles.subtitle}>{monthLabel()}</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('CreateBudget')}
          style={({pressed}) => [styles.createBtn, {opacity: pressed ? 0.75 : 1}]}>
          <Icon name="Plus" size={15} color={T.accent} strokeWidth={2.5} />
          <Text style={styles.createBtnText}>Create</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {([['spending', 'My spending'], ['shared', 'Shared & goals']] as const).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tabBtn, tab === id && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, {paddingBottom: tabBarHeight + 28}]}
        showsVerticalScrollIndicator={false}>
        {tab === 'spending' && (
          <View style={{gap: 14}}>
            {budgets.list.length === 0 ? (
              <Card style={{alignItems: 'center', gap: 6}} pad={24}>
                <Icon name="PieChart" size={36} color={T.text3} strokeWidth={1.5} />
                <Text style={styles.emptyText}>No category budgets yet</Text>
                <Text style={styles.emptyHint}>Create one to cap spending per category</Text>
              </Card>
            ) : (
              <>
                {/* Ring summary */}
                <Card style={{flexDirection: 'row', alignItems: 'center', gap: 18}} pad={18} radius={R.large}>
                  <Ring pct={pct} />
                  <View style={{flex: 1}}>
                    <Text style={styles.mutedLabel}>Left to spend</Text>
                    <Text style={[styles.leftAmount, left < 0 && {color: T.expense}]}>
                      {fmtAmount(left)}
                      <Text style={styles.unit}> RWF</Text>
                    </Text>
                    <Text style={styles.mutedSmall}>
                      {fmtAmount(budgets.totalSpent)} of {fmtAmount(budgets.totalLimit)} spent
                    </Text>
                  </View>
                </Card>

                {/* Over-budget alert */}
                {budgets.over.length > 0 && (
                  <View style={styles.alert}>
                    <Icon name="AlertCircle" size={18} color={T.expense} strokeWidth={2} />
                    <Text style={styles.alertText}>
                      <Text style={{color: T.text, fontFamily: FONTS.semibold}}>
                        {CATS[budgets.over[0].cat].label}
                      </Text>
                      {' is over by '}
                      {fmtAmount(budgets.over[0].spent - budgets.over[0].limit)}
                      {' RWF this month.'}
                    </Text>
                  </View>
                )}

                {/* Category budgets */}
                <View style={{gap: 10}}>
                  {budgets.list.map(b => {
                    const c = CATS[b.cat];
                    const p = Math.round((b.spent / Math.max(b.limit, 1)) * 100);
                    const over = b.spent > b.limit;
                    return (
                      <Card key={b.cat} pad={13}>
                        <View style={styles.budgetHead}>
                          <CatChip cat={b.cat} size={34} />
                          <View style={{flex: 1}}>
                            <Text style={styles.budgetLabel}>{c.label}</Text>
                            <Text style={styles.mutedSmall}>
                              {fmtAmount(b.spent)} / {fmtAmount(b.limit)} RWF
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.budgetPct,
                              {color: over ? T.expense : p > 85 ? T.warn : T.text2},
                            ]}>
                            {p}%
                          </Text>
                        </View>
                        <Progress value={b.spent} max={b.limit} color={c.color} />
                      </Card>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        {tab === 'shared' && (
          <View style={{gap: 12}}>
            <View style={styles.sharedBanner}>
              <Icon name="Users" size={18} color="#F472B6" strokeWidth={2} />
              <Text style={styles.alertText}>
                Pool money with others for a{' '}
                <Text style={{color: T.text, fontFamily: FONTS.semibold}}>party, household, or goal</Text>
                {' — everyone contributes, AI links expenses as they happen.'}
              </Text>
            </View>

            {(groups as any[]).map(g => {
              const gPct = Math.round(((g.spent ?? 0) / Math.max(g.target ?? 1, 1)) * 100);
              const typeLabel = g.type === 'party' ? 'Party' : g.type === 'goal' ? 'Goal' : 'Shared';
              const people = contributorsByGroup[g.id] ?? [];
              return (
                <Card key={g.id} pad={14}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 11}}>
                    <View style={[styles.emojiTile, {backgroundColor: (g.tint ?? T.accent) + '22'}]}>
                      <Text style={{fontSize: 20}}>{g.emoji ?? '📊'}</Text>
                    </View>
                    <View style={{flex: 1, minWidth: 0}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 7}}>
                        <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                        <Pill size={9} color={g.tint ?? T.accent} bg={(g.tint ?? T.accent) + '20'}>
                          {typeLabel}
                        </Pill>
                        {!!g.recurring && <Icon name="Repeat" size={12} color={T.text3} strokeWidth={2} />}
                      </View>
                      <Text style={styles.mutedSmall}>{g.date_label}</Text>
                    </View>
                    {people.length > 0 && <AvatarStack people={people} />}
                  </View>
                  <View style={{marginTop: 12}}>
                    <Progress value={g.spent ?? 0} max={g.target ?? 1} color={g.tint ?? T.accent} />
                    <View style={styles.groupFoot}>
                      <Text style={styles.groupSpent}>
                        {fmtAmount(g.spent ?? 0)}
                        <Text style={styles.mutedSmall}> / {fmtAmount(g.target ?? 0)}</Text>
                      </Text>
                      <Text style={styles.mutedSmall}>
                        {g.type === 'goal' ? `${gPct}% saved` : `${gPct}% of pool`}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}

            {(groups as any[]).length === 0 && (
              <Card style={{alignItems: 'center', gap: 6}} pad={24}>
                <Icon name="Users" size={36} color={T.text3} strokeWidth={1.5} />
                <Text style={styles.emptyText}>No shared budgets or goals yet</Text>
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 10,
  },
  title: {fontFamily: FONTS.bold, fontSize: 20, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: R.small,
    backgroundColor: T.accentSoft,
  },
  createBtnText: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.accent},
  tabRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10},
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
  scroll: {padding: 16, paddingTop: 4, paddingBottom: 110},
  ringPct: {
    position: 'absolute',
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: T.text,
  },
  mutedLabel: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  mutedSmall: {fontFamily: FONTS.regular, fontSize: 11, color: T.text2, marginTop: 1},
  leftAmount: {fontFamily: FONTS.bold, fontSize: 24, color: T.text, marginTop: 2},
  unit: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3},
  alert: {
    flexDirection: 'row',
    gap: 11,
    padding: 13,
    borderRadius: R.card,
    backgroundColor: 'rgba(251,113,133,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.25)',
    alignItems: 'flex-start',
  },
  alertText: {flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, lineHeight: 18},
  budgetHead: {flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9},
  budgetLabel: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  budgetPct: {fontFamily: FONTS.bold, fontSize: 12.5},
  sharedBanner: {
    flexDirection: 'row',
    gap: 11,
    padding: 13,
    borderRadius: R.card,
    backgroundColor: 'rgba(244,114,182,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.22)',
    alignItems: 'flex-start',
  },
  emojiTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupName: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text, flexShrink: 1},
  groupFoot: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 7},
  groupSpent: {fontFamily: FONTS.semibold, fontSize: 11.5, color: T.text},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  emptyHint: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3},
});
