/**
 * Pay a merchant again, without typing their code.
 *
 * The problem this solves is narrow and concrete: paying someone you have paid
 * before means remembering (or digging out of an SMS) a merchant code or phone
 * number and typing it into the dialer correctly. The app already has that
 * number — it parsed it out of the confirmation SMS the first time — so it can
 * hand the dialer a fully-formed USSD string and reduce the whole errand to
 * picking a name and confirming an amount.
 *
 * We open the dialer PRE-FILLED rather than placing the call: the user still
 * presses the green button, which keeps a human in the loop on every payment
 * and means the app needs no CALL_PHONE permission.
 *
 * Only merchants we can actually dial are listed. A payee whose rail we cannot
 * rebuild (a bank transfer, a bill paid through another flow) is omitted
 * rather than shown as a dead row — see buildUssd, which is deliberately
 * defined by what it refuses.
 */
import {useQuery} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {formatDistanceToNowStrict} from 'date-fns';

import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import {normalizeMerchant} from '../tools/merchantNormalize';
import {buildUssd, railFor, ussdTelUrl} from '../tools/ussd';
import {FONTS, R, T, fmtAmount} from '../theme';
import {appAlert} from '../Components/AppDialog';

// How many payments make someone a "regular" worth suggesting unprompted.
// Below this they are still searchable — see `filtered`.
const REGULAR_MIN = 5;

/**
 * "3 days ago", or nothing at all.
 *
 * date-fns THROWS a RangeError on an invalid date rather than returning a
 * placeholder, and this runs inside a list row — one malformed date_time (a
 * legacy row, a partial sync) would take down the whole screen instead of
 * degrading one line of subtitle.
 */
function lastSeen(at: string | null | undefined): string {
  if (!at) {
    return '';
  }
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return formatDistanceToNowStrict(d, {addSuffix: true});
}

const digits = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0;

const isPerson = (channel?: string | null) => railFor(channel) === 'sendmoney';

interface Payee {
  key: string;
  name: string;
  channel: string;
  payCode: string;
  lastAmount: number;
  lastAt: string;
  times: number;
}

