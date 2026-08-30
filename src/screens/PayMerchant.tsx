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
import {SafeAreaView} from 'react-native-safe-area-context';
import {formatDistanceToNowStrict} from 'date-fns';

import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {normalizeMerchant} from '../tools/merchantNormalize';
import {buildUssd, ussdTelUrl} from '../tools/ussd';
import {FONTS, R, T} from '../theme';
import {appAlert} from '../Components/AppDialog';

// How many payments make someone a "regular" worth suggesting unprompted.
// Below this they are still searchable — see `filtered`.
const REGULAR_MIN = 5;

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
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Payee | null>(null);
  const [amount, setAmount] = useState('');

  // Newest first, so the first row seen for a merchant is the most recent way
  // they were paid — if a merchant's code ever changes, the latest wins without
  // needing a second query to work that out.
  const {data: rows} = useQuery(
    `SELECT merchant, channel, pay_code, amount, date_time
       FROM transactions
      WHERE owner_id = ?
        AND pay_code IS NOT NULL AND pay_code != ''
        AND channel IS NOT NULL
      ORDER BY date_time DESC
      LIMIT 500`,
    [userId ?? ''],
  );

  // The user's own corrections win over anything parsed out of an SMS.
  const {data: ruleRows} = useQuery(
    `SELECT pattern, display_name, channel, pay_code
       FROM merchant_rules
      WHERE owner_id = ? AND pay_code IS NOT NULL AND pay_code != ''`,
    [userId ?? ''],
  );

  const payees = useMemo(() => {
    const rules = new Map<string, any>();
    for (const r of (ruleRows as any[]) ?? []) {
      rules.set(r.pattern, r);
    }

    // Counted across ALL rows for a payee, then built once. Doing both in a
    // single pass got this wrong: the count started from whichever row first
    // produced a dialable entry, so a merchant whose latest payment used a rail
    // we cannot rebuild lost its history along with it.
    const byKey = new Map<string, {rowsSeen: any[]}>();
    for (const r of (rows as any[]) ?? []) {
      // Grouping on the normalised key, not the raw name, so "THRIVE G Ltd" and
      // "Thrive G" are one payee rather than two rows that pay the same code.
      const key = normalizeMerchant(r.merchant ?? '').key;
      if (!key) {
        continue;
      }
      const bucket = byKey.get(key) ?? {rowsSeen: []};
      bucket.rowsSeen.push(r);
      byKey.set(key, bucket);
    }

    const out: Payee[] = [];
    for (const [key, {rowsSeen}] of byKey) {
      const rule = rules.get(key);
      // rowsSeen is newest-first (the query orders by date), so the first row
      // we can actually dial is the most recent usable way to pay them.
      const usable = rowsSeen.find(r =>
        buildUssd({
          channel: rule?.channel ?? r.channel,
          payCode: rule?.pay_code ?? r.pay_code,
        }),
      );
      // Omit rather than show a dead row.
      if (!usable) {
        continue;
      }
      const norm = normalizeMerchant(usable.merchant ?? '');
      out.push({
        key,
        name: (rule?.display_name || usable.merchant || norm.display || '').trim(),
        channel: rule?.channel ?? usable.channel,
        payCode: rule?.pay_code ?? usable.pay_code,
        lastAmount: Math.round(usable.amount ?? 0),
        lastAt: usable.date_time,
        times: rowsSeen.length,
      });
    }
    // Habit first, recency second: the person you pay weekly should be at the
    // top even if you happened to pay someone else more recently.
    return out.sort(
      (a, b) => b.times - a.times || String(b.lastAt).localeCompare(String(a.lastAt)),
    );
  }, [rows, ruleRows]);

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

  const open = (p: Payee) => {
    setSelected(p);
    // Prefilled with what you last paid them, because for most recurring payees
    // it is the same figure — and it is a suggestion, fully editable.
    setAmount(p.lastAmount > 0 ? String(p.lastAmount) : '');
  };

  const dial = async () => {
    if (!selected) {
      return;
    }
    const value = parseInt(amount.replace(/\D/g, ''), 10) || 0;
    const ussd = buildUssd({
      channel: selected.channel,
      payCode: selected.payCode,
      amount: value,
    });
    if (!ussd) {
      appAlert('Cannot build the payment', 'This payee is missing a usable code.');
      return;
    }
    try {
      await Linking.openURL(ussdTelUrl(ussd));
      setSelected(null);
    } catch {
      appAlert(
        'Could not open the dialer',
        `Dial this yourself:\n\n${ussd}`,
      );
    }
  };

  const renderItem = ({item}: {item: Payee}) => (
    <Pressable
      onPress={() => open(item)}
      style={({pressed}) => [styles.row, {opacity: pressed ? 0.7 : 1}]}>
      <View style={styles.rowIcon}>
        <Icon name="ShoppingBag" size={17} color={T.accent} strokeWidth={2.2} />
      </View>
      <View style={{flex: 1}}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.channel} · {item.payCode} · paid {item.times}×
          {item.lastAt
            ? `, last ${formatDistanceToNowStrict(new Date(item.lastAt), {addSuffix: true})}`
            : ''}
        </Text>
      </View>
      <Icon name="Phone" size={16} color={T.text3} strokeWidth={2.2} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>Pay again</Text>
      </View>

      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color={T.text3} strokeWidth={2.2} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search a merchant or code"
          placeholderTextColor={T.text3}
          style={styles.search}
          autoCorrect={false}
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Icon name="X" size={16} color={T.text3} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={p => p.key}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {payees.length === 0
                ? 'No payees yet. Once you pay someone by MoMo, the confirmation SMS teaches FinXAI their code and they appear here.'
                : q.trim()
                ? 'No match.'
                : // Regulars are empty but payees exist: say so, or the ones we
                  // are hiding look like data the app lost.
                  `Nobody you've paid ${REGULAR_MIN}+ times yet. Search to find any of your ${payees.length} payees.`}
            </Text>
          </View>
        }
      />

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetName} numberOfLines={1}>
              {selected?.name}
            </Text>
            <Text style={styles.sheetMeta}>
              {selected?.channel} · {selected?.payCode}
            </Text>

            <Text style={styles.label}>Amount (RWF)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              placeholder="Leave blank to be asked"
              placeholderTextColor={T.text3}
              style={styles.amountInput}
              autoFocus
            />

            {/* Showing the exact string is the honesty check: the user sees
                what will be dialled before the dialer opens. */}
            <Text style={styles.preview} numberOfLines={1}>
              {buildUssd({
                channel: selected?.channel,
                payCode: selected?.payCode,
                amount: parseInt(amount.replace(/\D/g, ''), 10) || 0,
              })}
            </Text>

            <Pressable
              onPress={dial}
              style={({pressed}) => [styles.dialBtn, {opacity: pressed ? 0.85 : 1}]}>
              <Icon name="Phone" size={17} color={T.accentInk} strokeWidth={2.4} />
              <Text style={styles.dialText}>Open dialer</Text>
            </Pressable>
            <Text style={styles.footnote}>
              You still press call — FinXAI never places the call itself.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16},
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: R.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
  },
  title: {fontFamily: FONTS.semibold, fontSize: 17, color: T.text},
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: R.small,
    backgroundColor: T.surface,
  },
  search: {flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: T.text, padding: 0},
  list: {padding: 16, gap: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: R.small,
    backgroundColor: T.surface,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: R.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.bg,
  },
  rowName: {fontFamily: FONTS.semibold, fontSize: 14.5, color: T.text},
  rowMeta: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 2},
  empty: {padding: 24},
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: T.text3,
    textAlign: 'center',
    lineHeight: 20,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {backgroundColor: T.surface, borderRadius: R.card, padding: 20},
  sheetName: {fontFamily: FONTS.semibold, fontSize: 17, color: T.text},
  sheetMeta: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text3, marginTop: 3},
  label: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: T.text3,
    marginTop: 18,
    marginBottom: 6,
  },
  amountInput: {
    height: 48,
    borderRadius: R.small,
    backgroundColor: T.bg,
    paddingHorizontal: 14,
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: T.text,
  },
  preview: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.accent,
    marginTop: 10,
    textAlign: 'center',
  },
  dialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: R.small,
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
