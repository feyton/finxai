import {useQuery} from '@powersync/react-native';
import React, {useMemo} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Card, Icon, Progress} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, fmtAmount} from '../theme';

export default function DebtScreen({navigation}: any) {
  const {userId} = useCurrentUser();
  const {data: debts} = useQuery(
    'SELECT * FROM debts WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );

  const {youOwe, owedToYou, insight} = useMemo(() => {
    const list = debts as any[];
    let owe = 0;
    let owed = 0;
    for (const d of list) {
      if (d.dir === 'borrowed') {
        owe += d.outstanding ?? 0;
      } else {
        owed += d.outstanding ?? 0;
      }
    }
    // Simple coaching insight on the largest interest-bearing borrowed debt.
    const target = list
      .filter(d => d.dir === 'borrowed' && (d.rate ?? 0) > 0 && (d.installment ?? 0) > 0)
      .sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0))[0];
    let tip: string | null = null;
    if (target) {
      const extra = Math.round((target.installment ?? 0) * 0.15 / 1000) * 1000 || 5000;
      const remaining = Math.max(1, (target.term ?? 0) - (target.paid ?? 0));
      const saved = Math.round((remaining * 0.15) * (target.rate / 100) * (target.installment ?? 0) / 12);
      tip = `Pay ${fmtAmount(extra)} extra on your ${target.party} loan each month and you'll clear it a couple of months early, saving roughly ${fmtAmount(Math.max(saved, extra))} in interest.`;
    }
    return {youOwe: owe, owedToYou: owed, insight: tip};
  }, [debts]);

  const list = debts as any[];

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
          <Text style={styles.title}>Debts & loans</Text>
          <Text style={styles.subtitle}>Track what you owe & what's owed</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('AddDebt')}
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Plus" size={18} color={T.accent} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{padding: 16, paddingTop: 4, gap: 14, paddingBottom: 40}}>
        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, {backgroundColor: 'rgba(251,113,133,0.10)', borderColor: 'rgba(251,113,133,0.25)'}]}>
            <Text style={styles.summaryLabel}>You owe</Text>
            <Text style={[styles.summaryValue, {color: T.expense}]}>{fmtAmount(youOwe)}</Text>
            <Text style={styles.summaryUnit}>RWF outstanding</Text>
          </View>
          <View style={[styles.summaryCard, {backgroundColor: 'rgba(52,211,153,0.10)', borderColor: 'rgba(52,211,153,0.25)'}]}>
            <Text style={styles.summaryLabel}>Owed to you</Text>
            <Text style={[styles.summaryValue, {color: T.income}]}>{fmtAmount(owedToYou)}</Text>
            <Text style={styles.summaryUnit}>RWF to collect</Text>
          </View>
        </View>

        {/* AI insight */}
        {insight && (
          <View style={styles.insight}>
            <Icon name="Sparkles" size={16} color={T.accent} strokeWidth={2.2} />
            <Text style={styles.insightText}>{insight}</Text>
          </View>
        )}

        {/* Active */}
        {list.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Active</Text>
            {list.map(d => {
              const isOwe = d.dir === 'borrowed';
              const pct = d.term > 0 ? Math.round(((d.paid ?? 0) / d.term) * 100) : 0;
              const tint = d.tint || (isOwe ? T.info : T.income);
              return (
                <Card key={d.id} pad={14}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 11}}>
                    <View style={[styles.debtIcon, {backgroundColor: tint + '22'}]}>
                      <Icon name={d.icon || 'Landmark'} size={19} color={tint} strokeWidth={2} />
                    </View>
                    <View style={{flex: 1, minWidth: 0}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 7}}>
                        <Text style={styles.party} numberOfLines={1}>{d.party}</Text>
                        <View style={[styles.tag, {backgroundColor: isOwe ? 'rgba(251,113,133,0.15)' : 'rgba(52,211,153,0.15)'}]}>
                          <Text style={[styles.tagText, {color: isOwe ? T.expense : T.income}]}>
                            {isOwe ? 'You owe' : 'Owed'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.debtSub} numberOfLines={1}>
                        {d.sub}
                        {d.rate > 0 ? ` · ${d.rate}% p.a.` : ''}
                      </Text>
                    </View>
                    <View style={{alignItems: 'flex-end'}}>
                      <Text style={styles.outstanding}>{fmtAmount(d.outstanding ?? 0)}</Text>
                      <Text style={styles.ofPrincipal}>of {fmtAmount(d.principal ?? 0)}</Text>
                    </View>
                  </View>
                  <View style={{marginTop: 12}}>
                    <Progress value={d.paid ?? 0} max={d.term || 1} color={tint} />
                    <View style={styles.debtFoot}>
                      <Text style={styles.repaid}>{pct}% repaid</Text>
                      {d.next_due ? (
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                          <Icon name="Clock" size={12} color={T.text3} strokeWidth={2} />
                          <Text style={styles.nextDue}>Next {String(d.next_due).slice(0, 10)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })}
          </>
        ) : (
          <Card style={{alignItems: 'center', gap: 6}} pad={24}>
            <Icon name="Handshake" size={36} color={T.text3} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No debts or loans tracked yet</Text>
            <Text style={styles.emptyHint}>Add one to project payoff and get reminders</Text>
          </Card>
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
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
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
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {flexDirection: 'row', gap: 10},
  summaryCard: {flex: 1, borderRadius: R.card, borderWidth: 1, padding: 14, gap: 3},
  summaryLabel: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  summaryValue: {fontFamily: FONTS.bold, fontSize: 20},
  summaryUnit: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text3},
  insight: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 13,
    borderRadius: R.card,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  insightText: {flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, lineHeight: 18},
  sectionLabel: {fontFamily: FONTS.bold, fontSize: 15, color: T.text, marginTop: 2},
  debtIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  party: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text, flexShrink: 1},
  tag: {paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99},
  tagText: {fontFamily: FONTS.semibold, fontSize: 9.5},
  debtSub: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2, marginTop: 1},
  outstanding: {fontFamily: FONTS.bold, fontSize: 15, color: T.text},
  ofPrincipal: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text3},
  debtFoot: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8},
  repaid: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text2},
  nextDue: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  emptyHint: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, textAlign: 'center'},
});
