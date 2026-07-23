// Shared & Family — the sharing hub. Actual sharing happens from an
// account's detail page (Share button); this screen shows both directions:
// accounts shared TO you, and who you shared YOUR accounts with.
import {useQuery, usePowerSync} from '@powersync/react-native';
import {formatDistanceToNowStrict} from 'date-fns';
import React, {useState} from 'react';
import {Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {appAlert} from '../Components/AppDialog';
import {reconnect} from '../tools/database';
import {FONTS, R, T, accountIcon, accountTint, fmtAmount} from '../theme';

export default function SharedScreen({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const uid = userId ?? '';
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reconnect();
    } catch (e) {
      appAlert('Refresh failed', 'Could not reach FinXAI — check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Accounts other people shared to me (synced via the shared_accounts bucket)
  const {data: received} = useQuery(
    `SELECT s.id as share_id, s.access, s.created_at, a.*
     FROM account_shares s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.shared_with_id = ? AND s.status = 'active'
     ORDER BY s.created_at DESC`,
    [uid],
  );

  // Shares I granted on my own accounts
  const {data: given} = useQuery(
    `SELECT s.*, a.name as account_name, a.type as account_type
     FROM account_shares s
     LEFT JOIN accounts a ON a.id = s.account_id
     WHERE s.owner_id = ?
     ORDER BY s.created_at DESC`,
    [uid],
  );

  const revoke = (share: any) => {
    appAlert(
      'Revoke access?',
      `${share.invitee_email} will lose access to ${share.account_name ?? 'this account'} on their devices.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () =>
            db.execute('DELETE FROM account_shares WHERE id = ?', [share.id]),
        },
      ],
    );
  };

  const receivedList = received as any[];
  const givenList = given as any[];

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>Shared & Family</Text>
          <Text style={styles.subtitle}>Per-account access, both directions</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />
        }>
        {/* Privacy note */}
        <View style={styles.banner}>
          <Icon name="Lock" size={15} color={T.info} strokeWidth={2.2} />
          <Text style={styles.bannerText}>
            Access is per-account. SMS parsing always stays on the owner's
            phone — the other person only sees synced records.
          </Text>
        </View>

        {/* Shared with you */}
        <Text style={styles.sectionLabel}>Shared with you</Text>
        {receivedList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="Users" size={26} color={T.text3} strokeWidth={1.6} />
            <Text style={styles.emptyText}>
              Nothing yet — when someone shares an account to your email, it
              appears here and in your Accounts tab automatically.
            </Text>
          </View>
        ) : (
          <View style={{gap: 8}}>
            {receivedList.map(a => {
              const tint = accountTint(a.name ?? '');
              return (
                <Pressable
                  key={a.share_id}
                  onPress={() =>
                    navigation.navigate('Home', {
                      screen: 'AccountsStack',
                      params: {screen: 'AccountDetails', params: {accountId: a.id}},
                    })
                  }
                  style={({pressed}) => [styles.row, {opacity: pressed ? 0.85 : 1}]}>
                  <View style={[styles.rowIcon, {backgroundColor: tint + '22'}]}>
                    <Icon name={accountIcon(a.name ?? '', a.type ?? '')} size={18} color={tint} strokeWidth={2} />
                  </View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.rowSub}>
                      {a.access === 'edit' ? 'You can view & edit' : 'View only'}
                      {a.created_at
                        ? ` · shared ${formatDistanceToNowStrict(new Date(a.created_at), {addSuffix: true})}`
                        : ''}
                    </Text>
                  </View>
                  <View style={{alignItems: 'flex-end', gap: 2}}>
                    <Text style={styles.rowAmt}>RWF {fmtAmount(a.available_balance ?? 0)}</Text>
                    <Icon name="ChevronRight" size={14} color={T.text3} strokeWidth={2} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* You shared */}
        <Text style={styles.sectionLabel}>You shared</Text>
        {givenList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="Share2" size={26} color={T.text3} strokeWidth={1.6} />
            <Text style={styles.emptyText}>
              You haven't shared any account yet. Open an account and tap the
              share icon in its header.
            </Text>
          </View>
        ) : (
          <View style={{gap: 8}}>
            {givenList.map(s => (
              <View key={s.id} style={styles.row}>
                <View style={styles.shareAvatar}>
                  <Text style={styles.shareAvatarText}>
                    {(s.invitee_email ?? '?')[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {s.account_name ?? 'Account'}
                    <Text style={{color: T.text3}}>  →  {s.invitee_email}</Text>
                  </Text>
                  <Text style={styles.rowSub}>
                    {s.access === 'edit' ? 'Can view & edit' : 'View only'}
                    {' · '}
                    {s.status === 'active' ? (
                      <Text style={{color: T.income}}>active</Text>
                    ) : (
                      <Text style={{color: T.warn}}>waiting for first sign-in</Text>
                    )}
                  </Text>
                </View>
                <Pressable onPress={() => revoke(s)} hitSlop={10}>
                  <Icon name="X" size={16} color={T.expense} strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* CTA — sharing starts from the account page */}
        <Pressable
          onPress={() => navigation.navigate('Home', {screen: 'AccountsStack'})}
          style={({pressed}) => [styles.cta, {opacity: pressed ? 0.85 : 1}]}>
          <Icon name="Share2" size={16} color={T.accentInk} strokeWidth={2.2} />
          <Text style={styles.ctaText}>Share an account</Text>
        </Pressable>
        <Text style={styles.ctaHint}>
          Pick an account, then tap the share icon in its header.
        </Text>
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
    paddingBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, marginTop: 1},
  scroll: {padding: 16, paddingTop: 4, paddingBottom: 40},
  banner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: R.card,
    backgroundColor: 'rgba(96,165,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.22)',
    marginBottom: 6,
  },
  bannerText: {flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: T.text2, lineHeight: 17},
  sectionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 20,
  },
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: T.text3,
    textAlign: 'center',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTitle: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  rowSub: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, marginTop: 2},
  rowAmt: {fontFamily: FONTS.bold, fontSize: 12.5, color: T.text},
  shareAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(96,165,250,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shareAvatarText: {fontFamily: FONTS.bold, fontSize: 14, color: T.info},
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: R.card,
    backgroundColor: T.accent,
  },
  ctaText: {fontFamily: FONTS.bold, fontSize: 14.5, color: T.accentInk},
  ctaHint: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: T.text3,
    textAlign: 'center',
    marginTop: 8,
  },
});
