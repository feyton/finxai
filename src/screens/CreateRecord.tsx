import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {CatChip, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {useSubcategories} from '../hooks/useSubcategories';
import {CATS, CategoryId, FONTS, R, T, accountIcon, accountTint, fmtAmount, resolveCat} from '../theme';
import categoriesData from '../tools/data.json';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'];

type TxType = 'expense' | 'income' | 'transfer';

function AccountChips({
  accounts,
  activeId,
  onPick,
  excludeId,
}: {
  accounts: any[];
  activeId: string;
  onPick: (id: string) => void;
  excludeId?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.accountRow}>
      {accounts
        .filter(a => a.id !== excludeId)
        .map(a => {
          const on = activeId === a.id;
          const tint = accountTint(a.name ?? '');
          return (
            <Pressable
              key={a.id}
              onPress={() => onPick(a.id)}
              style={[styles.accountChip, on && {borderColor: tint, backgroundColor: tint + '18'}]}>
              <Icon name={accountIcon(a.name ?? '', a.type ?? '')} size={15} color={tint} strokeWidth={2} />
              <Text style={[styles.accountName, on && {color: T.text}]} numberOfLines={1}>
                {a.name}
              </Text>
            </Pressable>
          );
        })}
    </ScrollView>
  );
}

export default function CreateRecord({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('0');
  const [accountId, setAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // default to the first account once loaded
  const accountList = accounts as any[];
  const activeAccount = accountId || accountList[0]?.id || '';
  const isTransfer = type === 'transfer';

  const cats = useMemo(
    () =>
      categoriesData.categories.filter(c =>
        type === 'income' ? c.type === 'income' : c.type === 'expense',
      ),
    [type],
  );

  const {subcatsFor} = useSubcategories();
  const subcats = category ? subcatsFor(resolveCat(category)) : [];

  const press = (k: string) => {
    setError('');
    if (k === 'del') {
      setAmount(a => (a.length <= 1 ? '0' : a.slice(0, -1)));
      return;
    }
    setAmount(a => {
      const next = a === '0' ? k.replace(/^0+/, '') || '0' : a + k;
      // cap length to avoid overflow
      return next.replace(/\D/g, '').slice(0, 12) || '0';
    });
  };

  const numericAmount = parseInt(amount, 10) || 0;
  const canSave =
    numericAmount > 0 &&
    !!activeAccount &&
    !saving &&
    (!isTransfer || (!!toAccountId && toAccountId !== activeAccount));

  const saveTransfer = async () => {
    const from = accountList.find(a => a.id === activeAccount);
    const to = accountList.find(a => a.id === toAccountId);
    if (!from || !to) {
      setError('Pick both accounts');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      // Canonical transfer record + one transaction per side (each account's
      // history shows the movement; both sides are net-zero in reports).
      await db.execute(
        'INSERT INTO transfers (id, from_account_id, to_account_id, amount, date_time, note, currency, fees, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [generateUUID(), from.id, to.id, numericAmount, now, '', 'RWF', 0, userId ?? '', now],
      );
      await db.execute(
        `INSERT INTO transactions
           (id, amount, account_id, category, subcategory, date_time, confirmed,
            currency, payee, merchant, transaction_type, note, fees, budget_id,
            source, confidence, transfer_account_id, transfer_direction,
            owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'RWF', ?, ?, 'transfer', '', 0, NULL, 'manual', 1, ?, 'out', ?, ?)`,
        [generateUUID(), numericAmount, from.id, '', '', now, to.name, `To ${to.name}`, to.id, userId ?? '', now],
      );
      await db.execute(
        `INSERT INTO transactions
           (id, amount, account_id, category, subcategory, date_time, confirmed,
            currency, payee, merchant, transaction_type, note, fees, budget_id,
            source, confidence, transfer_account_id, transfer_direction,
            owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'RWF', ?, ?, 'transfer', '', 0, NULL, 'manual', 1, ?, 'in', ?, ?)`,
        [generateUUID(), numericAmount, to.id, '', '', now, from.name, `From ${from.name}`, from.id, userId ?? '', now],
      );
      await db.execute(
        'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
        [numericAmount, from.id],
      );
      await db.execute(
        'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
        [numericAmount, to.id],
      );
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
      setSaving(false);
    }
  };

  const save = async () => {
    if (!activeAccount) {
      setError('Add an account first');
      return;
    }
    if (numericAmount <= 0) {
      setError('Enter an amount');
      return;
    }
    if (isTransfer) {
      if (!toAccountId || toAccountId === activeAccount) {
        setError('Pick a different destination account');
        return;
      }
      await saveTransfer();
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await db.execute(
        'INSERT INTO transactions (id, amount, account_id, category, subcategory, date_time, confirmed, currency, payee, merchant, transaction_type, note, fees, budget_id, source, confidence, transfer_account_id, transfer_direction, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          generateUUID(),
          numericAmount,
          activeAccount,
          category || '',
          subcategory || '',
          now,
          1,
          'RWF',
          '',
          '',
          type,
          '',
          0,
          null,
          'manual',
          1,
          null,
          null,
          userId ?? '',
          now,
        ],
      );
      if (type === 'income') {
        await db.execute(
          'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
          [numericAmount, activeAccount],
        );
      } else {
        await db.execute(
          'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
          [numericAmount, activeAccount],
        );
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>Add transaction</Text>
        <View style={styles.typeToggle}>
          {(['expense', 'income', 'transfer'] as TxType[]).map(t => (
            <Pressable
              key={t}
              onPress={() => {
                setType(t);
                setCategory('');
                setSubcategory('');
                setError('');
              }}
              style={[styles.typeBtn, type === t && styles.typeBtnActive]}>
              <Text style={[styles.typeText, type === t && styles.typeTextActive]}>
                {t === 'expense' ? 'Out' : t === 'income' ? 'In' : 'Move'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Amount */}
      <View style={styles.amountWrap}>
        <Text
          style={[
            styles.amount,
            {
              color: isTransfer
                ? T.info
                : type === 'income'
                ? T.income
                : numericAmount > 0
                ? T.expense
                : T.text,
            },
          ]}>
          {isTransfer ? '' : type === 'income' ? '+' : numericAmount > 0 ? '-' : ''}
          {fmtAmount(numericAmount)}
          <Text style={styles.amountUnit}> RWF</Text>
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom: 8}}>
        {isTransfer ? (
          <>
            <View style={styles.tip}>
              <Icon name="ArrowLeftRight" size={15} color={T.info} strokeWidth={2.2} />
              <Text style={styles.tipText}>
                Move money between your own accounts — net-zero, excluded from
                income and spending.
              </Text>
            </View>
            {accountList.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>From</Text>
                <AccountChips
                  accounts={accountList}
                  activeId={activeAccount}
                  onPick={id => {
                    setAccountId(id);
                    if (id === toAccountId) {
                      setToAccountId('');
                    }
                  }}
                />
                <Text style={styles.sectionLabel}>To</Text>
                <AccountChips
                  accounts={accountList}
                  activeId={toAccountId}
                  onPick={setToAccountId}
                  excludeId={activeAccount}
                />
              </>
            )}
          </>
        ) : (
          <>
            {/* AI tip */}
            <View style={styles.tip}>
              <Icon name="Sparkles" size={15} color={T.accent} strokeWidth={2.2} />
              <Text style={styles.tipText}>
                Most expenses appear automatically from SMS — you rarely need this.
              </Text>
            </View>

            {/* Accounts */}
            {accountList.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Account</Text>
                <AccountChips
                  accounts={accountList}
                  activeId={activeAccount}
                  onPick={setAccountId}
                />
              </>
            )}

            {/* Categories */}
            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.catGrid}>
              {cats.map(c => {
                const id = resolveCat(c.name) as CategoryId;
                const meta = CATS[id];
                const on = category === c.name;
                return (
                  <Pressable
                    key={c.name}
                    onPress={() => {
                      setCategory(on ? '' : c.name);
                      setSubcategory('');
                    }}
                    style={[styles.catCell, on && {borderColor: meta.color, backgroundColor: meta.color + '14'}]}>
                    <CatChip cat={id} size={34} />
                    <Text style={[styles.catLabel, on && {color: T.text}]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Subcategories — fine-grained tracking under the category */}
            {subcats.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, {marginTop: 12}]}>Subcategory</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.accountRow}>
                  {subcats.map((s: any) => {
                    const on = subcategory === s.name;
                    return (
                      <Pressable
                        key={s.name}
                        onPress={() => setSubcategory(on ? '' : s.name)}
                        style={[styles.subChip, on && styles.subChipActive]}>
                        <Text style={{fontSize: 13}}>{s.icon}</Text>
                        <Text style={[styles.subChipText, on && {color: T.text}]} numberOfLines={1}>
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map(k => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            style={({pressed}) => [styles.key, {opacity: pressed ? 0.6 : 1}]}>
            {k === 'del' ? (
              <Icon name="Delete" size={20} color={T.text2} strokeWidth={2} />
            ) : (
              <Text style={styles.keyText}>{k}</Text>
            )}
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Save */}
      <Pressable
        onPress={save}
        disabled={!canSave}
        style={({pressed}) => [
          styles.saveBtn,
          {opacity: !canSave ? 0.5 : pressed ? 0.85 : 1, marginBottom: insets.bottom + 12},
        ]}>
        <Icon name="Check" size={17} color={T.accentInk} strokeWidth={2.6} />
        <Text style={styles.saveText}>
          {saving ? 'Saving…' : isTransfer ? 'Move money' : 'Save transaction'}
        </Text>
      </Pressable>
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
  title: {flex: 1, fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: T.surface2,
    borderRadius: R.pill,
    padding: 3,
    gap: 2,
  },
  typeBtn: {paddingHorizontal: 11, paddingVertical: 6, borderRadius: R.pill},
  typeBtnActive: {backgroundColor: T.accent},
  typeText: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text2},
  typeTextActive: {color: T.accentInk},
  amountWrap: {alignItems: 'center', paddingVertical: 14},
  amount: {fontFamily: FONTS.bold, fontSize: 34},
  amountUnit: {fontFamily: FONTS.medium, fontSize: 15, color: T.text3},
  tip: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 12,
    borderRadius: R.card,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  tipText: {flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: T.text2, lineHeight: 17},
  sectionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: T.text2,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  accountRow: {gap: 8, paddingHorizontal: 16, paddingBottom: 14},
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  accountName: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.text2, maxWidth: 120},
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  catCell: {
    width: '31%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  catLabel: {fontFamily: FONTS.medium, fontSize: 10.5, color: T.text3, paddingHorizontal: 4},
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: R.small,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  subChipActive: {borderColor: T.accent, backgroundColor: T.accentSoft},
  subChipText: {fontFamily: FONTS.medium, fontSize: 12, color: T.text3, maxWidth: 150},
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  key: {
    width: '33.33%',
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {fontFamily: FONTS.semibold, fontSize: 22, color: T.text},
  error: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.expense, textAlign: 'center', marginTop: 4},
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
