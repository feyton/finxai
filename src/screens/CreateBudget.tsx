import {usePowerSync} from '@powersync/react-native';
import React, {useState} from 'react';
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
import {CATS, CategoryId, FONTS, R, T} from '../theme';

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

export default function CreateBudget({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<BudgetType>('category');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('');
  const [recurring, setRecurring] = useState(true);
  const [freq, setFreq] = useState('Monthly');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCategory = type === 'category';
  const activeType = TYPES.find(t => t.id === type)!;

  const save = async () => {
    const amt = parseFloat(amount.replace(/,/g, '')) || 0;
    const finalName = name.trim() || (isCategory && category ? category : activeType.name);
    if (amt <= 0) {
      setError(isCategory ? 'Enter a spending limit' : 'Enter a target amount');
      return;
    }
    if (isCategory && !category) {
      setError('Pick a category to cap');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (isCategory) {
        const budgetId = generateUUID();
        const start = new Date();
        start.setDate(1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        await db.execute(
          'INSERT INTO budgets (id, name, period, start_date, end_date, amount, recurring, event, shared_with, collaborators, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            budgetId,
            finalName,
            freq.toLowerCase(),
            start.toISOString(),
            end.toISOString(),
            amt,
            recurring ? 1 : 0,
            '',
            '[]',
            '[]',
            userId ?? '',
            now,
          ],
        );
        await db.execute(
          'INSERT INTO budget_items (id, budget_id, category, subcategory, amount, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
          [generateUUID(), budgetId, category, '', amt, userId ?? ''],
        );
      } else {
        const dateLabel = recurring
          ? type === 'goal'
            ? `Auto-save ${freq.toLowerCase()}`
            : `Resets ${freq.toLowerCase()}`
          : 'One-off';
        await db.execute(
          'INSERT INTO budget_groups (id, name, emoji, type, tint, target, spent, date_label, recurring, frequency, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            generateUUID(),
            finalName,
            activeType.emoji,
            type,
            activeType.tint,
            amt,
            0,
            dateLabel,
            recurring ? 1 : 0,
            freq,
            userId ?? '',
            now,
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
      {/* Header */}
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

        {/* Category picker (category budgets only) */}
        {isCategory && (
          <View>
            <Text style={styles.label}>Category to cap</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{gap: 8}}>
              {(Object.values(CATS) as {id: CategoryId; label: string; color: string}[]).map(c => {
                const on = category === c.label;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCategory(c.label);
                      if (!name.trim()) {
                        setName(c.label);
                      }
                    }}
                    style={[styles.catChipWrap, on && {borderColor: c.color, backgroundColor: c.color + '14'}]}>
                    <CatChip cat={c.id} size={30} />
                    <Text style={[styles.catChipLabel, on && {color: T.text}]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Details card */}
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={isCategory ? 'e.g. Groceries' : activeType.name}
              placeholderTextColor={T.text3}
              style={styles.fieldInput}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{type === 'goal' ? 'Target' : isCategory ? 'Limit' : 'Pool'}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={T.text3}
              keyboardType="numeric"
              style={[styles.fieldInput, {fontFamily: FONTS.semibold}]}
            />
            <Text style={styles.unit}>RWF</Text>
          </View>
        </View>

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

      {/* Create */}
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
  typeGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  typeCard: {
    width: '47.5%',
    padding: 13,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    gap: 4,
  },
  typeCardActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.4)'},
  typeName: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text, marginTop: 4},
  typeSub: {fontFamily: FONTS.regular, fontSize: 10.5, color: T.text2},
  label: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text2, marginBottom: 8},
  catChipWrap: {
    alignItems: 'center',
    gap: 5,
    width: 78,
    paddingVertical: 10,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  catChipLabel: {fontFamily: FONTS.medium, fontSize: 10, color: T.text3, paddingHorizontal: 3},
  card: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
  },
  fieldRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10},
  fieldLabel: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, width: 70},
  fieldInput: {flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: T.text, textAlign: 'right', paddingVertical: 0},
  unit: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3},
  divider: {height: 1, backgroundColor: T.border},
  recurRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14},
  recurIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurTitle: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text},
  recurSub: {fontFamily: FONTS.regular, fontSize: 11, color: T.text2},
  switch: {width: 46, height: 28, borderRadius: 99, justifyContent: 'center'},
  knob: {position: 'absolute', width: 22, height: 22, borderRadius: 99, backgroundColor: '#fff'},
  freqRow: {flexDirection: 'row', gap: 8, paddingBottom: 14},
  freqBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  freqBtnActive: {backgroundColor: T.accentSoft, borderColor: 'rgba(34,197,94,0.3)'},
  freqText: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text2},
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
