// Shared transaction detail bottom sheet — used by RecordsPage and
// AccountDetails so both screens open a transaction the same way.
//
// Perf note: the sheet's CONTENT is always mounted (never conditionally
// `{selected && <TxDetail .../>}`), so tapping a row only ever updates props
// on an already-live component tree instead of paying a fresh mount cost
// (Gesture.Pan() setup, BottomSheetScrollView layout, icon rendering) on
// every single tap — that mount-per-tap was the "noticeable lag when
// opening a transaction" the always-live version fixes.
import BottomSheet, {BottomSheetScrollView} from '@gorhom/bottom-sheet';
import {usePowerSync, useQuery} from '@powersync/react-native';
import {format} from 'date-fns';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CATS, FONTS, R, T, fmtAmount, resolveCat} from '../theme';
import {syncAccountBalance} from '../tools/balance';
import {Icon} from './ui';

const SOURCE_LABEL: Record<string, string> = {
  sms: 'From SMS',
  ai: 'AI added',
  manual: 'Manual entry',
};

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export interface TransactionDetailSheetHandle {
  open: (tx: any) => void;
  close: () => void;
}

interface Props {
  navigation: any;
  // Ordered rows the parent screen is currently showing (post-filter/search)
  // — powers the prev/next swipe + arrows and the "n of N" position.
  flatList: any[];
  // false hides Edit/Delete — used for accounts shared to you as view-only.
  canEdit?: boolean;
}

