import BottomSheet, {BottomSheetView} from '@gorhom/bottom-sheet';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, accountIcon, accountTint, fmtAmount} from '../theme';

function AccountCard({
  account,
  onPress,
  onLongPress,
}: {
  account: any;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const tint = accountTint(account.name ?? '');
  const icon = accountIcon(account.name ?? '', account.type ?? '');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({pressed}) => [styles.accountCard, {opacity: pressed ? 0.85 : 1}]}>
      <View style={[styles.accountIconCircle, {backgroundColor: tint + '22'}]}>
        <Icon name={icon} size={22} color={tint} strokeWidth={2} />
      </View>
      <View style={styles.accountMid}>
        <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
        <Text style={styles.accountType}>{account.type ?? 'Account'}</Text>
      </View>
      <View style={styles.accountRight}>
        <Text style={styles.accountBalance}>
          RWF {fmtAmount(account.available_balance ?? 0)}
        </Text>
        {account.number ? (
          <Text style={styles.accountNumber}>{account.number}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function AccountsPage({navigation}: any) {
  const {userId} = useCurrentUser();
  const db = usePowerSync();

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );

  const totalBalance = useMemo(
    () =>
      (accounts as any[]).reduce(
        (s: number, a: any) => s + (a.available_balance ?? 0),
        0,
      ),
    [accounts],
  );

  const [toDelete, setToDelete] = useState<any>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['30%'], []);

  const openDeleteSheet = (account: any) => {
    setToDelete(account);
    sheetRef.current?.snapToIndex(0);
  };

  const confirmDelete = useCallback(async () => {
    if (!toDelete) {return;}
    await db.execute('DELETE FROM transactions WHERE account_id = ?', [toDelete.id]);
    await db.execute('DELETE FROM accounts WHERE id = ?', [toDelete.id]);
    sheetRef.current?.close();
    setToDelete(null);
  }, [db, toDelete]);

  const tabBarHeight = useBottomTabBarHeight();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Accounts</Text>
        <Pressable
          onPress={() => navigation.navigate('CreateAccount')}
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Plus" size={18} color={T.accentInk} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Total balance card */}
      {(accounts as any[]).length > 0 && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total balance</Text>
          <Text style={styles.totalBalance}>RWF {fmtAmount(totalBalance)}</Text>
          <Text style={styles.totalSub}>{(accounts as any[]).length} account{(accounts as any[]).length !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {/* Accounts list */}
      <FlatList
        data={accounts as any[]}
        keyExtractor={(a: any) => a.id}
        renderItem={({item}) => (
          <AccountCard
            account={item}
            onPress={() => navigation.navigate('AccountDetails', {accountId: item.id})}
            onLongPress={() => openDeleteSheet(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="Landmark" size={42} color={T.text3} strokeWidth={1.4} />
            <Text style={styles.emptyText}>No accounts yet</Text>
            <Pressable
              onPress={() => navigation.navigate('CreateAccount')}
              style={({pressed}) => [styles.emptyBtn, {opacity: pressed ? 0.7 : 1}]}>
              <Icon name="Plus" size={15} color={T.accentInk} strokeWidth={2.5} />
              <Text style={styles.emptyBtnText}>Add account</Text>
            </Pressable>
          </View>
        }
        contentContainerStyle={[styles.list, {paddingBottom: tabBarHeight + 28}]}
      />

      {/* Delete confirm sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
        onChange={i => {
          if (i === -1) {setToDelete(null);}
        }}>
        <BottomSheetView style={styles.sheetContent}>
          {toDelete && (
            <View style={styles.deleteSheet}>
              <Text style={styles.deleteTitle}>Delete account?</Text>
              <Text style={styles.deleteSub}>
                "{toDelete.name}" and all its transactions will be permanently removed.
              </Text>
              <View style={styles.deleteActions}>
                <Pressable
                  onPress={() => sheetRef.current?.close()}
                  style={({pressed}) => [styles.cancelBtn, {opacity: pressed ? 0.7 : 1}]}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  style={({pressed}) => [styles.confirmDeleteBtn, {opacity: pressed ? 0.7 : 1}]}>
                  <Icon name="Trash2" size={15} color={T.expense} strokeWidth={2} />
                  <Text style={styles.confirmDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        </BottomSheetView>
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
    paddingBottom: 12,
  },
  title: {fontFamily: FONTS.bold, fontSize: 20, color: T.text},
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 18,
  },
  totalLabel: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.text3, marginBottom: 4},
  totalBalance: {fontFamily: FONTS.bold, fontSize: 26, color: T.text},
  totalSub: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 2},
  list: {paddingHorizontal: 16, paddingBottom: 100},
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
  },
  accountIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  accountMid: {flex: 1},
  accountName: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  accountType: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 1},
  accountRight: {alignItems: 'flex-end'},
  accountBalance: {fontFamily: FONTS.bold, fontSize: 14, color: T.text},
  accountNumber: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, marginTop: 1},
  separator: {height: 8},
  empty: {alignItems: 'center', paddingTop: 80, gap: 10},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 15, color: T.text2, marginTop: 4},
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: R.pill,
    marginTop: 6,
  },
  emptyBtnText: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.accentInk},
  sheetBg: {backgroundColor: T.surface},
  handle: {backgroundColor: T.border2},
  sheetContent: {flex: 1, paddingHorizontal: 20, paddingTop: 8},
  deleteSheet: {gap: 8},
  deleteTitle: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  deleteSub: {fontFamily: FONTS.regular, fontSize: 13.5, color: T.text2, lineHeight: 20},
  deleteActions: {flexDirection: 'row', gap: 10, marginTop: 16},
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: R.card,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  cancelText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  confirmDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: R.card,
    backgroundColor: 'rgba(251,113,133,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.25)',
  },
  confirmDeleteText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.expense},
});
