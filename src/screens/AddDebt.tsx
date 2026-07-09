import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, accountIcon, accountTint, fmtAmount} from '../theme';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type Dir = 'borrowed' | 'lent';
const CADENCES = ['Weekly', 'Monthly', 'One-off'];

function addPeriod(base: Date, cadence: string, n: number): Date {
  const d = new Date(base);
  if (cadence === 'Weekly') {
    d.setDate(d.getDate() + 7 * n);
  } else if (cadence === 'Monthly') {
    d.setMonth(d.getMonth() + n);
  } else {
    d.setMonth(d.getMonth() + n); // one-off: single due next month
  }
  return d;
}

export default function AddDebt({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );
  const accountList = accounts as any[];

  const [dir, setDir] = useState<Dir>('borrowed');
  const [party, setParty] = useState('');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [cadence, setCadence] = useState('Monthly');
  const [installment, setInstallment] = useState('');
  const [term, setTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeAccount = accountId || accountList[0]?.id || '';
  const firstDue = useMemo(() => addPeriod(new Date(), cadence, 1), [cadence]);

  const save = async () => {
    const principalN = parseFloat(principal.replace(/,/g, '')) || 0;
    const installmentN = parseFloat(installment.replace(/,/g, '')) || 0;
    const rateN = parseFloat(rate) || 0;
    const termN = cadence === 'One-off' ? 1 : parseInt(term, 10) || 0;
    if (!party.trim()) {
      setError('Who is the counterparty?');
      return;
    }
    if (principalN <= 0) {
      setError('Enter the principal amount');
      return;
    }
    if (cadence !== 'One-off' && termN <= 0) {
      setError('Enter the number of payments');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const debtId = generateUUID();
      const nextDue = firstDue.toISOString();
      const inst = installmentN || (termN > 0 ? Math.round(principalN / termN) : principalN);
      await db.execute(
        'INSERT INTO debts (id, dir, party, sub, principal, outstanding, rate, frequency, installment, next_due, account_id, term, paid, tint, icon, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          debtId,
          dir,
          party.trim(),
          dir === 'borrowed' ? 'Loan' : 'Lent out',
          principalN,
          principalN,
          rateN,
          cadence,
          inst,
          nextDue,
          activeAccount || null,
          termN,
          0,
          dir === 'borrowed' ? '#1E73BE' : '#38BDF8',
          dir === 'borrowed' ? 'Landmark' : 'Handshake',
          userId ?? '',
          now,
        ],
      );
      // Build the repayment schedule the AI will use for reminders + payoff.
      for (let n = 1; n <= termN; n++) {
        await db.execute(
          'INSERT INTO debt_schedules (id, debt_id, n, due_date, amount, status, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            generateUUID(),
            debtId,
            n,
            addPeriod(new Date(), cadence, n).toISOString(),
            inst,
            n === 1 ? 'due' : 'upcoming',
            userId ?? '',
          ],
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
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>New debt or loan</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding: 16, gap: 14, paddingBottom: 16}}>
        {/* Direction toggle */}
        <View style={styles.dirToggle}>
          {(['borrowed', 'lent'] as Dir[]).map(d => (
            <Pressable
              key={d}
              onPress={() => setDir(d)}
              style={[styles.dirBtn, dir === d && styles.dirBtnActive]}>
              <Text style={[styles.dirText, dir === d && styles.dirTextActive]}>
                {d === 'borrowed' ? 'I borrowed' : 'I lent'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Details */}
        <View style={styles.card}>
          <Field label="Counterparty">
            <TextInput
              value={party}
              onChangeText={setParty}
              placeholder="e.g. Bank of Kigali"
              placeholderTextColor={T.text3}
              style={styles.input}
            />
          </Field>
          <View style={styles.divider} />
          <Field label="Principal">
            <TextInput
              value={principal}
              onChangeText={setPrincipal}
              placeholder="0"
              placeholderTextColor={T.text3}
              keyboardType="numeric"
              style={[styles.input, {fontFamily: FONTS.semibold}]}
            />
            <Text style={styles.unit}>RWF</Text>
          </Field>
          <View style={styles.divider} />
          <Field label="Interest rate">
            <TextInput
              value={rate}
              onChangeText={setRate}
              placeholder="0"
              placeholderTextColor={T.text3}
              keyboardType="numeric"
              style={styles.input}
            />
            <Text style={styles.unit}>% p.a.</Text>
          </Field>
        </View>

        {/* Linked account */}
        {accountList.length > 0 && (
          <View>
            <Text style={styles.label}>Linked account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>
              {accountList.map(a => {
                const on = activeAccount === a.id;
                const tint = accountTint(a.name ?? '');
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAccountId(a.id)}
                    style={[styles.chip, on && {borderColor: tint, backgroundColor: tint + '18'}]}>
                    <Icon name={accountIcon(a.name ?? '', a.type ?? '')} size={14} color={tint} strokeWidth={2} />
                    <Text style={[styles.chipName, on && {color: T.text}]} numberOfLines={1}>{a.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Cadence */}
        <View>
          <Text style={styles.label}>Repayment cadence</Text>
          <View style={styles.cadenceRow}>
            {CADENCES.map(c => {
              const on = cadence === c;
              return (
                <Pressable key={c} onPress={() => setCadence(c)} style={[styles.cadenceBtn, on && styles.cadenceBtnActive]}>
                  <Text style={[styles.cadenceText, on && {color: T.accent}]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Schedule inputs */}
        <View style={styles.card}>
          <Field label="Installment">
            <TextInput
              value={installment}
              onChangeText={setInstallment}
              placeholder="auto"
              placeholderTextColor={T.text3}
              keyboardType="numeric"
              style={[styles.input, {fontFamily: FONTS.semibold}]}
            />
            <Text style={styles.unit}>RWF</Text>
          </Field>
          <View style={styles.divider} />
          <Field label="First due">
            <Text style={[styles.input, {textAlign: 'right', color: T.text}]}>
              {firstDue.toDateString().slice(4)}
            </Text>
          </Field>
          {cadence !== 'One-off' && (
            <>
              <View style={styles.divider} />
              <Field label="Payments">
                <TextInput
                  value={term}
                  onChangeText={setTerm}
                  placeholder="e.g. 12"
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </Field>
            </>
          )}
        </View>

        {/* AI note */}
        <View style={styles.aiNote}>
          <Icon name="Sparkles" size={15} color={T.accent} strokeWidth={2.2} />
          <Text style={styles.aiNoteText}>
            AI will build the full schedule and feed reminders & repayment matching from your SMS.
          </Text>
        </View>

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
        <Text style={styles.saveText}>{saving ? 'Building…' : 'Create & build schedule'}</Text>
      </Pressable>
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
  dirToggle: {flexDirection: 'row', backgroundColor: T.surface2, borderRadius: R.small, padding: 4, gap: 4},
  dirBtn: {flex: 1, paddingVertical: 10, borderRadius: R.small - 2, alignItems: 'center'},
  dirBtnActive: {backgroundColor: T.accent},
  dirText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text2},
  dirTextActive: {color: T.accentInk},
  card: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
  },
  fieldRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10},
  fieldLabel: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, width: 92},
  input: {flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: T.text, textAlign: 'right', paddingVertical: 0},
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
  cadenceRow: {flexDirection: 'row', gap: 8},
  cadenceBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  cadenceBtnActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.3)'},
  cadenceText: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text2},
  aiNote: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 13,
    borderRadius: R.card,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  aiNoteText: {flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: T.text2, lineHeight: 17},
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
