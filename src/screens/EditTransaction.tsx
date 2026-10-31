/**
 * Full-screen transaction editor — replaces the old bottom-sheet edit/split
 * modes, whose horizontal chip rows fought the sheet's pan gestures.
 * Everything here is a vertical wrap grid: no horizontal scrolling.
 */
import {usePowerSync, useQuery} from '@powersync/react-native';
import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {CatChip, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {useSubcategories} from '../hooks/useSubcategories';
import {partsFromRows, saveSplit} from '../tools/splits';
import {movementDelta, rebalanceAccount} from '../tools/balance';
import {
  CATS,
  CategoryId,
  FONTS,
  R,
  T,
  accountIcon,
  accountTint,
  fmtAmount,
  categoriesForDirection,
  categoriesForType,
  coerceForType,
  resolveCat,
} from '../theme';


// Which way a transaction moves its account. Used only to pick a transfer's
// direction when one is created by changing the type; the balance arithmetic
// itself is movementDelta, the same rule replay uses.
function movementSign(txType: string, transferDirection?: string | null): number {
  if (txType === 'income') {
    return 1;
  }
  if (txType === 'transfer') {
    return transferDirection === 'in' ? 1 : -1;
  }
  return -1;
}


const TYPE_CHOICES = [
  {id: 'expense', label: 'Money out'},
  {id: 'income', label: 'Money in'},
  {id: 'transfer', label: 'Transfer'},
];

function EditForm({tx, splits, accounts, navigation, canMoveMoney = true}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();
  const {subcatsFor} = useSubcategories();

  const [txType, setTxType] = useState<string>(tx.transaction_type ?? 'expense');
  const [amount, setAmount] = useState(String(Math.round(tx.amount ?? 0)));
  const [merchant, setMerchant] = useState<string>(tx.merchant || tx.payee || '');
  const [category, setCategory] = useState<CategoryId>(
    resolveCat(tx.category ?? '', tx.transaction_type, tx.transfer_direction),
  );
  const [subcategory, setSubcategory] = useState<string>(tx.subcategory ?? '');
  const [accountId, setAccountId] = useState<string>(tx.account_id ?? '');
  const [note, setNote] = useState<string>(tx.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isTransfer = txType === 'transfer';
  const subcats = subcatsFor(category);
  // Which way the money moves: fixed by the record (the amount's sign does not
  // change when it is re-typed), so a transfer can only take in- or out-going
  // transfer/loan categories.
  const inbound =
    tx.transaction_type === 'income' || (tx.transaction_type === 'transfer' && tx.transfer_direction === 'in');
  const catChoices = categoriesForType(txType).filter(id =>
    txType === 'transfer' ? categoriesForDirection(inbound ? 'in' : 'out').includes(id) : true,
  );
  // Re-typing keeps the IDEA where one exists (Family Support ↔ Money from
  // Family, savings in ↔ out) and never leaves a category invalid for the type.
  const changeType = (next: string) => {
    setTxType(next);
    setCategory(c => {
      const moved = coerceForType(c, next, inbound ? 'in' : 'out');
      if (moved !== c) {
        setSubcategory('');
      }
      return moved;
    });
  };
  const numericAmount = Math.abs(parseInt(amount, 10) || 0);
  const save = async () => {
    if (numericAmount <= 0) {
      setError('Enter an amount');
      return;
    }
    // Belt-and-braces: the inputs are already locked, but this is the check that
    // actually protects the sync queue, so it does not rely on the UI holding.
    if (
      !canMoveMoney &&
      (numericAmount !== Math.round(tx.amount ?? 0) ||
        (accountId || tx.account_id) !== tx.account_id)
    ) {
      setError('Only the account owner can change the amount or account.');
      return;
    }
    setBusy(true);
    try {
      const sign = movementSign(tx.transaction_type ?? 'expense', tx.transfer_direction);
      const newAccountId = accountId || tx.account_id;
      const transferDirection =
        txType === 'transfer'
          ? tx.transfer_direction ?? (sign > 0 ? 'in' : 'out')
          : null;
      // Reverse the OLD movement, then apply the NEW one — two different signs
      // whenever the type changed. This used to re-apply with the original sign
      // and ignore type changes entirely, so flipping an expense to income left a
      // manual-only balance off by twice the amount (the web drawer had the same
      // bug, fixed in 695eb0b). Replay already counted the type, so the two paths
      // disagreed about what an edit meant.
      const oldDelta = movementDelta(tx);
      const newDelta = movementDelta({
        ...tx,
        amount: numericAmount,
        transaction_type: txType,
        transfer_direction: transferDirection,
      });
      const deltas = new Map<string, number>();
      const add = (acc: string | null | undefined, dl: number) => {
        if (acc) {
          deltas.set(acc, (deltas.get(acc) ?? 0) + dl);
        }
      };
      add(tx.account_id, -oldDelta);
      add(newAccountId, newDelta);
      // Only touch balances when the money actually moved, and only as the owner.
      // A shared editor's `accounts` UPDATE is refused by RLS, upload-fails, and
      // blocks every write queued behind it; the owner's next replay corrects the
      // balance for an anchored account anyway.
      const movedMoney =
        canMoveMoney && [...deltas.values()].some(dl => Math.round(dl) !== 0);
      await db.execute(
        'UPDATE transactions SET amount = ?, account_id = ?, category = ?, subcategory = ?, merchant = ?, note = ?, transaction_type = ?, transfer_direction = ? WHERE id = ?',
        [
          numericAmount,
          newAccountId,
          // Stored as the v2 id, checked against the final type once more.
          coerceForType(category, txType, transferDirection ?? (inbound ? 'in' : 'out')),
          subcategory,
          merchant,
          note,
          txType,
          transferDirection,
          tx.id,
        ],
      );
      // Splitting lives in the Split sheet now (src/Components/SplitSheet.tsx).
      // Saving here keeps the parts that differ and recomputes the rest for the
      // new amount and category — so changing the amount can never leave a split
      // that over- or under-covers the transaction, which reports would then
      // count wrongly.
      if ((splits as any[]).length) {
        const before = {...tx, owner_id: tx.owner_id ?? userId ?? ''};
        const after = {
          ...before,
          amount: numericAmount,
          category: coerceForType(category, txType, transferDirection ?? (inbound ? 'in' : 'out')),
          subcategory,
          transaction_type: txType,
          transfer_direction: transferDirection,
        };
        await saveSplit(db, after, txType === 'transfer' ? [] : partsFromRows(before, splits));
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior="padding">
      <ScrollView
        style={{flex: 1}}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {/* Type */}
        <Text style={styles.label}>Type</Text>
        <View style={styles.typeRow}>
          {TYPE_CHOICES.map(t => {
            const on = txType === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => changeType(t.id)}
                style={[styles.typeChoice, on && styles.typeChoiceActive]}>
                <Text style={[styles.typeChoiceText, on && {color: T.accent}]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {isTransfer && tx.transaction_type !== 'transfer' && (
          <Text style={styles.hint}>
            Transfers move money between your own accounts — excluded from
            income & spending totals. Balances are not changed by re-typing.
          </Text>
        )}

        {/* Amount + merchant */}
        <Text style={styles.label}>Amount (RWF)</Text>
        <TextInput
          value={amount}
          onChangeText={t => {
            setAmount(t.replace(/\D/g, ''));
            setError('');
          }}
          keyboardType="numeric"
          editable={canMoveMoney}
          style={[styles.input, !canMoveMoney && styles.inputLocked]}
          placeholderTextColor={T.text3}
        />
        {!canMoveMoney && (
          <Text style={styles.hint}>
            This account is shared with you — you can recategorise, rename, note
            and split this transaction, but only its owner can change the amount
            or move it to another account.
          </Text>
        )}

        <Text style={styles.label}>Merchant / payee</Text>
        <TextInput
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Who"
          style={styles.input}
          placeholderTextColor={T.text3}
        />

        {/* Category grid (vertical wrap — no horizontal scrolling). Only the
            categories valid for this type: there is no income called Groceries,
            and a transfer picks own account / savings / loan. */}
        {(
          <>
            <Text style={styles.label}>Category</Text>
            <View style={styles.catGrid}>
              {catChoices.map(id => CATS[id]).map(c => {
                const on = category === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCategory(c.id);
                      setSubcategory('');
                    }}
                    style={[
                      styles.catCell,
                      on && {borderColor: c.color, backgroundColor: c.color + '14'},
                    ]}>
                    <CatChip cat={c.id} size={32} />
                    <Text style={[styles.catLabel, on && {color: T.text}]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {subcats.length > 0 && (
              <>
                <Text style={styles.label}>Subcategory</Text>
                <View style={styles.wrapRow}>
                  {subcats.map(s => {
                    const on = subcategory === s.name;
                    return (
                      <Pressable
                        key={s.name}
                        onPress={() => setSubcategory(on ? '' : s.name)}
                        style={[styles.subChip, on && styles.subChipActive]}>
                        <Text style={{fontSize: 12}}>{s.icon}</Text>
                        <Text
                          style={[styles.subChipText, on && {color: T.text}]}
                          numberOfLines={1}>
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}

        {/* Account — hidden entirely for a shared editor. The list only holds
            accounts this user OWNS, so every option would move the transaction
            out of the shared account and into their own books. */}
        {accounts.length > 0 && canMoveMoney && (
          <>
            <Text style={styles.label}>Account</Text>
            <View style={styles.wrapRow}>
              {accounts.map((a: any) => {
                const on = (accountId || tx.account_id) === a.id;
                const tint = accountTint(a.name ?? '');
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAccountId(a.id)}
                    style={[
                      styles.subChip,
                      on && {borderColor: tint, backgroundColor: tint + '18'},
                    ]}>
                    <Icon
                      name={accountIcon(a.name ?? '', a.type ?? '')}
                      size={14}
                      color={tint}
                      strokeWidth={2}
                    />
                    <Text
                      style={[styles.subChipText, on && {color: T.text}]}
                      numberOfLines={1}>
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Note */}
        <Text style={styles.label}>Note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional"
          style={styles.input}
          placeholderTextColor={T.text3}
        />

        {/* Splitting moved to the Split sheet (transaction detail → Split): the
            parts that differ, with the rest kept in this category automatically. */}
        {(splits as any[]).length > 0 && !isTransfer && (
          <Text style={styles.hint}>
            Split into {(splits as any[]).length} parts — saving keeps the parts and
            puts the rest in the category above.
          </Text>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Pressable
        onPress={save}
        disabled={busy}
        style={({pressed}) => [
          styles.saveBtn,
          {opacity: busy ? 0.5 : pressed ? 0.85 : 1, marginBottom: insets.bottom + 12},
        ]}>
        <Icon name="Check" size={17} color={T.accentInk} strokeWidth={2.6} />
        <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save changes'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

export default function EditTransaction({route, navigation}: any) {
  const {txId} = route.params;
  const {userId} = useCurrentUser();

  // No owner_id filter: a transaction on an account shared TO this user has the
  // sharer's owner_id, so scoping by it made the row invisible and this screen
  // render its empty state. The local DB only ever holds rows the user is
  // allowed to see (same reasoning as the accounts query in AccountDetails).
  const {data: txRows} = useQuery('SELECT * FROM transactions WHERE id = ?', [txId]);
  const {data: splits} = useQuery(
    'SELECT * FROM split_details WHERE transaction_id = ?',
    [txId],
  );
  const {data: accounts} = useQuery(
    'SELECT id, name, type FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  const tx = (txRows as any[])?.[0];
  // A shared editor may reclassify, but may not move money: RLS grants UPDATE
  // on transactions only — not on accounts — so changing the amount or the
  // account would write a balance this user cannot push upstream, and PowerSync
  // would retry that rejected write forever, blocking everything queued behind
  // it. Locking those two fields keeps the edit inside what the grant allows.
  const ownsTransaction = !!tx && tx.owner_id === userId;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>Edit transaction</Text>
      </View>
      {tx ? (
        <EditForm
          key={tx.id}
          tx={tx}
          splits={splits ?? []}
          accounts={accounts as any[]}
          navigation={navigation}
          canMoveMoney={ownsTransaction}
        />
      ) : (
        <View style={styles.center}>
          <Text style={styles.hint}>Transaction not found</Text>
        </View>
      )}
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
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  scroll: {padding: 16, paddingBottom: 24},
  label: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: T.text2,
    marginTop: 16,
    marginBottom: 8,
  },
  hint: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, lineHeight: 16, marginBottom: 8},
  input: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: R.small,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border2,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: T.text,
  },
  // Reads as deliberately unavailable rather than broken — the hint underneath
  // says who can change it.
  inputLocked: {
    color: T.text3,
    backgroundColor: T.bg,
    borderColor: T.border,
  },
  typeRow: {flexDirection: 'row', gap: 8},
  typeChoice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: R.small,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  typeChoiceActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.35)'},
  typeChoiceText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2},
  catGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  catCell: {
    width: '31%',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  catLabel: {fontFamily: FONTS.medium, fontSize: 10, color: T.text3, paddingHorizontal: 4},
  wrapRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 7},
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: R.small,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  subChipActive: {borderColor: T.accent, backgroundColor: T.accentSoft},
  subChipText: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text3, maxWidth: 150},
  // No longer flex:1 — it now sits inside a flexing column beside the subcategory.
  error: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.expense, textAlign: 'center', marginTop: 10},
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 15,
    borderRadius: R.card,
    backgroundColor: T.accent,
  },
  saveText: {fontFamily: FONTS.bold, fontSize: 15.5, color: T.accentInk},
});
