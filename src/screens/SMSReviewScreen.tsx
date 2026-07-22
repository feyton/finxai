import {usePowerSync, useQuery} from '@powersync/react-native';
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CATS, CategoryId, FONTS, R, T, accountIcon, accountTint, resolveCat} from '../theme';
import {CatChip, ConfPill, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {useSubcategories} from '../hooks/useSubcategories';
import {recordChannel, recordConfirmation, recordCorrection} from '../tools/merchantMemory';
import {extractBalance, regexExtract} from '../tools/claudeParser';
import {syncAccountBalance} from '../tools/balance';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const ALL_CATS = Object.values(CATS);

export interface Fix {
  merchant: string;
  category: CategoryId;
  subcategory: string;
  accountId: string;
  type: 'expense' | 'income' | 'transfer';
}

const FIX_TYPES: {id: Fix['type']; label: string}[] = [
  {id: 'expense', label: 'Money out'},
  {id: 'income', label: 'Money in'},
  {id: 'transfer', label: 'Transfer'},
];

// ── Full correction sheet: name + category + payment channel ───
function FixSheet({
  visible,
  record,
  accounts,
  onSave,
  onClose,
}: {
  visible: boolean;
  record: any;
  accounts: any[];
  onSave: (fix: Fix) => void;
  onClose: () => void;
}) {
  const [merchant, setMerchant] = useState('');
  const [cat, setCat] = useState<CategoryId>('shopping');
  const [subcategory, setSubcategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [fixType, setFixType] = useState<Fix['type']>('expense');
  const {subcatsFor} = useSubcategories();
  const subcats = subcatsFor(cat);

  // Re-seed local state each time the sheet opens for a record
  useEffect(() => {
    if (visible) {
      setMerchant(record.merchant || record.payee || '');
      setCat((resolveCat(record.category ?? '') as CategoryId) ?? 'shopping');
      setSubcategory(record.subcategory ?? '');
      setAccountId(record.account_id ?? '');
      setFixType(
        record.transaction_type === 'income'
          ? 'income'
          : record.transaction_type === 'transfer'
          ? 'transfer'
          : 'expense',
      );
    }
  }, [visible, record]);

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
        <Text style={styles.sheetTitle}>Fix this transaction</Text>
        <Text style={styles.sheetHint}>
          Your edits train the AI to tag future SMS correctly.
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Type — teaching "Transfer" here trains the AI for next time */}
          <Text style={styles.fixLabel}>Type</Text>
          <View style={styles.typeRow}>
            {FIX_TYPES.map(t => {
              const on = fixType === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setFixType(t.id)}
                  style={[styles.typeChoice, on && styles.typeChoiceActive]}>
                  <Text style={[styles.typeChoiceText, on && {color: T.accent}]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fixType === 'transfer' && (
            <Text style={styles.typeHint}>
              Between your own accounts — excluded from income & spending. The
              AI will remember this counterparty as a transfer.
            </Text>
          )}

          {/* Merchant name */}
          <Text style={styles.fixLabel}>Merchant name</Text>
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder="e.g. Simba Supermarket"
            placeholderTextColor={T.text3}
            style={styles.fixInput}
          />

          {/* Payment channel */}
          {accounts.length > 0 && (
            <>
              <Text style={styles.fixLabel}>Payment channel</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{gap: 8, paddingBottom: 4, paddingHorizontal: 16}}>
                {accounts.map(a => {
                  const on = accountId === a.id;
                  const tint = accountTint(a.name ?? '');
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => setAccountId(a.id)}
                      style={[styles.channelChip, on && {borderColor: tint, backgroundColor: tint + '18'}]}>
                      <Icon name={accountIcon(a.name ?? '', a.type ?? '')} size={14} color={tint} strokeWidth={2} />
                      <Text style={[styles.channelName, on && {color: T.text}]} numberOfLines={1}>
                        {a.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Category — irrelevant for transfers */}
          {fixType !== 'transfer' && (
          <>
          <Text style={styles.fixLabel}>Category</Text>
          <View style={styles.sheetGrid}>
            {ALL_CATS.map(c => {
              const active = c.id === cat;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setCat(c.id);
                    setSubcategory('');
                  }}
                  style={({pressed}) => [
                    styles.sheetItem,
                    active && {
                      borderColor: c.color + '55',
                      backgroundColor: c.color + '18',
                    },
                    {opacity: pressed ? 0.75 : 1},
                  ]}>
                  <View style={[styles.sheetIcon, {backgroundColor: c.color + '22'}]}>
                    <Icon name={c.icon} size={18} color={c.color} strokeWidth={2} />
                  </View>
                  <Text style={[styles.sheetLabel, active && {color: c.color}]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  {active && <Icon name="Check" size={13} color={c.color} strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </View>

          {/* Subcategory — fine-grained tracking under the category */}
          {subcats.length > 0 && (
            <>
              <Text style={styles.fixLabel}>Subcategory</Text>
              <View style={[styles.sheetGrid, {paddingTop: 0}]}>
                {subcats.map(s => {
                  const on = subcategory === s.name;
                  return (
                    <Pressable
                      key={s.name}
                      onPress={() => setSubcategory(on ? '' : s.name)}
                      style={({pressed}) => [
                        styles.subChip,
                        on && styles.subChipActive,
                        {opacity: pressed ? 0.75 : 1},
                      ]}>
                      <Text style={{fontSize: 12}}>{s.icon}</Text>
                      <Text style={[styles.subChipText, on && {color: T.text}]} numberOfLines={1}>
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
        </ScrollView>

        <Pressable
          onPress={() =>
            onSave({merchant: merchant.trim(), category: cat, subcategory, accountId, type: fixType})
          }
          style={({pressed}) => [styles.fixSave, {opacity: pressed ? 0.85 : 1}]}>
          <Icon name="Check" size={16} color={T.accentInk} strokeWidth={2.6} />
          <Text style={styles.fixSaveText}>Save & confirm</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ── Single SMS card ────────────────────────────────────────────
function SmsCard({
  record,
  accounts,
  onConfirm,
  onFix,
  onIgnore,
}: {
  record: any;
  accounts: any[];
  onConfirm: () => Promise<void>;
  onFix: (fix: Fix) => Promise<void>;
  onIgnore: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [fixSheet, setFixSheet] = useState(false);
  const localCat = (resolveCat(record.category ?? '') as CategoryId) ?? 'shopping';
  const isExpense = record.transaction_type === 'expense';
  const isTransfer = record.transaction_type === 'transfer';
  const sign = isTransfer ? '' : isExpense ? '-' : '+';
  const amtColor = isTransfer ? T.text2 : isExpense ? T.expense : T.income;

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  };

  const handleIgnore = async () => {
    setBusy(true);
    await onIgnore();
    setBusy(false);
  };

  const handleFix = async (fix: Fix) => {
    setFixSheet(false);
    setBusy(true);
    await onFix(fix);
    setBusy(false);
  };

  return (
    <View style={styles.card}>
      {/* Raw SMS */}
      <View style={styles.smsBox}>
        <Text style={styles.smsFrom} numberOfLines={1}>
          {record.sender ?? 'SMS'}
        </Text>
        <Text style={styles.smsBody}>{record.sms ?? '—'}</Text>
      </View>

      {/* AI interpretation */}
      <View style={styles.interp}>
        <View style={styles.interpRow}>
          <CatChip cat={localCat} size={38} />
          <View style={{flex: 1}}>
            <Text style={styles.merchant} numberOfLines={1}>
              {record.merchant || record.payee || 'Unknown'}
            </Text>
            <Text style={styles.catLabel}>
              {isTransfer
                ? 'Between your accounts'
                : CATS[localCat]?.label ?? localCat}
            </Text>
          </View>
          {isTransfer && (
            <View style={styles.transferPill}>
              <Icon name="ArrowLeftRight" size={11} color={T.info} strokeWidth={2.2} />
              <Text style={styles.transferPillText}>Transfer</Text>
            </View>
          )}
          <View style={{alignItems: 'flex-end', gap: 4}}>
            <Text style={[styles.amount, {color: amtColor}]}>
              {sign}
              {(record.amount ?? 0).toLocaleString()} RWF
            </Text>
            <ConfPill value={record.confidence ?? 0} />
          </View>
        </View>

        {record.fees > 0 && (
          <Text style={styles.feeNote}>Fee: {record.fees} RWF</Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleIgnore}
          disabled={busy}
          style={({pressed}) => [
            styles.btnIgnore,
            {opacity: pressed || busy ? 0.7 : 1},
          ]}>
          <Icon name="Ban" size={14} color={T.expense} strokeWidth={2.2} />
          <Text style={styles.btnIgnoreText}>Ignore</Text>
        </Pressable>
        <Pressable
          onPress={() => setFixSheet(true)}
          style={({pressed}) => [
            styles.btnFix,
            {opacity: pressed ? 0.75 : 1},
          ]}>
          <Icon name="Pencil" size={14} color={T.text2} strokeWidth={2.2} />
          <Text style={styles.btnFixText}>Fix</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          disabled={busy}
          style={({pressed}) => [
            styles.btnConfirm,
            {opacity: pressed || busy ? 0.75 : 1},
          ]}>
          {busy ? (
            <ActivityIndicator size="small" color={T.accentInk} />
          ) : (
            <>
              <Icon
                name="Check"
                size={14}
                color={T.accentInk}
                strokeWidth={2.6}
              />
              <Text style={styles.btnConfirmText}>Confirm</Text>
            </>
          )}
        </Pressable>
      </View>

      <FixSheet
        visible={fixSheet}
        record={record}
        accounts={accounts}
        onSave={handleFix}
        onClose={() => setFixSheet(false)}
      />
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────
export default function SMSReviewScreen({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();

  const {data: records} = useQuery(
    'SELECT * FROM auto_records WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  // ignored_sms keeps the raw body so the retriever never re-parses it.
  const handleIgnore = async (record: any) => {
    try {
      await db.execute(
        'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), record.sms ?? '', record.sender ?? '', 'user', userId, new Date().toISOString()],
      );
      await db.execute('DELETE FROM auto_records WHERE id = ?', [record.id]);
    } catch (e) {
      console.warn('[SMSReview] ignore error:', e);
    }
  };

  const handleConfirm = async (record: any) => {
    try {
      const txType =
        record.transaction_type === 'income'
          ? 'income'
          : record.transaction_type === 'transfer'
          ? 'transfer'
          : 'expense';
      const now = new Date().toISOString();
      const dir = regexExtract(record.sms ?? '').direction;
      const bal = extractBalance(record.sms ?? '');
      await db.execute(
        `INSERT INTO transactions
           (id, amount, account_id, category, subcategory, date_time, sms, sender,
            payee, merchant, transaction_type, fees, currency,
            confirmed, source, confidence,
            transfer_account_id, transfer_direction, balance_after,
            owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          record.amount,
          record.account_id,
          record.category,
          record.subcategory ?? '',
          record.date_time,
          record.sms,
          record.sender,
          record.payee,
          record.merchant,
          txType,
          record.fees ?? 0,
          record.confidence ?? 0,
          txType === 'transfer' ? record.transfer_account_id ?? null : null,
          txType === 'transfer' ? (dir === 'credit' ? 'in' : 'out') : null,
          bal,
          userId,
          now,
        ],
      );

      // Recompute from the full history (anchor + replay) rather than
      // trusting this one SMS's balance in isolation — pending records can
      // be confirmed in any order, and blindly writing "whatever this SMS
      // says" leaves a stale balance if an older one is confirmed last.
      await syncAccountBalance(db, record.account_id);

      await db.execute('DELETE FROM auto_records WHERE id = ?', [record.id]);

      // Confirming a transfer reinforces the transfer rule for that
      // counterparty; otherwise the category rule as before.
      if (record.merchant) {
        await recordConfirmation(
          db,
          record.merchant,
          txType === 'transfer' ? 'transfer' : record.category,
          userId!,
        );
      }
    } catch (e) {
      console.warn('[SMSReview] confirm error:', e);
    }
  };

  const handleFix = async (record: any, fix: Fix) => {
    try {
      // The USER's chosen type wins — this is where "set as transfer" during
      // review happens (and trains the AI below).
      const txType = fix.type;
      const now = new Date().toISOString();
      const merchant = fix.merchant || record.merchant || record.payee || '';
      const accountId = fix.accountId || record.account_id;
      const fixDir = regexExtract(record.sms ?? '').direction;
      const bal = extractBalance(record.sms ?? '');
      await db.execute(
        `INSERT INTO transactions
           (id, amount, account_id, category, subcategory, date_time, sms, sender,
            payee, merchant, transaction_type, fees, currency,
            confirmed, source, confidence,
            transfer_account_id, transfer_direction, balance_after,
            owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          record.amount,
          accountId,
          txType === 'transfer' ? record.category : fix.category,
          txType === 'transfer' ? '' : fix.subcategory ?? '',
          record.date_time,
          record.sms,
          record.sender,
          record.payee,
          merchant,
          txType,
          record.fees ?? 0,
          record.confidence ?? 0,
          txType === 'transfer' ? record.transfer_account_id ?? null : null,
          txType === 'transfer' ? (fixDir === 'credit' ? 'in' : 'out') : null,
          bal,
          userId,
          now,
        ],
      );

      // Recompute from the full history for whichever account actually
      // received this transaction (anchor + replay — see handleConfirm).
      await syncAccountBalance(db, accountId);

      await db.execute('DELETE FROM auto_records WHERE id = ?', [record.id]);

      // Train the AI: 'transfer' is a learned outcome just like a category —
      // this counterparty will auto-classify as a transfer next time (and a
      // real category explicitly teaches "NOT a transfer").
      if (merchant) {
        await recordCorrection(
          db,
          merchant,
          txType === 'transfer' ? 'transfer' : fix.category,
          userId!,
        );
        if (record.sender && accountId) {
          await recordChannel(db, record.sender, accountId, userId!);
        }
      }
    } catch (e) {
      console.warn('[SMSReview] fix error:', e);
    }
  };

  const isEmpty = records.length === 0;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={20} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.headerTitle}>SMS Review</Text>
          {!isEmpty && (
            <Text style={styles.headerSub}>
              {records.length} transaction{records.length !== 1 ? 's' : ''}{' '}
              need a quick check
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => navigation.navigate('AISettings')}
          style={({pressed}) => [styles.settingsBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Settings2" size={19} color={T.text2} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Learning nudge */}
      {!isEmpty && (
        <View style={styles.nudge}>
          <Icon name="Sparkles" size={14} color={T.accent} strokeWidth={2.2} />
          <Text style={styles.nudgeText}>
            Every fix trains your AI — it won't make the same mistake twice
          </Text>
        </View>
      )}

      {isEmpty ? (
        // Empty state
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon
              name="CheckCircle"
              size={42}
              color={T.accent}
              strokeWidth={1.6}
            />
          </View>
          <Text style={styles.emptyTitle}>All sorted. Congz!</Text>
          <Text style={styles.emptySub}>
            Your AI parsed every SMS automatically.{'\n'}Check back after your
            next transaction.
          </Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({item}) => (
            <SmsCard
              record={item}
              accounts={accounts as any[]}
              onConfirm={() => handleConfirm(item)}
              onFix={fix => handleFix(item, fix)}
              onIgnore={() => handleIgnore(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 17,
    color: T.text,
    lineHeight: 22,
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: T.text3,
    lineHeight: 16,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: R.small,
    backgroundColor: T.accentSoft,
  },
  nudgeText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: T.accent,
    lineHeight: 17,
  },
  list: {paddingHorizontal: 16, paddingBottom: 32, gap: 12},
  // card
  card: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: T.border,
  },
  smsBox: {
    backgroundColor: T.surface2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  smsFrom: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    color: T.text3,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  smsBody: {
    fontFamily: 'monospace',
    fontSize: 11.5,
    color: T.text2,
    lineHeight: 18,
  },
  interp: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 6},
  interpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  merchant: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: T.text,
    lineHeight: 19,
  },
  catLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: T.text3,
    lineHeight: 16,
  },
  amount: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    lineHeight: 19,
  },
  feeNote: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: T.text3,
    paddingLeft: 48,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 6,
  },
  btnIgnore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: R.small,
    backgroundColor: 'rgba(251,113,133,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.22)',
  },
  btnIgnoreText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: T.expense,
  },
  transferPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    backgroundColor: 'rgba(96,165,250,0.12)',
    alignSelf: 'flex-start',
  },
  transferPillText: {fontFamily: FONTS.semibold, fontSize: 10.5, color: T.info},
  btnFix: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  btnFixText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: T.text2,
  },
  btnConfirm: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: R.small,
    backgroundColor: T.accent,
  },
  btnConfirmText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: T.accentInk,
  },
  // empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: T.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: T.text,
  },
  emptySub: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: T.text3,
    textAlign: 'center',
    lineHeight: 21,
  },
  // cat sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: R.large,
    borderTopRightRadius: R.large,
    paddingBottom: 32,
    maxHeight: '70%',
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
  },
  fixLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text2,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  typeRow: {flexDirection: 'row', gap: 8, marginHorizontal: 16},
  typeChoice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  typeChoiceActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.35)'},
  typeChoiceText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2},
  typeHint: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: T.text3,
    marginHorizontal: 16,
    marginTop: 8,
    lineHeight: 15,
  },
  fixInput: {
    marginHorizontal: 16,
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
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    marginLeft: 0,
  },
  channelName: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.text2, maxWidth: 120},
  fixSave: {
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
  fixSaveText: {fontFamily: FONTS.bold, fontSize: 15, color: T.accentInk},
  sheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  subChipActive: {borderColor: T.accent, backgroundColor: T.accentSoft},
  subChipText: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text3, maxWidth: 150},
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    width: '47%',
  },
  sheetIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sheetLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: T.text2,
  },
});
