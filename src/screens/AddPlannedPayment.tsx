import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {nextOccurrence} from '../tools/recurring';
import {FONTS, R, T, accountIcon, accountTint, fmtAmount} from '../theme';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type Kind = 'expense' | 'income';

const FREQUENCIES = [
  {id: 'daily', label: 'Daily', perYear: 365},
  {id: 'weekly', label: 'Weekly', perYear: 52},
  {id: 'monthly', label: 'Monthly', perYear: 12},
  {id: 'yearly', label: 'Yearly', perYear: 1},
  {id: 'once', label: 'One-off', perYear: 0},
];

export default function AddPlannedPayment({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );
  const accountList = accounts as any[];

  const [kind, setKind] = useState<Kind>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [accountId, setAccountId] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [note, setNote] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeAccount = accountId || accountList[0]?.id || '';
  const amountN = parseFloat(amount.replace(/,/g, '')) || 0;

  // What this commitment actually costs over a year, and when the next few fall due.
  // A monthly figure alone hides the scale of a commitment — 25,000 a month reads small
  // until it is shown as 300,000 a year.
  const preview = useMemo(() => {
    const freq = FREQUENCIES.find(f => f.id === frequency);
    if (amountN <= 0 || !freq) {
      return null;
    }
    const upcoming = freq.perYear === 0
      ? [startDate]
      : [0, 1, 2].map(k => nextOccurrence(startDate, frequency, k));
    return {annual: amountN * freq.perYear, upcoming, oneOff: freq.perYear === 0};
  }, [amountN, frequency, startDate]);

  const save = async () => {
    if (!name.trim()) {
      setError('Give it a name so you recognise the reminder');
      return;
    }
    if (amountN <= 0) {
      setError('Enter the amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const recurring = frequency !== 'once';
      await db.execute(
        'INSERT INTO scheduled_payments (id, name, amount, account_id, payee, frequency, transaction_type, start_date, next_reminder_date, is_recurring, note, labels, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          generateUUID(),
          name.trim(),
          amountN,
          activeAccount || null,
          payee.trim(),
          frequency,
          kind,
          startDate.toISOString(),
          startDate.toISOString(),
          recurring ? 1 : 0,
          note.trim(),
          '[]',
          userId ?? '',
          now,
        ],
      );
      navigation.goBack();
    } catch (e: any) {
      // Previously this only reached console.error, so a failed save looked identical to
      // a successful one — the screen just sat there.
      setError(e?.message ?? 'Could not save this payment');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>New scheduled payment</Text>
      </View>

      <KeyboardAvoidingView style={{flex: 1}} behavior="padding">
        <ScrollView
          style={{flex: 1}}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{padding: 16, gap: 14, paddingBottom: 24}}>
          {/* Money in or money out */}
          <View style={styles.kindToggle}>
            {(['expense', 'income'] as Kind[]).map(k => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.kindBtn, kind === k && styles.kindBtnActive]}>
                <Text style={[styles.kindText, kind === k && styles.kindTextActive]}>
                  {k === 'expense' ? 'Paying out' : 'Coming in'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <Field label="Name">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Rent"
                placeholderTextColor={T.text3}
                style={styles.input}
              />
            </Field>
            <View style={styles.divider} />
            <Field label="Amount">
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={T.text3}
                keyboardType="numeric"
                style={[styles.input, {fontFamily: FONTS.semibold}]}
              />
              <Text style={styles.unit}>RWF</Text>
            </Field>
            <View style={styles.divider} />
            <Field label={kind === 'expense' ? 'Payee' : 'From'}>
              <TextInput
                value={payee}
                onChangeText={setPayee}
                placeholder={kind === 'expense' ? 'Who gets paid' : 'Who pays you'}
                placeholderTextColor={T.text3}
                style={styles.input}
              />
            </Field>
          </View>

          {accountList.length > 0 && (
            <View>
              <Text style={styles.label}>Account</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{gap: 8}}>
                {accountList.map(a => {
                  const on = activeAccount === a.id;
                  const tint = accountTint(a.name ?? '');
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => setAccountId(a.id)}
                      style={[
                        styles.chip,
                        on && {borderColor: tint, backgroundColor: tint + '18'},
                      ]}>
                      <Icon
                        name={accountIcon(a.name ?? '', a.type ?? '')}
                        size={14}
                        color={tint}
                        strokeWidth={2}
                      />
                      <Text
                        style={[styles.chipName, on && {color: T.text}]}
                        numberOfLines={1}>
                        {a.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View>
            <Text style={styles.label}>How often</Text>
            <View style={styles.freqWrap}>
              {FREQUENCIES.map(f => {
                const on = frequency === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setFrequency(f.id)}
                    style={[styles.freqBtn, on && styles.freqBtnActive]}>
                    <Text style={[styles.freqText, on && {color: T.accent}]}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Field label={frequency === 'once' ? 'Due date' : 'Starts'}>
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={({pressed}) => [styles.dateBtn, {opacity: pressed ? 0.7 : 1}]}>
                <Icon name="Calendar" size={14} color={T.accent} strokeWidth={2.2} />
                <Text style={styles.dateText}>{startDate.toDateString().slice(4)}</Text>
              </Pressable>
            </Field>
            <View style={styles.divider} />
            <Field label="Note">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor={T.text3}
                style={styles.input}
              />
            </Field>
          </View>

          {preview && (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>
                {preview.oneOff
                  ? `${fmtAmount(amountN)} RWF once`
                  : `${fmtAmount(preview.annual)} RWF a year`}
              </Text>
              <Text style={styles.previewText}>
                {preview.oneOff ? 'Due ' : 'Next: '}
                {preview.upcoming.map(d => d.toDateString().slice(4, 10)).join(' · ')}
              </Text>
            </View>
          )}

          <DatePicker
            modal
            open={pickerOpen}
            date={startDate}
            mode="date"
            title={frequency === 'once' ? 'Due date' : 'First payment'}
            onConfirm={d => {
              setStartDate(d);
              setPickerOpen(false);
            }}
            onCancel={() => setPickerOpen(false)}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({pressed}) => [
            styles.saveBtn,
            {opacity: saving ? 0.5 : pressed ? 0.85 : 1, marginBottom: insets.bottom + 12},
          ]}>
          <Icon name="Check" size={17} color={T.accentInk} strokeWidth={2.6} />
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Schedule it'}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
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
  kindToggle: {
    flexDirection: 'row',
    backgroundColor: T.surface2,
    borderRadius: R.small,
    padding: 4,
    gap: 4,
  },
  kindBtn: {flex: 1, paddingVertical: 10, borderRadius: R.small - 2, alignItems: 'center'},
  kindBtnActive: {backgroundColor: T.accent},
  kindText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text2},
  kindTextActive: {color: T.accentInk},
  card: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
  },
  fieldRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10},
  fieldLabel: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, width: 92},
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: T.text,
    textAlign: 'right',
    paddingVertical: 0,
  },
  unit: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  divider: {height: 1, backgroundColor: T.border},
  label: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text2, marginBottom: 8},
  chip: {
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
  chipName: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.text2, maxWidth: 120},
  freqWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  freqBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  freqBtnActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.3)'},
  freqText: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text2},
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
  },
  dateText: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text},
  previewCard: {
    backgroundColor: T.surface2,
    borderRadius: R.small,
    borderWidth: 1,
    borderColor: T.border,
    padding: 11,
  },
  previewTitle: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text},
  previewText: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2, marginTop: 2},
  error: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.expense, textAlign: 'center'},
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 15,
    borderRadius: R.card,
    backgroundColor: T.accent,
  },
  saveText: {fontFamily: FONTS.bold, fontSize: 15.5, color: T.accentInk},
});
