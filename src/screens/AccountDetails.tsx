import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {usePowerSync, useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import React, {useMemo, useState} from 'react';
import {
  Modal,
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
import {sendInviteEmail} from '../tools/invites';
import {FONTS, R, T, accountIcon, accountTint, fmtAmount} from '../theme';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Owner-side share manager: invite by email (view / edit), revoke.
function ShareSheet({
  visible,
  account,
  onClose,
}: {
  visible: boolean;
  account: any;
  onClose: () => void;
}) {
  const db = usePowerSync();
  const {userId, name} = useCurrentUser();
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<'view' | 'edit'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const {data: shares} = useQuery(
    'SELECT * FROM account_shares WHERE account_id = ? ORDER BY created_at DESC',
    [account?.id ?? ''],
  );

  const share = async () => {
    const target = email.trim().toLowerCase();
    if (!target.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    if ((shares as any[]).some(s => s.invitee_email === target)) {
      setError('Already shared with that email');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // The Postgres trigger resolves the email to a user id (immediately if
      // they exist, else on their first sign-in) and flips status to active.
      await db.execute(
        'INSERT INTO account_shares (id, account_id, owner_id, invitee_email, shared_with_id, access, status, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)',
        [uuid(), account.id, userId ?? '', target, access, 'pending', new Date().toISOString()],
      );
      sendInviteEmail(target, name ?? 'A FinXAI user', target.split('@')[0]).catch(() => {});
      setEmail('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not share');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    // Deleting the share removes the bucket — the account and its
    // transactions disappear from the invitee's devices on next sync.
    await db.execute('DELETE FROM account_shares WHERE id = ?', [id]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Share “{account?.name}”</Text>
        <Text style={styles.sheetHint}>
          They see this account and its transactions on their own app and on
          the web — SMS parsing stays on your phone only.
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} style={{paddingHorizontal: 16}}>
          {(shares as any[]).map(s => (
            <View key={s.id} style={styles.shareRow}>
              <View style={styles.shareAvatar}>
                <Text style={styles.shareAvatarText}>
                  {(s.invitee_email ?? '?')[0]?.toUpperCase()}
                </Text>
              </View>
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={styles.shareEmail} numberOfLines={1}>
                  {s.invitee_email}
                </Text>
                <Text style={styles.shareMeta}>
                  {s.access === 'edit' ? 'Can view & edit' : 'View only'}
                  {' · '}
                  {s.status === 'active' ? 'active' : 'waiting for first sign-in'}
                </Text>
              </View>
              <Pressable onPress={() => revoke(s.id)} hitSlop={8}>
                <Icon name="X" size={16} color={T.expense} strokeWidth={2.2} />
              </Pressable>
            </View>
          ))}

          <Text style={styles.fieldLabel}>Invite by email</Text>
          <TextInput
            value={email}
            onChangeText={t => {
              setEmail(t);
              setError('');
            }}
            placeholder="wife@example.com"
            placeholderTextColor={T.text3}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.emailInput}
          />
          <View style={styles.accessRow}>
            {(
              [
                ['view', 'View only'],
                ['edit', 'Can view & edit'],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setAccess(id)}
                style={[styles.accessBtn, access === id && styles.accessBtnActive]}>
                <Text
                  style={[
                    styles.accessText,
                    access === id && {color: T.accent},
                  ]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.shareError}>{error}</Text> : null}
        </ScrollView>

        <Pressable
          onPress={share}
          disabled={busy || !email.trim()}
          style={({pressed}) => [
            styles.shareSave,
            {opacity: busy || !email.trim() ? 0.5 : pressed ? 0.85 : 1},
          ]}>
          <Icon name="Send" size={15} color={T.accentInk} strokeWidth={2.4} />
          <Text style={styles.shareSaveText}>{busy ? 'Sharing…' : 'Share account'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function dayLabel(dt: string): string {
  const date = new Date(dt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {return 'Today';}
  if (date.toDateString() === yesterday.toDateString()) {return 'Yesterday';}
  return format(date, 'MMM d, yyyy');
}

export default function AccountDetails({route, navigation}: any) {
  const {accountId} = route.params;
  const {userId} = useCurrentUser();
  const tabBarHeight = useBottomTabBarHeight();
  const [shareOpen, setShareOpen] = useState(false);

  // No owner filter: shared-in accounts carry the sharer's owner_id, and the
  // local DB only ever holds rows this user is allowed to see.
  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE id = ?',
    [accountId],
  );

  const {data: transactions} = useQuery(
    'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.account_id = ? ORDER BY t.date_time DESC',
    [accountId],
  );

  const account = (accounts as any[])[0];
  const isOwner = account?.owner_id === userId;

  const {totalIncome, totalExpense, sections} = useMemo(() => {
    let income = 0;
    let expense = 0;
    const groups: Record<string, any[]> = {};

    for (const t of transactions as any[]) {
      // transfers are net-zero across the user's accounts — not income/spend
      if (t.transaction_type === 'income') {income += t.amount ?? 0;}
      else if (t.transaction_type === 'expense') {expense += t.amount ?? 0;}

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

    return {totalIncome: income, totalExpense: expense, sections: secs};
  }, [transactions]);

  if (!account) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Account not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tint = accountTint(account.name ?? '');
  const icon = accountIcon(account.name ?? '', account.type ?? '');

  return (
    <SafeAreaView style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={({item}) => <TxRow tx={item} />}
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
        ListHeaderComponent={
          <>
            {/* Back + title + share */}
            <View style={styles.header}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
                <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.headerTitle} numberOfLines={1}>{account.name}</Text>
              {isOwner ? (
                <Pressable
                  onPress={() => setShareOpen(true)}
                  style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
                  <Icon name="Share2" size={16} color={T.info} strokeWidth={2.2} />
                </Pressable>
              ) : (
                <View style={{width: 36}} />
              )}
            </View>

            {!isOwner && (
              <View style={styles.sharedBanner}>
                <Icon name="Users" size={14} color={T.info} strokeWidth={2.2} />
                <Text style={styles.sharedBannerText}>
                  Shared with you — updates sync from the owner's phone.
                </Text>
              </View>
            )}

            {/* Account summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View style={[styles.accountIcon, {backgroundColor: tint + '22'}]}>
                  <Icon name={icon} size={22} color={tint} strokeWidth={2} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={styles.accountType}>{account.type ?? 'Account'}</Text>
                </View>
              </View>
              <Text style={styles.balanceLabel}>Current balance</Text>
              <Text style={styles.balanceValue}>
                RWF {fmtAmount(account.available_balance ?? 0)}
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Icon name="TrendingUp" size={14} color={T.income} strokeWidth={2.2} />
                  <View>
                    <Text style={styles.statLabel}>Total income</Text>
                    <Text style={[styles.statValue, {color: T.income}]}>
                      +RWF {fmtAmount(totalIncome)}
                    </Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Icon name="TrendingDown" size={14} color={T.expense} strokeWidth={2.2} />
                  <View>
                    <Text style={styles.statLabel}>Total expenses</Text>
                    <Text style={[styles.statValue, {color: T.expense}]}>
                      -RWF {fmtAmount(totalExpense)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Section label */}
            {(transactions as any[]).length > 0 && (
              <Text style={styles.sectionLabel}>All transactions</Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="Receipt" size={38} color={T.text3} strokeWidth={1.4} />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        }
        contentContainerStyle={[styles.list, {paddingBottom: tabBarHeight + 28}]}
        stickySectionHeadersEnabled={false}
      />

      {isOwner && (
        <ShareSheet
          visible={shareOpen}
          account={account}
          onClose={() => setShareOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  list: {paddingBottom: 80},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {flex: 1, fontFamily: FONTS.semibold, fontSize: 16, color: T.text, textAlign: 'center'},
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 4,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {fontFamily: FONTS.semibold, fontSize: 14.5, color: T.text},
  accountType: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 1},
  balanceLabel: {fontFamily: FONTS.medium, fontSize: 12, color: T.text3},
  balanceValue: {fontFamily: FONTS.bold, fontSize: 26, color: T.text, marginBottom: 12},
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 12,
    marginTop: 4,
  },
  stat: {flexDirection: 'row', flex: 1, gap: 8, alignItems: 'center'},
  statDivider: {width: 1, height: 32, backgroundColor: T.border, marginHorizontal: 12},
  statLabel: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  statValue: {fontFamily: FONTS.semibold, fontSize: 13},
  sectionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionDate: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text3, textTransform: 'uppercase', letterSpacing: 0.5},
  dayTotals: {flexDirection: 'row', gap: 10},
  dayIn: {fontFamily: FONTS.semibold, fontSize: 12, color: T.income},
  dayOut: {fontFamily: FONTS.semibold, fontSize: 12, color: T.expense},
  empty: {alignItems: 'center', paddingTop: 40, gap: 8},
  emptyText: {fontFamily: FONTS.regular, fontSize: 14, color: T.text3},
  notFound: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  notFoundText: {fontFamily: FONTS.regular, fontSize: 14, color: T.text2},
  sharedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: 'rgba(96,165,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.22)',
  },
  sharedBannerText: {flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: T.text2},
  // share sheet
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
    lineHeight: 16,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 7,
  },
  shareAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(96,165,250,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAvatarText: {fontFamily: FONTS.bold, fontSize: 13, color: T.info},
  shareEmail: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.text},
  shareMeta: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text3, marginTop: 1},
  fieldLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text2,
    marginTop: 10,
    marginBottom: 8,
  },
  emailInput: {
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
  accessRow: {flexDirection: 'row', gap: 8, marginTop: 10},
  accessBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  accessBtnActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.35)'},
  accessText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2},
  shareError: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.expense, marginTop: 8},
  shareSave: {
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
  shareSaveText: {fontFamily: FONTS.bold, fontSize: 15, color: T.accentInk},
});