function TransactionDetailSheet(
  {navigation, flatList, canEdit = true}: Props,
  ref: React.Ref<TransactionDetailSheetHandle>,
) {
  const db = usePowerSync();
  const sheetRef = useRef<BottomSheet>(null);
  const [selected, setSelected] = useState<any>(null);
  const snapPoints = useMemo(() => ['80%', '95%'], []);

  const {data: selectedSplits} = useQuery(
    'SELECT * FROM split_details WHERE transaction_id = ?',
    [selected?.id ?? ''],
  );

  useImperativeHandle(
    ref,
    () => ({
      open: (tx: any) => {
        setSelected(tx);
        sheetRef.current?.snapToIndex(0);
      },
      close: () => sheetRef.current?.close(),
    }),
    [],
  );

  const selectedIndex = useMemo(
    () => (selected ? flatList.findIndex((t: any) => t.id === selected.id) : -1),
    [flatList, selected],
  );

  const goStep = useCallback(
    (dir: 1 | -1) => {
      setSelected((prev: any) => {
        if (!prev) {return prev;}
        const idx = flatList.findIndex((t: any) => t.id === prev.id);
        if (idx < 0) {return prev;}
        return flatList[idx + dir] ?? prev;
      });
    },
    [flatList],
  );

  const editSelected = useCallback(() => {
    if (!selected) {return;}
    const id = selected.id;
    sheetRef.current?.close();
    setSelected(null);
    navigation.navigate('EditTransaction', {txId: id});
  }, [navigation, selected]);

  const deleteSelected = useCallback(async () => {
    if (!selected) {return;}
    const accountId = selected.account_id;
    await db.execute('DELETE FROM split_details WHERE transaction_id = ?', [selected.id]);
    await db.execute('DELETE FROM transactions WHERE id = ?', [selected.id]);
    // Full recompute (anchor + replay) rather than a manual decrement — a
    // deleted row can shift which record is the newest bank-reported anchor.
    if (accountId) {
      await syncAccountBalance(db, accountId);
    }
    sheetRef.current?.close();
    setSelected(null);
  }, [db, selected]);

  // Horizontal swipe steps transactions; clearly-vertical drags stay with the
  // sheet/scroll (activeOffsetX vs failOffsetY keeps the gestures apart).
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-15, 15])
        .failOffsetY([-12, 12])
        .onEnd(e => {
          if (e.translationX <= -56) {
            goStep(1); // swipe left → next (older)
          } else if (e.translationX >= 56) {
            goStep(-1); // swipe right → previous (newer)
          }
        }),
    [goStep],
  );

  const tx = selected;
  const catId = tx ? resolveCat(tx.category ?? '') : 'shopping';
  const cat = CATS[catId];
  const isIncome = tx?.transaction_type === 'income';
  const isTransfer = tx?.transaction_type === 'transfer';
  const dateStr = tx?.date_time ? format(new Date(tx.date_time), 'MMM d, yyyy  ·  HH:mm') : '—';
  const conf = tx?.confidence != null && tx.confidence < 1 ? ` · ${Math.round(tx.confidence * 100)}%` : '';
  const sourceStr = tx ? (SOURCE_LABEL[tx.source] ?? 'Manual entry') + conf : '';
  const splits = (selectedSplits as any[]) ?? [];

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      // The sheet's pan must not fight the horizontal tx-swipe: only
      // clearly-vertical drags move the sheet, and any horizontal movement
      // makes the sheet's gesture FAIL outright (no up/down jitter while
      // swiping between transactions).
      activeOffsetY={[-12, 12]}
      failOffsetX={[-15, 15]}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      // Deliberately NOT clearing `selected` on close: once the content tree
      // below has mounted for the first time, it stays mounted for the rest
      // of this screen visit (invisible while the sheet is closed) and every
      // later open just updates its props — the alternative (tearing it down
      // on every close, as the old `{selected && <TxDetail key=.../>}` did)
      // is what made EVERY tap pay a full mount cost: fresh Gesture.Pan(),
      // fresh BottomSheetScrollView layout, fresh icon rendering.
      >
      <BottomSheetScrollView contentContainerStyle={styles.detail}>
        {!tx ? (
          <View style={{height: 1}} />
        ) : (
          <GestureDetector gesture={swipe}>
            <View>
              {/* Prev / next navigation */}
              <View style={styles.navRow}>
                <Pressable
                  onPress={() => goStep(-1)}
                  disabled={selectedIndex <= 0}
                  hitSlop={10}
                  style={({pressed}) => [
                    styles.navBtn,
                    {opacity: selectedIndex <= 0 ? 0.3 : pressed ? 0.7 : 1},
                  ]}>
                  <Icon name="ChevronLeft" size={18} color={T.text2} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.navPos}>
                  {selectedIndex + 1} of {flatList.length}
                </Text>
                <Pressable
                  onPress={() => goStep(1)}
                  disabled={selectedIndex >= flatList.length - 1}
                  hitSlop={10}
                  style={({pressed}) => [
                    styles.navBtn,
                    {opacity: selectedIndex >= flatList.length - 1 ? 0.3 : pressed ? 0.7 : 1},
                  ]}>
                  <Icon name="ChevronRight" size={18} color={T.text2} strokeWidth={2.2} />
                </Pressable>
              </View>

              <View style={styles.detailTop}>
                <View style={[styles.detailIcon, {backgroundColor: (isTransfer ? T.info : cat.color) + '22'}]}>
                  <Icon
                    name={isTransfer ? 'ArrowLeftRight' : cat.icon}
                    size={22}
                    color={isTransfer ? T.info : cat.color}
                    strokeWidth={2}
                  />
                </View>
                <Text
                  style={[
                    styles.detailAmount,
                    {color: isTransfer ? T.text : isIncome ? T.income : T.expense},
                  ]}>
                  {isTransfer ? '' : isIncome ? '+' : '-'}RWF {fmtAmount(tx.amount ?? 0)}
                </Text>
                <Text style={styles.detailLabel}>{tx.merchant || tx.payee || cat.label}</Text>
                {isTransfer && (
                  <Text style={styles.detailSub}>Transfer between your accounts</Text>
                )}
              </View>

              <View style={styles.infoCard}>
                {!isTransfer && (
                  <>
                    <InfoRow
                      label="Category"
                      value={cat.label + (tx.subcategory ? ` · ${tx.subcategory}` : '')}
                    />
                    <View style={styles.infoDivider} />
                  </>
                )}
                <InfoRow label="Account" value={tx.account_name ?? '—'} />
                <View style={styles.infoDivider} />
                <InfoRow label="When" value={dateStr} />
                <View style={styles.infoDivider} />
                <InfoRow label="Source" value={sourceStr} />
                {tx.balance_after != null && (
                  <>
                    <View style={styles.infoDivider} />
                    <InfoRow
                      label="Balance after"
                      value={`RWF ${fmtAmount(tx.balance_after)} (bank-reported)`}
                    />
                  </>
                )}
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

              {splits.length > 0 && (
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Split into</Text>
                  </View>
                  {splits.map((s: any) => {
                    const sc = CATS[resolveCat(s.category ?? '')];
                    return (
                      <View key={s.id} style={styles.infoRow}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                          <View style={[styles.splitDot, {backgroundColor: sc.color}]} />
                          <Text style={styles.infoValue}>{sc.label}</Text>
                        </View>
                        <Text style={styles.infoValue}>RWF {fmtAmount(s.amount ?? 0)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {canEdit && (
                <View style={styles.detailBtns}>
                  <Pressable
                    onPress={editSelected}
                    style={({pressed}) => [styles.editBtn, {opacity: pressed ? 0.8 : 1}]}>
                    <Icon name="Pencil" size={15} color={T.accent} strokeWidth={2.2} />
                    <Text style={styles.editBtnText}>
                      {isTransfer ? 'Edit' : 'Edit / Split'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={deleteSelected}
                    style={({pressed}) => [styles.deleteBtn, {opacity: pressed ? 0.7 : 1}]}>
                    <Icon name="Trash2" size={16} color={T.expense} strokeWidth={2} />
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </GestureDetector>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

export default forwardRef(TransactionDetailSheet);

const styles = StyleSheet.create({
  sheetBg: {backgroundColor: T.surface},
  handle: {backgroundColor: T.border2},
  detail: {paddingHorizontal: 20, paddingBottom: 28},
  detailTop: {alignItems: 'center', paddingVertical: 8, gap: 4},
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 2,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPos: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text3},
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
  splitDot: {width: 8, height: 8, borderRadius: 4},
  detailBtns: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
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
});