export default function PayMerchant({navigation}: any) {
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Payee | null>(null);
  const [amount, setAmount] = useState('');

  // Aggregated in SQL, one row per (merchant, channel, code). This replaced a
  // LIMIT 500 over raw rows, which silently undercounted anyone paid long ago
  // and dropped them from the regulars once newer spending pushed them out of
  // the window. `amount` relies on SQLite's bare-column rule for MAX(): it comes
  // from the same row as MAX(date_time), i.e. the group's most recent payment.
  const {data: groups} = useQuery(
    `SELECT merchant, channel, pay_code, amount,
            MAX(date_time) AS last_at, COUNT(*) AS n
       FROM transactions
      WHERE owner_id = ?
        AND pay_code IS NOT NULL AND pay_code != ''
        AND channel IS NOT NULL
      GROUP BY merchant, channel, pay_code`,
    [userId ?? ''],
  );

  // The user's own corrections win over anything parsed out of an SMS.
  const {data: ruleRows} = useQuery(
    `SELECT pattern, display_name, channel, pay_code
       FROM merchant_rules
      WHERE owner_id = ? AND pay_code IS NOT NULL AND pay_code != ''`,
    [userId ?? ''],
  );

  // What this payee is usually paid, most frequent first. For a recurring
  // payment the amount is the only thing left to type, and it is usually one
  // of a handful of figures — so offer those as one tap each.
  const {data: amountRows} = useQuery(
    `SELECT amount, COUNT(*) AS n
       FROM transactions
      WHERE owner_id = ? AND pay_code = ? AND amount > 0
      GROUP BY amount
      ORDER BY n DESC, MAX(date_time) DESC
      LIMIT 4`,
    [userId ?? '', selected?.payCode ?? ''],
  );
  const usualAmounts = useMemo(
    () => ((amountRows as any[]) ?? []).map(r => Math.round(r.amount)),
    [amountRows],
  );

  const payees = useMemo(() => {
    const rules = new Map<string, any>();
    for (const r of (ruleRows as any[]) ?? []) {
      rules.set(r.pattern, r);
    }

    // Grouping on the normalised key, not the raw name, so "THRIVE G Ltd" and
    // "Thrive G" are one payee rather than two rows that pay the same code.
    const byKey = new Map<string, any[]>();
    for (const g of (groups as any[]) ?? []) {
      const key = normalizeMerchant(g.merchant ?? '').key;
      if (!key) {
        continue;
      }
      byKey.set(key, [...(byKey.get(key) ?? []), g]);
    }

    const out: Payee[] = [];
    for (const [key, gs] of byKey) {
      const rule = rules.get(key);
      // Counted across ALL groups, then built from the newest one we can dial:
      // a payee whose latest payment used a rail we cannot rebuild keeps its
      // history rather than losing it along with that payment.
      gs.sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
      const usable = gs.find(g =>
        buildUssd({
          channel: rule?.channel ?? g.channel,
          payCode: rule?.pay_code ?? g.pay_code,
        }),
      );
      // Omit rather than show a dead row.
      if (!usable) {
        continue;
      }
      out.push({
        key,
        name: (
          rule?.display_name ||
          usable.merchant ||
          normalizeMerchant(usable.merchant ?? '').display ||
          ''
        ).trim(),
        channel: rule?.channel ?? usable.channel,
        payCode: rule?.pay_code ?? usable.pay_code,
        lastAmount: Math.round(usable.amount ?? 0),
        lastAt: usable.last_at,
        times: gs.reduce((s, g) => s + (g.n ?? 0), 0),
      });
    }
    // Habit first, recency second: the person you pay weekly should be at the
    // top even if you happened to pay someone else more recently.
    return out.sort(
      (a, b) => b.times - a.times || String(b.lastAt).localeCompare(String(a.lastAt)),
    );
  }, [groups, ruleRows]);

  const regulars = useMemo(() => payees.filter(p => p.times >= REGULAR_MIN), [payees]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // With no query this is a SUGGESTION list, so it only offers people you
    // actually pay repeatedly — otherwise every one-off from the last few
    // months crowds out the handful you came here for, which defeats the point.
    if (!needle) {
      return regulars;
    }
    // Searching drops the threshold: the curation is about what we volunteer,
    // not about what we will admit to knowing. Matches the code too, because
    // "who is 888840?" is a real way to look when the SMS name was forgettable.
    return payees.filter(
      p => p.name.toLowerCase().includes(needle) || p.payCode.includes(needle),
    );
  }, [payees, regulars, q]);

  // Reached from the launcher shortcut there may be nothing beneath this
  // screen (App.tsx's LINKING now puts Home there, but a stack Android restores
  // can still lack it). goBack() on an empty stack is a silent no-op, which is
  // how this screen used to trap people until they killed the app.
  const leave = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({index: 0, routes: [{name: 'Home'}]});
    }
  };

  const open = (p: Payee) => {
    setSelected(p);
    // Prefilled with what you last paid them, because for most recurring payees
    // it is the same figure — and it is a suggestion, fully editable.
    setAmount(p.lastAmount > 0 ? String(p.lastAmount) : '');
  };

  const value = digits(amount);
  const ussd = selected
    ? buildUssd({channel: selected.channel, payCode: selected.payCode, amount: value})
    : null;

  const dial = async () => {
    if (!ussd) {
      appAlert('Cannot build the payment', 'This payee is missing a usable code.');
      return;
    }
    try {
      await Linking.openURL(ussdTelUrl(ussd));
      setSelected(null);
    } catch {
      appAlert('Could not open the dialer', `Dial this yourself:\n\n${ussd}`);
    }
  };

  const renderItem = ({item}: {item: Payee}) => (
    <Pressable
      onPress={() => open(item)}
      style={({pressed}) => [styles.row, {opacity: pressed ? 0.7 : 1}]}>
      <View style={styles.avatar}>
        <Icon
          name={isPerson(item.channel) ? 'User' : 'ShoppingBag'}
          size={17}
          color={T.accent}
          strokeWidth={2.2}
        />
      </View>
      <View style={{flex: 1}}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {isPerson(item.channel) ? 'Send money' : 'MoMoPay'} · {item.payCode}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {item.lastAmount > 0 && (
          <Text style={styles.rowAmt}>{fmtAmount(item.lastAmount)}</Text>
        )}
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.times}× · {lastSeen(item.lastAt)}
        </Text>
      </View>
    </Pressable>
  );

  const searching = q.trim().length > 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={leave}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View>
          <Text style={styles.title}>Pay again</Text>
          <Text style={styles.subtitle}>Pick who, confirm the amount, press call.</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color={T.text3} strokeWidth={2.2} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search any payee by name or code"
          placeholderTextColor={T.text3}
          style={styles.search}
          autoCorrect={false}
        />
        {searching && (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Icon name="X" size={16} color={T.text3} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>

      {filtered.length > 0 && (
        <Text style={styles.section}>
          {searching
            ? `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'}`
            : 'Your regulars'}
        </Text>
      )}

      <FlatList
        data={filtered}
        keyExtractor={p => p.key}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, {paddingBottom: 16 + insets.bottom}]}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {payees.length === 0
                ? 'No payees yet. Once you pay someone by MoMo, the confirmation SMS teaches FinXAI their code and they appear here.'
                : searching
                ? 'No match.'
                : // Regulars are empty but payees exist: say so, or the ones we
                  // are hiding look like data the app lost.
                  `Nobody you've paid ${REGULAR_MIN}+ times yet. Search to find any of your ${payees.length} payees.`}
            </Text>
          </View>
        }
      />

      {/* A bottom sheet rather than a centred dialog: the thumb is already at
          the bottom, and the keyboard pushes the sheet up instead of covering
          the pay button. */}
      <Modal
        visible={!!selected}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setSelected(null)}>
        <View style={{flex: 1, paddingBottom: keyboardHeight}}>
          <Pressable style={styles.backdrop} onPress={() => setSelected(null)} />
          <View style={[styles.sheet, {paddingBottom: 20 + (keyboardHeight ? 0 : insets.bottom)}]}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <View style={styles.avatar}>
                <Icon
                  name={isPerson(selected?.channel) ? 'User' : 'ShoppingBag'}
                  size={17}
                  color={T.accent}
                  strokeWidth={2.2}
                />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.sheetName} numberOfLines={1}>
                  {selected?.name}
                </Text>
                <Text style={styles.rowMeta}>
                  {isPerson(selected?.channel) ? 'Send money' : 'MoMoPay'} · {selected?.payCode}
                </Text>
              </View>
            </View>

            <View style={styles.amountWrap}>
              <Text style={styles.amountCur}>RWF</Text>
              <TextInput
                value={value > 0 ? fmtAmount(value) : ''}
                onChangeText={t => setAmount(String(digits(t) || ''))}
                keyboardType="number-pad"
                placeholder="Enter on the call"
                placeholderTextColor={T.text3}
                style={styles.amountInput}
                selectTextOnFocus
              />
            </View>

            {usualAmounts.length > 0 && (
              <View style={styles.chips}>
                {usualAmounts.map(a => {
                  const on = a === value;
                  return (
                    <Pressable
                      key={a}
                      onPress={() => setAmount(String(a))}
                      style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && {color: T.accent}]}>
                        {fmtAmount(a)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Showing the exact string is the honesty check: the user sees
                what will be dialled before the dialer opens. */}
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Will dial</Text>
              <Text style={styles.previewCode} numberOfLines={1}>
                {ussd}
              </Text>
            </View>

            <Pressable
              onPress={dial}
              style={({pressed}) => [styles.dialBtn, {opacity: pressed ? 0.85 : 1}]}>
              <Icon name="Phone" size={17} color={T.accentInk} strokeWidth={2.4} />
              <Text style={styles.dialText}>
                {value > 0 ? `Pay RWF ${fmtAmount(value)}` : 'Open dialer'}
              </Text>
            </Pressable>
            <Text style={styles.footnote}>
              Opens your dialer pre-filled. You still press call.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16},
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: R.iconBtn,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
  },
  title: {fontFamily: FONTS.semibold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3},
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: R.small,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  search: {flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: T.text, padding: 0},
  section: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: T.text3,
    marginHorizontal: 16,
    marginTop: 18,
  },
  list: {padding: 16, paddingTop: 10, gap: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.accentSoft,
  },
  rowName: {fontFamily: FONTS.semibold, fontSize: 14.5, color: T.text},
  rowMeta: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 2},
  rowRight: {alignItems: 'flex-end', maxWidth: '40%'},
  rowAmt: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  empty: {padding: 24},
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: T.text3,
    textAlign: 'center',
    lineHeight: 20,
  },
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)'},
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: R.large,
    borderTopRightRadius: R.large,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: T.border2,
    marginBottom: 16,
  },
  sheetHead: {flexDirection: 'row', alignItems: 'center', gap: 12},
  sheetName: {fontFamily: FONTS.semibold, fontSize: 17, color: T.text},
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    height: 60,
    paddingHorizontal: 16,
    borderRadius: R.card,
    backgroundColor: T.bg,
    borderWidth: 1,
    borderColor: T.border2,
  },
  amountCur: {fontFamily: FONTS.medium, fontSize: 14, color: T.text3},
  amountInput: {flex: 1, padding: 0, fontFamily: FONTS.bold, fontSize: 24, color: T.text},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.pill,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipOn: {borderColor: T.accent, backgroundColor: T.accentSoft},
  chipText: {fontFamily: FONTS.medium, fontSize: 13, color: T.text2},
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: R.small,
    backgroundColor: T.bg,
  },
  previewLabel: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3},
  previewCode: {fontFamily: FONTS.semibold, fontSize: 13, color: T.accent, flexShrink: 1},
  dialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: R.card,
    backgroundColor: T.accent,
    marginTop: 16,
  },
  dialText: {fontFamily: FONTS.semibold, fontSize: 15, color: T.accentInk},
  footnote: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: T.text3,
    textAlign: 'center',
    marginTop: 10,
  },
});
