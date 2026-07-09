import {usePowerSync} from '@powersync/react-native';
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
import {CatChip, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, CategoryId, FONTS, R, T, fmtAmount} from '../theme';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type BudgetType = 'category' | 'shared' | 'party' | 'goal';

const TYPES: {id: BudgetType; emoji: string; name: string; sub: string; tint: string}[] = [
  {id: 'category', emoji: '📊', name: 'Category budget', sub: 'Cap spending per category', tint: T.accent},
  {id: 'shared', emoji: '🏠', name: 'Shared budget', sub: 'Co-manage with family', tint: T.info},
  {id: 'party', emoji: '🎉', name: 'Party / event', sub: 'Pool money for an occasion', tint: '#F472B6'},
  {id: 'goal', emoji: '🛟', name: 'Savings goal', sub: 'Auto-save toward a target', tint: '#2DD4BF'},
];

const FREQS = ['Weekly', 'Monthly', 'Yearly'];

interface Item {
  catId: CategoryId;
  label: string;
  amount: number;
}

export default function CreateBudget({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<BudgetType>('category');
  const [name, setName] = useState('');
  const [target, setTarget] = useState(''); // shared/party/goal
  const [recurring, setRecurring] = useState(true);
  const [freq, setFreq] = useState('Monthly');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Category basket
  const [items, setItems] = useState<Item[]>([]);
  const [pickCat, setPickCat] = useState<CategoryId | null>(null);
  const [pickAmount, setPickAmount] = useState('');

  const isCategory = type === 'category';
  const activeType = TYPES.find(t => t.id === type)!;
  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);

  const addItem = () => {
    const amt = parseFloat(pickAmount.replace(/,/g, '')) || 0;
    if (!pickCat || amt <= 0) {
      return;
    }
    const label = CATS[pickCat].label;
    setItems(prev => {
      const without = prev.filter(i => i.catId !== pickCat);
      return [...without, {catId: pickCat, label, amount: amt}];
    });
    setPickCat(null);
    setPickAmount('');
    setError('');
  };

  const removeItem = (catId: CategoryId) => setItems(prev => prev.filter(i => i.catId !== catId));

  const save = async () => {
    const now = new Date().toISOString();
    if (isCategory) {
      if (items.length === 0) {
        setError('Add at least one category with an amount');
        return;
      }
      const finalName = name.trim() || 'Monthly budget';
      setSaving(true);
      try {
        const budgetId = generateUUID();
        const start = new Date();
        start.setDate(1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        await db.execute(
          'INSERT INTO budgets (id, name, period, start_date, end_date, amount, recurring, event, shared_with, collaborators, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [budgetId, finalName, freq.toLowerCase(), start.toISOString(), end.toISOString(), total, recurring ? 1 : 0, '', '[]', '[]', userId ?? '', now],
        );
        for (const it of items) {
          await db.execute(
            'INSERT INTO budget_items (id, budget_id, category, subcategory, amount, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
            [generateUUID(), budgetId, it.label, '', it.amount, userId ?? ''],
          );
        }
        navigation.goBack();
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong');
        setSaving(false);
      }
      return;
    }

    // shared / party / goal
    const amt = parseFloat(target.replace(/,/g, '')) || 0;
    if (amt <= 0) {
      setError('Enter a target amount');
      return;
    }
    setSaving(true);
    try {
      const dateLabel = recurring
        ? type === 'goal'
          ? `Auto-save ${freq.toLowerCase()}`
          : `Resets ${freq.toLowerCase()}`
        : 'One-off';
      await db.execute(
        'INSERT INTO budget_groups (id, name, emoji, type, tint, target, spent, date_label, recurring, frequency, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [generateUUID(), name.trim() || activeType.name, activeType.emoji, type, activeType.tint, amt, 0, dateLabel, recurring ? 1 : 0, freq, userId ?? '', now],
      );
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
        <Text style={styles.title}>Create a budget</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding: 16, gap: 16, paddingBottom: 16}}>
        {/* Type grid */}
        <View style={styles.typeGrid}>
          {TYPES.map(ty => {
            const on = type === ty.id;
            return (
              <Pressable
                key={ty.id}
                onPress={() => {
                  setType(ty.id);
                  setError('');
                }}
                style={[styles.typeCard, on && styles.typeCardActive]}>
                <Text style={{fontSize: 22}}>{ty.emoji}</Text>
                <Text style={styles.typeName}>{ty.name}</Text>
                <Text style={styles.typeSub}>{ty.sub}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Name */}
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={isCategory ? 'e.g. Monthly essentials' : activeType.name}
              placeholderTextColor={T.text3}
              style={styles.fieldInput}
            />
          </View>
          {!isCategory && (
            <>
              <View style={styles.divider} />
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{type === 'goal' ? 'Target' : 'Pool'}</Text>
                <TextInput
                  value={target}
                  onChangeText={setTarget}
                  placeholder="0"
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                  style={[styles.fieldInput, {fontFamily: FONTS.semibold}]}
                />
                <Text style={styles.unit}>RWF</Text>
              </View>
            </>
          )}
        </View>

        {/* Category basket */}
        {isCategory && (
          <View style={{gap: 10}}>
            <View style={styles.basketHead}>
              <Text style={styles.label}>Category limits</Text>
              {total > 0 && (
                <Text style={styles.total}>Total {fmtAmount(total)} RWF</Text>
              )}
            </View>

            {/* Added items */}
            {items.map(it => (
              <View key={it.catId} style={styles.itemRow}>
                <CatChip cat={it.catId} size={32} />
                <Text style={styles.itemLabel} numberOfLines={1}>{it.label}</Text>
                <Text style={styles.itemAmt}>{fmtAmount(it.amount)}</Text>
                <Pressable onPress={() => removeItem(it.catId)} hitSlop={8}>
                  <Icon name="X" size={16} color={T.text3} strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}

            {/* Adder */}
            <View style={styles.adder}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{gap: 8, paddingBottom: 10}}>
                {(Object.values(CATS) as {id: CategoryId; label: string; color: string}[]).map(c => {
                  const on = pickCat === c.id;
                  const used = items.some(i => i.catId === c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setPickCat(c.id)}
                      style={[
                        styles.catChipWrap,
                        on && {borderColor: c.color, backgroundColor: c.color + '14'},
                        used && {opacity: 0.4},
                      ]}>
                      <CatChip cat={c.id} size={28} />
                      <Text style={[styles.catChipLabel, on && {color: T.text}]} numberOfLines={1}>
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.adderRow}>
                <TextInput
                  value={pickAmount}
                  onChangeText={setPickAmount}
                  placeholder={pickCat ? `Limit for ${CATS[pickCat].label}` : 'Pick a category above'}
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                  editable={!!pickCat}
                  style={styles.adderInput}
                />
                <Pressable
                  onPress={addItem}
                  disabled={!pickCat || !pickAmount}
                  style={({pressed}) => [
                    styles.adderBtn,
                    {opacity: !pickCat || !pickAmount ? 0.4 : pressed ? 0.8 : 1},
                  ]}>
                  <Icon name="Plus" size={16} color={T.accentInk} strokeWidth={2.6} />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Recurring */}
        <View style={styles.card}>
          <View style={styles.recurRow}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
              <View style={styles.recurIcon}>
                <Icon name="Repeat" size={17} color={T.accent} strokeWidth={2} />
              </View>
              <View>
                <Text style={styles.recurTitle}>Recurring</Text>
                <Text style={styles.recurSub}>Auto-reset each period</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setRecurring(v => !v)}
              style={[styles.switch, {backgroundColor: recurring ? T.accent : T.surface3}]}>
              <View style={[styles.knob, {left: recurring ? 21 : 3}]} />
            </Pressable>
          </View>
          {recurring && (
            <View style={styles.freqRow}>
              {FREQS.map(f => {
                const on = freq === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFreq(f)}
                    style={[styles.freqBtn, on && styles.freqBtnActive]}>
                    <Text style={[styles.freqText, on && {color: T.accent}]}>{f}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
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
        <Text style={styles.saveText}>{saving ? 'Creating…' : 'Create budget'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  iconBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center'},
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  typeGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  typeCard: {width: '47.5%', padding: 13, borderRadius: 14, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, gap: 4},
  typeCardActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.4)'},
  typeName: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text, marginTop: 4},
  typeSub: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text2},
  label: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text2},
  basketHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  total: {fontFamily: FONTS.bold, fontSize: 12.5, color: T.accent},
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemLabel: {flex: 1, fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  itemAmt: {fontFamily: FONTS.bold, fontSize: 13, color: T.text},
  adder: {backgroundColor: T.surface, borderRadius: R.card, borderWidth: 1, borderColor: T.border, padding: 12},
  catChipWrap: {alignItems: 'center', gap: 5, width: 78, paddingVertical: 10, borderRadius: R.card, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border},
  catChipLabel: {fontFamily: FONTS.medium, fontSize: 10, color: T.text3, paddingHorizontal: 3},
  adderRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  adderInput: {flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: R.small, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, fontFamily: FONTS.medium, fontSize: 13.5, color: T.text},
  adderBtn: {width: 42, height: 42, borderRadius: R.small, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center'},
  card: {backgroundColor: T.surface, borderRadius: R.card, borderWidth: 1, borderColor: T.border, paddingHorizontal: 14},
  fieldRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10},
  fieldLabel: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, width: 70},
  fieldInput: {flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: T.text, textAlign: 'right', paddingVertical: 0},
  unit: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  divider: {height: 1, backgroundColor: T.border},
  recurRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14},
  recurIcon: {width: 34, height: 34, borderRadius: 10, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center'},
  recurTitle: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  recurSub: {fontFamily: FONTS.regular, fontSize: 11, color: T.text2},
  switch: {width: 46, height: 28, borderRadius: 99, justifyContent: 'center'},
  knob: {position: 'absolute', width: 22, height: 22, borderRadius: 99, backgroundColor: '#fff'},
  freqRow: {flexDirection: 'row', gap: 8, paddingBottom: 14},
  freqBtn: {flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, alignItems: 'center'},
  freqBtnActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.3)'},
  freqText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2},
  error: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.expense, textAlign: 'center'},
  saveBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, paddingVertical: 15, borderRadius: R.card, backgroundColor: T.accent},
  saveText: {fontFamily: FONTS.bold, fontSize: 15.5, color: T.accentInk},
});
