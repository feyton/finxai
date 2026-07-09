import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useQuery} from '@powersync/react-native';
import React, {useMemo} from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {T, FONTS, R, resolveCat, accountTint, accountIcon, fmtAmount} from '../theme';
import {Avatar, Card, CatChip, Icon, Money, Pill, SectionHeader} from '../Components/ui';
import SMSRetriever from '../Components/SMSRetriever';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {format} from 'date-fns';

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

const QUICK_ACTIONS = [
  {id: 'Debt', label: 'Debt', icon: 'Coins', tint: '#34D399'},
  {id: 'Shopping', label: 'Shopping', icon: 'ShoppingCart', tint: '#22C55E'},
  {id: 'Shared', label: 'Shared', icon: 'Users', tint: '#60A5FA'},
  {id: 'Schedule', label: 'Schedule', icon: 'Calendar', tint: '#FBBF24'},
];

function TxnRow({txn, onPress, divider}: {txn: any; onPress: () => void; divider: boolean}) {
  const cat = resolveCat(txn.category ?? '');
  const isExpense = txn.transaction_type === 'expense';
  const amount = isExpense ? -Math.abs(txn.amount) : Math.abs(txn.amount);
  const time = txn.date_time ? format(new Date(txn.date_time), 'HH:mm') : '';
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.txnRow,
        divider && styles.txnDivider,
        {opacity: pressed ? 0.8 : 1},
      ]}>
      <CatChip cat={cat} size={38} />
      <View style={styles.txnInfo}>
        <Text style={styles.txnMerchant} numberOfLines={1}>
          {txn.merchant || txn.payee || 'Transaction'}
        </Text>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
          <Text style={styles.txnCat}>{txn.category ?? cat}</Text>
          {txn.source === 'sms' && (
            <>
              <Text style={{color: T.text3, fontSize: 10}}>·</Text>
              <Icon name="Sparkles" size={11} color={T.accent} strokeWidth={2.2} />
            </>
          )}
        </View>
      </View>
      <View style={{alignItems: 'flex-end'}}>
        <Money amount={amount} size={13} />
        <Text style={styles.txnTime}>{time}</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen({navigation}: any) {
  const {userId, firstName, picture} = useCurrentUser();
  const ms = useMemo(() => monthStart(), []);

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );
  const {data: balanceRows} = useQuery<{total: number}>(
    'SELECT COALESCE(SUM(available_balance), 0) as total FROM accounts WHERE owner_id = ?',
    [userId ?? ''],
  );
  const {data: incomeRows} = useQuery<{total: number}>(
    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE owner_id = ? AND transaction_type = 'income' AND date_time >= ?",
    [userId ?? '', ms],
  );
  const {data: expenseRows} = useQuery<{total: number}>(
    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE owner_id = ? AND transaction_type = 'expense' AND date_time >= ?",
    [userId ?? '', ms],
  );
  const {data: smsQueue} = useQuery(
    'SELECT COUNT(*) as cnt FROM auto_records WHERE owner_id = ?',
    [userId ?? ''],
  );
  const {data: recentTxns} = useQuery(
    'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.owner_id = ? ORDER BY t.date_time DESC LIMIT 5',
    [userId ?? ''],
  );

  const totalBalance = balanceRows?.[0]?.total ?? 0;
  const totalIncome = incomeRows?.[0]?.total ?? 0;
  const totalExpenses = expenseRows?.[0]?.total ?? 0;
  const pendingSms = (smsQueue?.[0] as any)?.cnt ?? 0;

  const navigate = (screen: string, params?: any) => {
    navigation.navigate(screen, params);
  };

  const tabBarHeight = useBottomTabBarHeight();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <SMSRetriever />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, {paddingBottom: tabBarHeight + 28}]}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.logoWrap}>
            <Icon name="Sparkles" size={17} color={T.accentInk} strokeWidth={2.4} />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.greeting}>Murakaza neza</Text>
            <Text style={styles.name}>Hello {firstName ?? 'there'}</Text>
          </View>
          <Pressable
            onPress={() => navigate('Notifications')}
            style={({pressed}) => [styles.topBtn, {opacity: pressed ? 0.7 : 1}]}>
            <Icon name="Bell" size={19} color={T.text} />
            {pendingSms > 0 && <View style={styles.notifDot} />}
          </Pressable>
          <Pressable
            onPress={() => navigate('UserProfile')}
            style={({pressed}) => [{opacity: pressed ? 0.7 : 1}]}>
            <Avatar initials={(firstName ?? 'U')[0].toUpperCase()} tint={T.accent} size={38} img={picture ?? undefined} />
          </Pressable>
        </View>

        <View style={styles.content}>
          {/* AI sync banner */}
          {pendingSms > 0 && (
            <Pressable
              onPress={() => navigate('SMSReview')}
              style={({pressed}) => [styles.aiBanner, {opacity: pressed ? 0.85 : 1}]}>
              <View style={styles.aiBannerIcon}>
                <Icon name="Sparkles" size={22} color={T.accent} strokeWidth={2.2} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.aiBannerTitle}>AI sorted your SMS</Text>
                <Text style={styles.aiBannerSub}>
                  <Text style={{color: T.accent, fontFamily: FONTS.semibold}}>
                    {pendingSms} need a quick check
                  </Text>
                  {' · synced just now'}
                </Text>
              </View>
              <View style={styles.aiBannerChevron}>
                <Icon name="ChevronRight" size={20} color={T.accentInk} strokeWidth={2.6} />
              </View>
            </Pressable>
          )}

          {/* Balance hero */}
          <View style={styles.hero}>
            <View style={styles.heroHeader}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <Icon name="Eye" size={14} color={T.text3} />
                <Text style={styles.heroLabel}>Total balance</Text>
              </View>
              <Pill icon="TrendingUp" color={T.accent} bg={T.accentSoft}>
                +3.4% this month
              </Pill>
            </View>
            <Text style={styles.heroAmount}>
              {fmtAmount(totalBalance)}
              <Text style={styles.heroRwf}> RWF</Text>
            </Text>
            <View style={styles.heroTiles}>
              {[
                {label: 'Income', value: totalIncome, icon: 'ArrowDownLeft', color: T.income},
                {label: 'Spent', value: totalExpenses, icon: 'ArrowUpRight', color: T.expense},
              ].map(tile => (
                <View key={tile.label} style={styles.heroTile}>
                  <View style={[styles.heroTileIcon, {backgroundColor: tile.color + '22'}]}>
                    <Icon name={tile.icon} size={16} color={tile.color} strokeWidth={2.4} />
                  </View>
                  <View>
                    <Text style={styles.heroTileLabel}>{tile.label}</Text>
                    <Text style={[styles.heroTileAmount, {color: tile.color}]}>
                      {fmtAmount(tile.value)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Accounts rail */}
          <View>
            <SectionHeader
              title="Accounts"
              action="See all"
              onAction={() => navigate('AccountsStack')}
            />
            <FlatList
              horizontal
              data={accounts}
              keyExtractor={a => a.id}
              showsHorizontalScrollIndicator={false}
              style={{marginHorizontal: -16}}
              contentContainerStyle={{paddingHorizontal: 16, gap: 10}}
              renderItem={({item: acc}) => {
                const tint = accountTint(acc.name ?? '');
                const icon = accountIcon(acc.name ?? '', acc.type ?? '');
                return (
                  <Pressable
                    onPress={() =>
                      navigate('AccountsStack', {
                        screen: 'AccountDetails',
                        params: {accountId: acc.id},
                      })
                    }
                    style={({pressed}) => [styles.acctCard, {opacity: pressed ? 0.85 : 1, transform: [{scale: pressed ? 0.97 : 1}]}]}>
                    <View style={styles.acctCardTop}>
                      <View style={[styles.acctIcon, {backgroundColor: tint + '22'}]}>
                        <Icon name={icon} size={18} color={tint} strokeWidth={2.1} />
                      </View>
                    </View>
                    <Text style={styles.acctName} numberOfLines={1}>{acc.name}</Text>
                    <Text style={styles.acctBalance}>
                      {fmtAmount(acc.available_balance ?? 0)}
                      <Text style={styles.acctRwf}> RWF</Text>
                    </Text>
                  </Pressable>
                );
              }}
              ListFooterComponent={
                <Pressable
                  onPress={() => navigate('AccountsStack', {screen: 'CreateAccount'})}
                  style={({pressed}) => [styles.addAcct, {opacity: pressed ? 0.7 : 1}]}>
                  <View style={styles.addAcctIcon}>
                    <Icon name="Plus" size={20} color={T.accent} strokeWidth={2.4} />
                  </View>
                  <Text style={styles.addAcctLabel}>Add</Text>
                </Pressable>
              }
            />
          </View>

          {/* Quick actions */}
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map(q => (
              <Pressable
                key={q.id}
                onPress={() => navigate(q.id)}
                style={({pressed}) => [
                  styles.quickItem,
                  {opacity: pressed ? 0.7 : 1, transform: [{scale: pressed ? 0.96 : 1}]},
                ]}>
                <View style={[styles.quickIcon, {backgroundColor: q.tint + '1f'}]}>
                  <Icon name={q.icon} size={20} color={q.tint} strokeWidth={2.1} />
                </View>
                <Text style={styles.quickLabel}>{q.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* AI coach nudge */}
          <Pressable
            onPress={() => navigation.getParent()?.navigate('AIChat')}
            style={({pressed}) => [styles.coachCard, {opacity: pressed ? 0.85 : 1}]}>
            <View style={styles.aiAvatar}>
              <Icon name="Sparkles" size={18} color={T.accentInk} strokeWidth={2.2} />
            </View>
            <View style={{flex: 1, gap: 3}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                <Icon name="Sparkles" size={13} color={T.accent} strokeWidth={2.2} />
                <Text style={styles.coachLabel}>AI Coach</Text>
              </View>
              <Text style={styles.coachText}>
                Tap to ask about your spending, plan savings, or get debt payoff advice.
              </Text>
            </View>
          </Pressable>

          {/* Recent transactions */}
          <View>
            <SectionHeader
              title="Recent transactions"
              action="View all"
              onAction={() => navigate('Transactions')}
            />
            {recentTxns.length === 0 ? (
              <Card>
                <Text style={{fontFamily: FONTS.regular, fontSize: 13, color: T.text3, textAlign: 'center', padding: 8}}>
                  No transactions yet. Add an account and your SMS will be auto-parsed.
                </Text>
              </Card>
            ) : (
              <Card pad={6}>
                {recentTxns.map((txn: any, i: number) => (
                  <TxnRow
                    key={txn.id}
                    txn={txn}
                    divider={i < recentTxns.length - 1}
                    onPress={() => {}} // Transaction detail — Phase 5
                  />
                ))}
              </Card>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  scroll: {paddingBottom: 80},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 6,
  },
  logoWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {fontFamily: FONTS.regular, fontSize: 11, color: T.text2, lineHeight: 14},
  name: {fontFamily: FONTS.semibold, fontSize: 15.5, color: T.text, lineHeight: 20},
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 9,
    backgroundColor: T.expense,
    borderWidth: 2,
    borderColor: T.surface2,
  },
  content: {gap: 14, paddingHorizontal: 16},
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: R.card,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
  },
  aiBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    flexShrink: 0,
    backgroundColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBannerTitle: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text},
  aiBannerSub: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  aiBannerChevron: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hero: {
    borderRadius: R.large,
    padding: 18,
    paddingBottom: 16,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  heroHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  heroLabel: {fontFamily: FONTS.medium, fontSize: 12, color: T.text2},
  heroAmount: {
    fontFamily: FONTS.bold,
    fontSize: 34,
    color: T.text,
    letterSpacing: -0.5,
    marginTop: 8,
    lineHeight: 40,
  },
  heroRwf: {fontSize: 16, color: T.text3, fontFamily: FONTS.semibold},
  heroTiles: {flexDirection: 'row', gap: 10, marginTop: 16},
  heroTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    paddingHorizontal: 11,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
  },
  heroTileIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroTileLabel: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text2},
  heroTileAmount: {fontFamily: FONTS.bold, fontSize: 13},
  acctCard: {
    width: 152,
    flexShrink: 0,
    padding: 13,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  acctCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  acctIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctName: {fontFamily: FONTS.regular, fontSize: 12, color: T.text2, marginBottom: 2},
  acctBalance: {fontFamily: FONTS.bold, fontSize: 16, color: T.text},
  acctRwf: {fontSize: 10, color: T.text3, fontFamily: FONTS.medium},
  addAcct: {
    width: 100,
    flexShrink: 0,
    borderRadius: R.card,
    borderWidth: 1.5,
    borderColor: T.border2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  addAcctIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAcctLabel: {fontFamily: FONTS.semibold, fontSize: 11, color: T.text2},
  quickGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  quickItem: {
    flex: 1,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 7,
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {fontFamily: FONTS.medium, fontSize: 10.5, color: T.text2},
  coachCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  aiAvatar: {
    width: 34,
    height: 34,
    borderRadius: 34,
    backgroundColor: T.accent600,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coachLabel: {fontFamily: FONTS.semibold, fontSize: 11, color: T.accent},
  coachText: {fontFamily: FONTS.regular, fontSize: 13, color: T.text, lineHeight: 19},
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  txnDivider: {borderBottomWidth: 1, borderBottomColor: T.border},
  txnInfo: {flex: 1, minWidth: 0},
  txnMerchant: {fontFamily: FONTS.medium, fontSize: 13, color: T.text},
  txnCat: {fontFamily: FONTS.regular, fontSize: 11, color: T.text2},
  txnTime: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text3},
});
