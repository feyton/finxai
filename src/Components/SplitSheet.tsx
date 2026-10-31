/**
 * Split one payment across categories — the parts that differ, nothing else.
 *
 * Replaces the old split form at the bottom of the full editor, which made every
 * part a complete form and refused to save until the parts added up exactly.
 * Here the main category keeps whatever is left ("Rest → Groceries"), so a split
 * is: tap a category, tap an amount (½, ⅓ or the rest), done. Parts can be
 * edited, not just deleted. See src/tools/splits.ts for the model.
 */
import {usePowerSync} from '@powersync/react-native';
import React, {useEffect, useMemo, useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {CatChip, Icon} from './ui';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import {useSubcategories} from '../hooks/useSubcategories';
import {CATS, CategoryId, FONTS, R, T, categoriesForType, fmtAmount} from '../theme';
import {
  SplitPart,
  TxForSplit,
  mainCategory,
  partsFromRows,
  restOf,
  saveSplit,
} from '../tools/splits';

const digits = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0;

export default function SplitSheet({
  visible,
  tx,
  rows,
  onClose,
}: {
  visible: boolean;
  tx: TxForSplit | null;
  rows: any[];
  onClose: () => void;
}) {
  const db = usePowerSync();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const {subcatsFor} = useSubcategories();

  const [parts, setParts] = useState<SplitPart[]>([]);
  const [editing, setEditing] = useState<number | null>(null); // index, or null = new part
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [sub, setSub] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-seed on open (keyed by the transaction, not the row objects — see the
  // Fix sheet for why reactive rows must not reset a form mid-edit).
  useEffect(() => {
    if (visible && tx) {
      setParts(partsFromRows(tx, rows));
      setEditing(null);
      setCat(null);
      setSub('');
      setAmount('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tx?.id]);

  const total = Math.round(tx?.amount ?? 0);
  const main = tx ? mainCategory(tx) : 'other_spending';
  const choices = useMemo(
    () => (tx ? categoriesForType(tx.transaction_type) : []),
    [tx],
  );
  // What is free for THIS part: the rest, plus the part's own amount if editing it.
  const others = parts.filter((_, i) => i !== editing);
  const free = restOf(total, others);
  const rest = restOf(total, parts);

  if (!tx) {
    return null;
  }

  const pick = (id: CategoryId) => {
    setCat(id);
    setSub('');
  };

  const commitPart = () => {
    const value = Math.min(digits(amount), free);
    if (!cat || value <= 0) {
      return;
    }
    const part: SplitPart = {category: cat, subcategory: sub, amount: value};
    setParts(prev =>
      editing === null ? [...prev, part] : prev.map((p, i) => (i === editing ? {...p, ...part} : p)),
    );
    setEditing(null);
    setCat(null);
    setSub('');
    setAmount('');
  };

  const edit = (i: number) => {
    const p = parts[i];
    setEditing(i);
    setCat(p.category);
    setSub(p.subcategory);
    setAmount(String(p.amount));
  };

  const save = async () => {
    setBusy(true);
    try {
      // A half-typed part counts — leaving it behind would surprise.
      const pending =
        cat && digits(amount) > 0 && editing === null
          ? [...parts, {category: cat, subcategory: sub, amount: Math.min(digits(amount), free)}]
          : parts;
      await saveSplit(db, tx, pending);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const quick = [
    {label: '½', value: Math.floor(total / 2)},
    {label: '⅓', value: Math.floor(total / 3)},
    {label: 'The rest', value: free},
  ].filter(q => q.value > 0 && q.value <= free);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, paddingBottom: keyboardHeight}}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, {paddingBottom: 16 + (keyboardHeight ? 0 : insets.bottom)}]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Split RWF {fmtAmount(total)}</Text>
          <Text style={styles.hint}>
            Add only the parts that differ — the rest stays in {CATS[main].label}.
          </Text>

          <ScrollView style={{maxHeight: 520}} keyboardShouldPersistTaps="handled">
            {/* The parts so far, then the rest */}
            {parts.map((p, i) => (
              <Pressable
                key={`${p.category}-${i}`}
                onPress={() => edit(i)}
                style={[styles.partRow, editing === i && styles.partRowEditing]}>
                <CatChip cat={p.category} size={28} />
                <View style={{flex: 1}}>
                  <Text style={styles.partLabel} numberOfLines={1}>
                    {p.label ? `${p.label} · ` : ''}
                    {CATS[p.category].label}
                    {p.subcategory ? ` › ${p.subcategory}` : ''}
                  </Text>
                </View>
                <Text style={styles.partAmt}>{fmtAmount(p.amount)}</Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    setParts(prev => prev.filter((_, j) => j !== i));
                    if (editing === i) {
                      setEditing(null);
                    }
                  }}>
                  <Icon name="X" size={15} color={T.text3} strokeWidth={2.2} />
                </Pressable>
              </Pressable>
            ))}
            {parts.length > 0 && (
              <View style={[styles.partRow, styles.restRow]}>
                <CatChip cat={main} size={28} />
                <Text style={[styles.partLabel, {flex: 1}]}>Rest → {CATS[main].label}</Text>
                <Text style={[styles.partAmt, {color: T.text2}]}>{fmtAmount(rest)}</Text>
              </View>
            )}

            {/* Add / edit a part */}
            <Text style={styles.section}>{editing === null ? 'Add a part' : 'Edit part'}</Text>
            <View style={styles.chips}>
              {choices.map(id => {
                const on = cat === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => pick(id)}
                    style={[styles.chip, on && {borderColor: CATS[id].color, backgroundColor: CATS[id].color + '18'}]}>
                    <CatChip cat={id} size={18} />
                    <Text style={[styles.chipText, on && {color: T.text}]} numberOfLines={1}>
                      {CATS[id].label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {cat && subcatsFor(cat).length > 0 && (
              <View style={[styles.chips, {marginTop: 8}]}>
                {subcatsFor(cat).map(sc => {
                  const on = sub === sc.name;
                  return (
                    <Pressable
                      key={sc.name}
                      onPress={() => setSub(on ? '' : sc.name)}
                      style={[styles.chip, on && styles.chipOn]}>
                      <Text style={{fontSize: 12}}>{sc.icon}</Text>
                      <Text style={[styles.chipText, on && {color: T.text}]}>{sc.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {cat && (
              <>
                <View style={[styles.chips, {marginTop: 12}]}>
                  {quick.map(q => (
                    <Pressable key={q.label} onPress={() => setAmount(String(q.value))} style={styles.chip}>
                      <Text style={styles.chipText}>
                        {q.label} · {fmtAmount(q.value)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.cur}>RWF</Text>
                  <TextInput
                    value={digits(amount) > 0 ? fmtAmount(digits(amount)) : ''}
                    onChangeText={t => setAmount(String(digits(t) || ''))}
                    keyboardType="number-pad"
                    placeholder={`up to ${fmtAmount(free)}`}
                    placeholderTextColor={T.text3}
                    style={styles.amountInput}
                  />
                  <Pressable
                    onPress={commitPart}
                    disabled={digits(amount) <= 0}
                    style={({pressed}) => [styles.addBtn, {opacity: digits(amount) <= 0 ? 0.4 : pressed ? 0.85 : 1}]}>
                    <Icon name={editing === null ? 'Plus' : 'Check'} size={16} color={T.accentInk} strokeWidth={2.6} />
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>

          {/* Says what will happen: nothing to save yet → nothing to press;
              an existing split with every part removed → "Remove split". */}
          {(() => {
            const pendingPart = !!cat && digits(amount) > 0;
            const hasWork = parts.length > 0 || pendingPart;
            const removing = !hasWork && rows.length > 0;
            const label = hasWork ? 'Save split' : removing ? 'Remove split' : 'Add a part above';
            const disabled = busy || (!hasWork && !removing);
            return (
              <Pressable
                onPress={save}
                disabled={disabled}
                style={({pressed}) => [
                  styles.saveBtn,
                  removing && {backgroundColor: T.expense},
                  {opacity: disabled ? 0.4 : pressed ? 0.85 : 1},
                ]}>
                <Text style={styles.saveText}>{label}</Text>
              </Pressable>
            );
          })()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)'},
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: R.large,
    borderTopRightRadius: R.large,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {alignSelf: 'center', width: 40, height: 4, borderRadius: R.pill, backgroundColor: T.border2, marginBottom: 14},
  title: {fontFamily: FONTS.semibold, fontSize: 17, color: T.text},
  hint: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text3, marginTop: 2, marginBottom: 12},
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: R.small,
    backgroundColor: T.bg,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  partRowEditing: {borderColor: T.accent},
  restRow: {backgroundColor: 'transparent', borderColor: T.border, borderStyle: 'dashed'},
  partLabel: {fontFamily: FONTS.medium, fontSize: 13.5, color: T.text},
  partAmt: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.text},
  section: {fontFamily: FONTS.medium, fontSize: 12, color: T.text3, marginTop: 12, marginBottom: 8},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipOn: {borderColor: T.accent, backgroundColor: T.accentSoft},
  chipText: {fontFamily: FONTS.medium, fontSize: 12, color: T.text2},
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingLeft: 14,
    height: 52,
    borderRadius: R.card,
    backgroundColor: T.bg,
    borderWidth: 1,
    borderColor: T.border2,
  },
  cur: {fontFamily: FONTS.medium, fontSize: 13, color: T.text3},
  amountInput: {flex: 1, padding: 0, fontFamily: FONTS.bold, fontSize: 20, color: T.text},
  addBtn: {
    width: 52,
    height: 52,
    borderTopRightRadius: R.card,
    borderBottomRightRadius: R.card,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {height: 50, borderRadius: R.card, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12},
  saveText: {fontFamily: FONTS.semibold, fontSize: 15, color: T.accentInk},
});
