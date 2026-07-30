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
import {
  CATS,
  CategoryId,
  FONTS,
  R,
  T,
  accountIcon,
  accountTint,
  fmtAmount,
  resolveCat,
} from '../theme';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Balance-movement sign as originally recorded — changing the TYPE
// re-classifies the record, it does not move money again.
function movementSign(txType: string, transferDirection?: string | null): number {
  if (txType === 'income') {
    return 1;
  }
  if (txType === 'transfer') {
    return transferDirection === 'in' ? 1 : -1;
  }
  return -1;
}

interface SplitRow {
  category: CategoryId;
  amount: number;
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
  const [category, setCategory] = useState<CategoryId>(resolveCat(tx.category ?? ''));
  const [subcategory, setSubcategory] = useState<string>(tx.subcategory ?? '');
  const [accountId, setAccountId] = useState<string>(tx.account_id ?? '');
  const [note, setNote] = useState<string>(tx.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Split editor
  const [parts, setParts] = useState<SplitRow[]>(
    (splits as any[]).map(s => ({
      category: resolveCat(s.category ?? ''),
      amount: s.amount ?? 0,
    })),
  );
  const [partCat, setPartCat] = useState<CategoryId | null>(null);
  const [partAmount, setPartAmount] = useState('');

  const isTransfer = txType === 'transfer';
  const subcats = subcatsFor(category);
  const numericAmount = Math.abs(parseInt(amount, 10) || 0);
  const partsTotal = parts.reduce((s, p) => s + p.amount, 0);
  const remaining = numericAmount - partsTotal;

  const addPart = () => {
    const amt = parseInt(partAmount.replace(/\D/g, ''), 10) || 0;
    if (!partCat || amt <= 0) {
      return;
    }
    setParts(prev => [...prev, {category: partCat, amount: amt}]);
    setPartCat(null);
    setPartAmount('');
    setError('');
  };

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
    if (parts.length > 0 && remaining !== 0) {
      setError(
        remaining > 0
          ? `Split parts leave ${fmtAmount(remaining)} RWF unallocated`
          : `Split parts exceed the amount by ${fmtAmount(-remaining)} RWF`,
      );
      return;
    }
    setBusy(true);
    try {
      const sign = movementSign(tx.transaction_type ?? 'expense', tx.transfer_direction);
      const newAccountId = accountId || tx.account_id;
      // Only touch balances when the money actually moved. Reclassifying a
      // transaction (category, subcategory, merchant, note, splits) leaves every
      // balance exactly where it was, so the revert/re-apply pair below is a
      // no-op that still costs two `accounts` UPDATEs — and for a shared editor
      // those UPDATEs are refused by RLS, upload-fail, and get retried forever,
      // blocking every write queued behind them.
      const movedMoney =
        numericAmount !== Math.round(tx.amount ?? 0) || newAccountId !== tx.account_id;
      if (movedMoney) {
        // revert the original effect from the original account
        if (tx.account_id) {
          await db.execute(
            'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
            [sign * (tx.amount ?? 0), tx.account_id],
          );
        }
        // apply the (possibly new) amount to the (possibly new) account
        if (newAccountId) {
          await db.execute(
            'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
            [sign * numericAmount, newAccountId],
          );
        }
      }
      const transferDirection =
        txType === 'transfer'
          ? tx.transfer_direction ?? (sign > 0 ? 'in' : 'out')
          : null;
      await db.execute(
        'UPDATE transactions SET amount = ?, account_id = ?, category = ?, subcategory = ?, merchant = ?, note = ?, transaction_type = ?, transfer_direction = ? WHERE id = ?',
        [
          numericAmount,
          newAccountId,
          isTransfer ? tx.category ?? '' : CATS[category]?.label ?? category,
          isTransfer ? '' : subcategory,
          merchant,
          note,
          txType,
          transferDirection,
          tx.id,
        ],
      );
      // splits replaced atomically
      await db.execute('DELETE FROM split_details WHERE transaction_id = ?', [tx.id]);
      for (const p of parts) {
        await db.execute(
          'INSERT INTO split_details (id, transaction_id, amount, category, subcategory, note, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid(), tx.id, p.amount, CATS[p.category]?.label ?? p.category, '', '', userId ?? ''],
        );
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
                onPress={() => setTxType(t.id)}
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

        {/* Category grid (vertical wrap — no horizontal scrolling) */}
        {!isTransfer && (
          <>
            <Text style={styles.label}>Category</Text>
            <View style={styles.catGrid}>
              {(Object.values(CATS) as {id: CategoryId; label: string; color: string}[]).map(c => {
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

        {/* Split */}
        {!isTransfer && (
          <>
            <View style={styles.splitHead}>
              <Text style={[styles.label, {marginTop: 0, marginBottom: 0}]}>Split across categories</Text>
              {parts.length > 0 && (
                <Text
                  style={[
                    styles.remaining,
                    {color: remaining === 0 ? T.accent : remaining < 0 ? T.expense : T.text2},
                  ]}>
                  {remaining === 0
                    ? 'fully allocated'
                    : remaining > 0
                    ? `${fmtAmount(remaining)} left`
                    : `${fmtAmount(-remaining)} over`}
                </Text>
              )}
            </View>
            <Text style={styles.hint}>
              Optional — reports use the parts instead of the single category.
            </Text>

            {parts.map((p, i) => (
              <View key={`${p.category}-${i}`} style={styles.splitRow}>
                <CatChip cat={p.category} size={30} />
                <Text style={styles.splitRowLabel} numberOfLines={1}>
                  {CATS[p.category].label}
                </Text>
                <Text style={styles.splitRowAmt}>{fmtAmount(p.amount)}</Text>
                <Pressable
                  onPress={() => setParts(prev => prev.filter((_, j) => j !== i))}
                  hitSlop={8}>
                  <Icon name="X" size={15} color={T.text3} strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}

            <View style={styles.wrapRow}>
              {(Object.values(CATS) as {id: CategoryId; label: string; color: string}[]).map(c => {
                const on = partCat === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setPartCat(on ? null : c.id)}
                    style={[
                      styles.subChip,
                      on && {borderColor: c.color, backgroundColor: c.color + '14'},
                    ]}>
                    <CatChip cat={c.id} size={20} />
                    <Text
                      style={[styles.subChipText, on && {color: T.text}]}
                      numberOfLines={1}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.splitAdderRow}>
              <TextInput
                value={partAmount}
                onChangeText={setPartAmount}
                keyboardType="numeric"
                placeholder={partCat ? `Amount for ${CATS[partCat].label}` : 'Pick a category above'}
                placeholderTextColor={T.text3}
                editable={!!partCat}
                style={[styles.input, {flex: 1, marginBottom: 0}]}
              />
              <Pressable
                onPress={addPart}
                disabled={!partCat || !partAmount}
                style={({pressed}) => [
                  styles.splitAddBtn,
                  {opacity: !partCat || !partAmount ? 0.4 : pressed ? 0.8 : 1},
                ]}>
                <Icon name="Plus" size={16} color={T.accentInk} strokeWidth={2.6} />
              </Pressable>
            </View>
          </>
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
  splitHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 6,
  },
  remaining: {fontFamily: FONTS.semibold, fontSize: 11.5},
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.surface,
    borderRadius: R.small,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 7,
  },
  splitRowLabel: {flex: 1, fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text},
  splitRowAmt: {fontFamily: FONTS.bold, fontSize: 12.5, color: T.text},
  splitAdderRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8},
  splitAddBtn: {
    width: 42,
    height: 42,
    borderRadius: R.small,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
