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
import {recordChannel, recordConfirmation, recordCorrection} from '../tools/merchantMemory';

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
  accountId: string;
}

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
  const [accountId, setAccountId] = useState('');

  // Re-seed local state each time the sheet opens for a record
  useEffect(() => {
    if (visible) {
      setMerchant(record.merchant || record.payee || '');
      setCat((resolveCat(record.category ?? '') as CategoryId) ?? 'shopping');
      setAccountId(record.account_id ?? '');
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

          {/* Category */}
          <Text style={styles.fixLabel}>Category</Text>
          <View style={styles.sheetGrid}>
            {ALL_CATS.map(c => {
              const active = c.id === cat;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCat(c.id)}
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
        </ScrollView>

        <Pressable
          onPress={() => onSave({merchant: merchant.trim(), category: cat, accountId})}
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
}: {
  record: any;
  accounts: any[];
  onConfirm: () => Promise<void>;
  onFix: (fix: Fix) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [fixSheet, setFixSheet] = useState(false);
  const localCat = (resolveCat(record.category ?? '') as CategoryId) ?? 'shopping';
  const isExpense = record.transaction_type === 'expense';
  const sign = isExpense ? '-' : '+';
  const amtColor = isExpense ? T.expense : T.income;

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm();
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
              {CATS[localCat]?.label ?? localCat}
            </Text>
          </View>
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

  const handleConfirm = async (record: any) => {
    try {
      const txType =
        record.transaction_type === 'income' ? 'income' : 'expense';
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO transactions
           (id, amount, account_id, category, date_time, sms, sender,
            payee, merchant, transaction_type, fees, currency,
            confirmed, source, confidence, owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?)`,
        [
          uuid(),
          record.amount,
          record.account_id,
          record.category,
          record.date_time,
          record.sms,
          record.sender,
          record.payee,
          record.merchant,
          txType,
          record.fees ?? 0,
          record.confidence ?? 0,
          userId,
          now,
        ],
      );

      const sign = txType === 'income' ? 1 : -1;
      await db.execute(
        'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
        [sign * (record.amount ?? 0), record.account_id],
      );

      await db.execute('DELETE FROM auto_records WHERE id = ?', [record.id]);

      if (record.merchant) {
        await recordConfirmation(db, record.merchant, record.category, userId!);
      }
    } catch (e) {
      console.warn('[SMSReview] confirm error:', e);
    }
  };

  const handleFix = async (record: any, fix: Fix) => {
    try {
      const txType =
        record.transaction_type === 'income' ? 'income' : 'expense';
      const now = new Date().toISOString();
      const merchant = fix.merchant || record.merchant || record.payee || '';
      const accountId = fix.accountId || record.account_id;
      await db.execute(
        `INSERT INTO transactions
           (id, amount, account_id, category, date_time, sms, sender,
            payee, merchant, transaction_type, fees, currency,
            confirmed, source, confidence, owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?)`,
        [
          uuid(),
          record.amount,
          accountId,
          fix.category,
          record.date_time,
          record.sms,
          record.sender,
          record.payee,
          merchant,
          txType,
          record.fees ?? 0,
          record.confidence ?? 0,
          userId,
          now,
        ],
      );

      const sign = txType === 'income' ? 1 : -1;
      await db.execute(
        'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
        [sign * (record.amount ?? 0), accountId],
      );

      await db.execute('DELETE FROM auto_records WHERE id = ?', [record.id]);

      // Train the AI: the corrected merchant name maps to the corrected
      // category, and (if the SMS sender is known) the corrected channel.
      if (merchant) {
        await recordCorrection(db, merchant, fix.category, userId!);
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
