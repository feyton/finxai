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
import {
  type AmortInput,
  type InterestMethod,
  buildPlan,
  buildScheduleWithOverrides,
  flatToReducingRatePct,
  nthDue,
} from '../../shared/amortize';
import {FONTS, R, T, accountIcon, accountTint, fmtAmount} from '../theme';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type Dir = 'borrowed' | 'lent';
const CADENCES = ['Weekly', 'Monthly', 'One-off'];

// How the quoted rate is applied. The distinction is not cosmetic: at the same headline
// percentage a flat loan costs close to twice what a reducing one does, and that is the
// single most common way a borrower here underestimates what they have signed.
const METHODS: {id: InterestMethod; label: string; blurb: string}[] = [
  {
    id: 'reducing',
    label: 'Reducing',
    blurb: 'Interest on what you still owe. Payment stays level; the split shifts.',
  },
  {
    id: 'flat',
    label: 'Flat',
    blurb: 'Interest on the original amount for the whole term. Costs far more.',
  },
  {
    id: 'equal_principal',
    label: 'Equal principal',
    blurb: 'Same principal each time, so the payment itself falls month to month.',
  },
];

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
  const [alreadyPaid, setAlreadyPaid] = useState('');
  const [balanceNow, setBalanceNow] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Real loans have a contract schedule: a disbursement (start) date and a
  // first due date — never "one period after whenever I added this". The
  // cadence only seeds a default until the user picks dates themselves.
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [firstDue, setFirstDue] = useState<Date>(() => nthDue(new Date(), 'Monthly', 1));
  const [dueTouched, setDueTouched] = useState(false);
  const [pickerFor, setPickerFor] = useState<'start' | 'due' | null>(null);

  const [method, setMethod] = useState<InterestMethod>('reducing');
  const [feePct, setFeePct] = useState('');
  const [feeFlat, setFeeFlat] = useState('');
  const [feeSpread, setFeeSpread] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  // Hand-edited instalments, keyed by instalment number. Kept separate from the computed
  // plan so changing a term re-derives everything else while deliberate edits survive.
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const pickCadence = (c: string) => {
    setCadence(c);
    if (!dueTouched) {
      setFirstDue(nthDue(new Date(), c === 'Weekly' ? 'Weekly' : 'Monthly', 1));
    }
  };

  const activeAccount = accountId || accountList[0]?.id || '';
  const paidN = cadence === 'One-off' ? 0 : Math.max(0, parseInt(alreadyPaid, 10) || 0);

  // Bank-style amortized schedule: daily interest accrual from the start
  // date, month-end anchoring, installment solved from principal+rate+term
  // (verified against a real BK schedule in __tests__/amortize.test.ts).
  // A manually-entered installment overrides the solved payment.
  const terms: AmortInput | null = useMemo(() => {
    const principalN = parseFloat(principal.replace(/,/g, '')) || 0;
    const termN = cadence === 'One-off' ? 1 : parseInt(term, 10) || 0;
    if (principalN <= 0 || termN <= 0) {
      return null;
    }
    return {
      principal: principalN,
      annualRatePct: parseFloat(rate) || 0,
      term: termN,
      cadence,
      firstDue,
      startDate,
      method,
      managementFeePct: parseFloat(feePct) || 0,
      managementFeeFlat: parseFloat(feeFlat.replace(/,/g, '')) || 0,
      feeTiming: feeSpread ? 'spread' : 'upfront',
    };
  }, [principal, rate, term, cadence, firstDue, startDate, method, feePct, feeFlat, feeSpread]);

  // A manually-entered installment overrides the solved payment on every row; individual
  // hand-edits then override that.
  const schedule = useMemo(() => {
    if (!terms) {
      return [];
    }
    const manual = parseFloat(installment.replace(/,/g, '')) || 0;
    const all =
      manual > 0
        ? Object.fromEntries(
            Array.from({length: terms.term - 1}, (_, i) => [i + 1, manual]),
          )
        : {};
    return buildScheduleWithOverrides(terms, {...all, ...edits});
  }, [terms, installment, edits]);

  // The calculator. Totals come from the rows on screen, so what the card claims and what
  // the table shows can never disagree.
  const plan = useMemo(() => {
    if (!terms || schedule.length === 0) {
      return null;
    }
    const totalFees = schedule.reduce((s, r) => s + r.fee, 0);
    const totalRepaid = schedule.reduce((s, r) => s + r.amount, 0);
    const totalInterest = totalRepaid - terms.principal - totalFees;
    return {
      totalRepaid,
      totalInterest,
      totalFees,
      costPct: ((totalInterest + totalFees) / terms.principal) * 100,
      // What the flat quote would be as a reducing rate — the number that makes the
      // true cost legible.
      trueRate: flatToReducingRatePct(terms),
      shortfall: schedule[schedule.length - 1]?.remaining ?? 0,
    };
  }, [terms, schedule]);

  // What the same loan would cost on reducing terms, for the comparison line.
  const reducingCost = useMemo(
    () => (terms && method === 'flat' ? buildPlan({...terms, method: 'reducing'}) : null),
    [terms, method],
  );

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
    if (paidN >= Math.max(termN, 1)) {
      setError('Already-paid must be less than the number of payments');
      return;
    }
    if (schedule.length === 0) {
      setError('Check the principal and payments');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const debtId = generateUUID();
      const inst = schedule[0]?.amount ?? installmentN;
      // Outstanding: the bank's own figure wins if given; otherwise the
      // amortized remaining after the already-paid installments (NOT
      // principal − n×installment — that ignores interest entirely).
      const bankBalance = parseFloat(balanceNow.replace(/,/g, '')) || 0;
      const outstanding =
        bankBalance > 0
          ? bankBalance
          : paidN > 0
          ? schedule[paidN - 1].remaining
          : principalN;
      // next_due = the first UNPAID installment, not "today + a period"
      const nextDue = schedule[paidN]?.due ?? firstDue;
      await db.execute(
        'INSERT INTO debts (id, dir, party, sub, principal, outstanding, rate, frequency, installment, next_due, account_id, term, paid, tint, icon, owner_id, created_at, method, management_fee_pct, management_fee_flat, fee_timing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          debtId,
          dir,
          party.trim(),
          dir === 'borrowed' ? 'Loan' : 'Lent out',
          principalN,
          outstanding,
          rateN,
          cadence,
          inst,
          nextDue.toISOString(),
          activeAccount || null,
          termN,
          paidN,
          dir === 'borrowed' ? '#1E73BE' : '#38BDF8',
          dir === 'borrowed' ? 'Landmark' : 'Handshake',
          userId ?? '',
          now,
          // Without the method the stored rate is ambiguous — 12% flat and 12% reducing
          // are nearly a factor of two apart, and the schedule could not be rebuilt.
          method,
          parseFloat(feePct) || 0,
          parseFloat(feeFlat.replace(/,/g, '')) || 0,
          feeSpread ? 'spread' : 'upfront',
        ],
      );
      // Persist the schedule with its per-row breakdown, for reminders, payoff
      // projections and mark-paid math. The split is stored rather than recomputed
      // because a hand-edited row can no longer be derived from the loan's terms.
      for (const row of schedule) {
        const status =
          row.n <= paidN ? 'paid' : row.n === paidN + 1 ? 'due' : 'upcoming';
        await db.execute(
          'INSERT INTO debt_schedules (id, debt_id, n, due_date, amount, status, owner_id, principal, interest, fee, edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            generateUUID(),
            debtId,
            row.n,
            row.due.toISOString(),
            row.amount,
            status,
            userId ?? '',
            row.principal,
            row.interest,
            row.fee,
            edits[row.n] !== undefined ? 1 : 0,
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

      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior="padding">
      <ScrollView
        style={{flex: 1}}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding: 16, gap: 14, paddingBottom: 24}}>
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

        {/* How the interest is charged — the field that changes the answer most */}
        <View>
          <Text style={styles.label}>Interest method</Text>
          <View style={styles.methodRow}>
            {METHODS.map(m => {
              const on = method === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    setMethod(m.id);
                    setEdits({});
                  }}
                  style={[styles.methodBtn, on && styles.methodBtnActive]}>
                  <Text style={[styles.methodText, on && {color: T.accent}]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.methodBlurb}>
            {METHODS.find(m => m.id === method)?.blurb}
          </Text>
        </View>

        {/* Management fee — invisible in the headline rate, so it gets its own field */}
        <View style={styles.card}>
          <Field label="Mgmt fee">
            <TextInput
              value={feePct}
              onChangeText={setFeePct}
              placeholder="0"
              placeholderTextColor={T.text3}
              keyboardType="numeric"
              style={styles.input}
            />
            <Text style={styles.unit}>% of principal</Text>
          </Field>
          <View style={styles.divider} />
          <Field label="Fee amount">
            <TextInput
              value={feeFlat}
              onChangeText={setFeeFlat}
              placeholder="0"
              placeholderTextColor={T.text3}
              keyboardType="numeric"
              style={styles.input}
            />
            <Text style={styles.unit}>RWF</Text>
          </Field>
          {(parseFloat(feePct) > 0 || parseFloat(feeFlat) > 0) && (
            <>
              <View style={styles.divider} />
              <Field label="Charged">
                <Pressable
                  onPress={() => setFeeSpread(s => !s)}
                  style={({pressed}) => [styles.dateBtn, {opacity: pressed ? 0.7 : 1}]}>
                  <Text style={styles.dateText}>
                    {feeSpread ? 'Spread over term' : 'Upfront'}
                  </Text>
                  <Icon name="Repeat" size={13} color={T.accent} strokeWidth={2.2} />
                </Pressable>
              </Field>
            </>
          )}
        </View>

        {/* Cadence */}
        <View>
          <Text style={styles.label}>Repayment cadence</Text>
          <View style={styles.cadenceRow}>
            {CADENCES.map(c => {
              const on = cadence === c;
              return (
                <Pressable key={c} onPress={() => pickCadence(c)} style={[styles.cadenceBtn, on && styles.cadenceBtnActive]}>
                  <Text style={[styles.cadenceText, on && {color: T.accent}]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Schedule inputs */}
        <View style={styles.card}>
          <Field label="Start date">
            <Pressable
              onPress={() => setPickerFor('start')}
              style={({pressed}) => [styles.dateBtn, {opacity: pressed ? 0.7 : 1}]}>
              <Icon name="Calendar" size={14} color={T.info} strokeWidth={2.2} />
              <Text style={styles.dateText}>{startDate.toDateString().slice(4)}</Text>
            </Pressable>
          </Field>
          <View style={styles.divider} />
          <Field label={cadence === 'One-off' ? 'Due date' : 'First due'}>
            <Pressable
              onPress={() => setPickerFor('due')}
              style={({pressed}) => [styles.dateBtn, {opacity: pressed ? 0.7 : 1}]}>
              <Icon name="Calendar" size={14} color={T.accent} strokeWidth={2.2} />
              <Text style={styles.dateText}>{firstDue.toDateString().slice(4)}</Text>
            </Pressable>
          </Field>
          <View style={styles.divider} />
          <Field label="Installment">
            <TextInput
              value={installment}
              onChangeText={setInstallment}
              placeholder={schedule[0] ? fmtAmount(schedule[0].amount) : 'auto'}
              placeholderTextColor={T.text3}
              keyboardType="numeric"
              style={[styles.input, {fontFamily: FONTS.semibold}]}
            />
            <Text style={styles.unit}>RWF</Text>
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
              <View style={styles.divider} />
              <Field label="Already paid">
                <TextInput
                  value={alreadyPaid}
                  onChangeText={setAlreadyPaid}
                  placeholder="0"
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </Field>
              {paidN > 0 && (
                <>
                  <View style={styles.divider} />
                  <Field label="Balance now">
                    <TextInput
                      value={balanceNow}
                      onChangeText={setBalanceNow}
                      placeholder={
                        schedule[paidN - 1]
                          ? fmtAmount(schedule[paidN - 1].remaining)
                          : 'from your bank'
                      }
                      placeholderTextColor={T.text3}
                      keyboardType="numeric"
                      style={styles.input}
                    />
                    <Text style={styles.unit}>RWF</Text>
                  </Field>
                </>
              )}
            </>
          )}
        </View>

        {/* The calculator — what this loan actually costs, BEFORE committing to it */}
        {plan && terms && (
          <View style={styles.calcCard}>
            <View style={styles.calcGrid}>
              <Stat label="You repay" value={fmtAmount(plan.totalRepaid)} />
              <Stat
                label="Interest"
                value={fmtAmount(plan.totalInterest)}
                tint={T.expense}
              />
              {plan.totalFees > 0 && (
                <Stat label="Fees" value={fmtAmount(plan.totalFees)} tint={T.expense} />
              )}
              <Stat label="Cost" value={`${plan.costPct.toFixed(1)}%`} />
            </View>

            <View style={styles.divider} />
            <Text style={styles.calcLine}>
              {schedule.length} payment{schedule.length === 1 ? '' : 's'} of{' '}
              {fmtAmount(schedule[0].amount)} RWF
              {schedule[schedule.length - 1].amount !== schedule[0].amount
                ? `, last ${fmtAmount(schedule[schedule.length - 1].amount)}`
                : ''}
              {paidN > 0 ? ` · ${paidN} already settled` : ''}
            </Text>

            {/* A flat quote is the commonest way to misjudge a loan. Say what it really
                costs rather than leaving the borrower to work it out. */}
            {plan.trueRate !== null && plan.trueRate > 0 && reducingCost && (
              <View style={styles.warnBox}>
                <Icon name="Info" size={14} color={T.warn} strokeWidth={2.2} />
                <Text style={styles.warnText}>
                  {rate}% flat is about{' '}
                  <Text style={{fontFamily: FONTS.bold}}>
                    {plan.trueRate.toFixed(1)}% reducing
                  </Text>
                  . The same loan on reducing terms would cost{' '}
                  {fmtAmount(plan.totalInterest - reducingCost.totalInterest)} RWF less in
                  interest.
                </Text>
              </View>
            )}

            {plan.shortfall > 0 && (
              <View style={[styles.warnBox, {backgroundColor: 'rgba(248,113,113,0.1)'}]}>
                <Icon name="AlertCircle" size={14} color={T.expense} strokeWidth={2.2} />
                <Text style={[styles.warnText, {color: T.expense}]}>
                  These payments leave {fmtAmount(plan.shortfall)} RWF outstanding at the
                  end.
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => setShowSchedule(s => !s)}
              style={({pressed}) => [styles.schedToggle, {opacity: pressed ? 0.7 : 1}]}>
              <Text style={styles.schedToggleText}>
                {showSchedule ? 'Hide schedule' : 'Review & edit schedule'}
              </Text>
              <Icon
                name={showSchedule ? 'ChevronDown' : 'ChevronRight'}
                size={15}
                color={T.accent}
                strokeWidth={2.4}
              />
            </Pressable>

            {showSchedule && (
              <View style={styles.schedTable}>
                <View style={styles.schedHead}>
                  <Text style={[styles.schedHeadCell, {width: 26}]}>#</Text>
                  <Text style={[styles.schedHeadCell, {flex: 1}]}>Due</Text>
                  <Text style={[styles.schedHeadCell, styles.numCell]}>Principal</Text>
                  <Text style={[styles.schedHeadCell, styles.numCell]}>Interest</Text>
                  <Text style={[styles.schedHeadCell, styles.numCell]}>Payment</Text>
                </View>
                {schedule.map(row => {
                  const edited = edits[row.n] !== undefined;
                  return (
                    <Pressable
                      key={row.n}
                      onPress={() => {
                        setEditing(row.n);
                        setEditValue(String(row.amount));
                      }}
                      style={({pressed}) => [
                        styles.schedRow,
                        pressed && {backgroundColor: T.surface2},
                      ]}>
                      <Text style={[styles.schedCell, {width: 26, color: T.text3}]}>
                        {row.n}
                      </Text>
                      <Text style={[styles.schedCell, {flex: 1}]}>
                        {row.due.toDateString().slice(4, 10)}
                      </Text>
                      <Text style={[styles.schedCell, styles.numCell]}>
                        {fmtAmount(row.principal)}
                      </Text>
                      <Text style={[styles.schedCell, styles.numCell, {color: T.text3}]}>
                        {fmtAmount(row.interest + row.fee)}
                      </Text>
                      <Text
                        style={[
                          styles.schedCell,
                          styles.numCell,
                          {fontFamily: FONTS.semibold, color: edited ? T.accent : T.text},
                        ]}>
                        {fmtAmount(row.amount)}
                      </Text>
                    </Pressable>
                  );
                })}
                <Text style={styles.schedHint}>
                  Tap any row to change that payment — the balances below it recalculate.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Edit one instalment */}
        {editing !== null && (
          <View style={styles.editSheet}>
            <Text style={styles.editTitle}>Payment {editing}</Text>
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              keyboardType="numeric"
              autoFocus
              style={styles.editInput}
            />
            <View style={{flexDirection: 'row', gap: 8}}>
              {edits[editing] !== undefined && (
                <Pressable
                  onPress={() => {
                    setEdits(({[editing]: _drop, ...rest}) => rest);
                    setEditing(null);
                  }}
                  style={({pressed}) => [styles.editBtnGhost, {opacity: pressed ? 0.7 : 1}]}>
                  <Text style={styles.editBtnGhostText}>Reset</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setEditing(null)}
                style={({pressed}) => [styles.editBtnGhost, {opacity: pressed ? 0.7 : 1}]}>
                <Text style={styles.editBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const v = parseFloat(editValue.replace(/,/g, ''));
                  if (v > 0) {
                    setEdits(e => ({...e, [editing]: v}));
                  }
                  setEditing(null);
                }}
                style={({pressed}) => [styles.editBtn, {opacity: pressed ? 0.85 : 1}]}>
                <Text style={styles.editBtnText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        )}

        <DatePicker
          modal
          open={pickerFor !== null}
          date={pickerFor === 'start' ? startDate : firstDue}
          mode="date"
          title={
            pickerFor === 'start'
              ? 'Loan start (disbursement)'
              : cadence === 'One-off'
              ? 'Due date'
              : 'First payment due'
          }
          onConfirm={d => {
            if (pickerFor === 'start') {
              setStartDate(d);
              if (!dueTouched) {
                setFirstDue(nthDue(d, cadence === 'Weekly' ? 'Weekly' : 'Monthly', 1));
              }
            } else {
              setFirstDue(d);
              setDueTouched(true);
            }
            setPickerFor(null);
          }}
          onCancel={() => setPickerFor(null)}
        />

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

function Stat({label, value, tint}: {label: string; value: string; tint?: string}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tint ? {color: tint} : null]}>{value}</Text>
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
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
  },
  dateText: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text},
  methodRow: {flexDirection: 'row', gap: 8},
  methodBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  methodBtnActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.3)'},
  methodText: {fontFamily: FONTS.semibold, fontSize: 11.5, color: T.text2, textAlign: 'center'},
  methodBlurb: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: T.text3,
    marginTop: 7,
    lineHeight: 16,
  },
  calcCard: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 13,
    gap: 11,
  },
  calcGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  stat: {flexGrow: 1, flexBasis: '40%'},
  statLabel: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  statValue: {fontFamily: FONTS.bold, fontSize: 15, color: T.text, marginTop: 2},
  calcLine: {fontFamily: FONTS.medium, fontSize: 12, color: T.text2, lineHeight: 17},
  warnBox: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: R.small,
    backgroundColor: 'rgba(251,191,36,0.1)',
  },
  warnText: {flex: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2, lineHeight: 16},
  schedToggle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6},
  schedToggleText: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.accent},
  schedTable: {borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8},
  schedHead: {flexDirection: 'row', gap: 6, paddingBottom: 6},
  schedHeadCell: {fontFamily: FONTS.medium, fontSize: 10, color: T.text3},
  schedRow: {flexDirection: 'row', gap: 6, paddingVertical: 7, borderRadius: 6},
  schedCell: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  numCell: {width: 72, textAlign: 'right'},
  schedHint: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: T.text3,
    textAlign: 'center',
    marginTop: 8,
  },
  editSheet: {
    backgroundColor: T.surface2,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.accent,
    padding: 14,
    gap: 10,
  },
  editTitle: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  editInput: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: T.text,
    backgroundColor: T.surface,
    borderRadius: R.small,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: R.small,
    backgroundColor: T.accent,
    alignItems: 'center',
  },
  editBtnText: {fontFamily: FONTS.bold, fontSize: 13, color: T.accentInk},
  editBtnGhost: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: R.small,
    backgroundColor: T.surface,
    alignItems: 'center',
  },
  editBtnGhostText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text2},
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
