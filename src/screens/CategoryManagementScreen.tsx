import {usePowerSync, useQuery} from '@powersync/react-native';
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
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {useSubcategories} from '../hooks/useSubcategories';
import {CATS, CategoryId, FONTS, R, T, resolveCat} from '../theme';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default function CategoryManagementScreen({navigation}: any) {
  const {userId} = useCurrentUser();
  const db = usePowerSync();
  const {subcatsFor} = useSubcategories();

  const [open, setOpen] = useState<CategoryId | null>(null);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [error, setError] = useState('');

  const {data: txns} = useQuery(
    'SELECT category FROM transactions WHERE owner_id = ? AND date_time >= ?',
    [userId ?? '', monthStart()],
  );

  const counts = useMemo(() => {
    const map = {} as Record<CategoryId, number>;
    for (const t of txns as any[]) {
      const id = resolveCat(t.category ?? '');
      map[id] = (map[id] ?? 0) + 1;
    }
    return map;
  }, [txns]);

  const toggleOpen = (id: CategoryId) => {
    setOpen(prev => (prev === id ? null : id));
    setNewName('');
    setNewIcon('');
    setError('');
  };

  const addSubcategory = async (cat: CategoryId) => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    const exists = subcatsFor(cat).some(
      s => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setError('That subcategory already exists');
      return;
    }
    try {
      await db.execute(
        'INSERT INTO subcategories (id, category, name, icon, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), cat, name, newIcon.trim() || '🏷️', userId ?? '', new Date().toISOString()],
      );
      setNewName('');
      setNewIcon('');
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not save');
    }
  };

  const removeSubcategory = async (id?: string) => {
    if (!id) {
      return;
    }
    await db.execute('DELETE FROM subcategories WHERE id = ?', [id]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={19} color={T.text} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>Categories</Text>
          <Text style={styles.subtitle}>
            Tap a category to manage its subcategories
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{flex: 1}} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {Object.values(CATS).map(item => {
            const isOpen = open === item.id;
            const subs = subcatsFor(item.id);
            return (
              <View key={item.id} style={styles.card}>
                <Pressable
                  onPress={() => toggleOpen(item.id)}
                  style={({pressed}) => [styles.cardHead, {opacity: pressed ? 0.8 : 1}]}>
                  <View style={[styles.chip, {backgroundColor: item.color + '22'}]}>
                    <Icon name={item.icon} size={18} color={item.color} strokeWidth={2} />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.cardLabel} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text style={styles.cardCount}>
                      {subs.length} subcategor{subs.length === 1 ? 'y' : 'ies'}
                      {' · '}
                      {counts[item.id] ?? 0} txns this month
                    </Text>
                  </View>
                  <Icon
                    name={isOpen ? 'ChevronDown' : 'ChevronRight'}
                    size={17}
                    color={T.text3}
                    strokeWidth={2}
                  />
                </Pressable>

                {isOpen && (
                  <View style={styles.subWrap}>
                    <View style={styles.subGrid}>
                      {subs.map(s => (
                        <View
                          key={s.name}
                          style={[styles.subChip, s.custom && styles.subChipCustom]}>
                          <Text style={{fontSize: 12}}>{s.icon}</Text>
                          <Text style={styles.subChipText} numberOfLines={1}>
                            {s.name}
                          </Text>
                          {s.custom && (
                            <Pressable onPress={() => removeSubcategory(s.id)} hitSlop={8}>
                              <Icon name="X" size={13} color={T.text3} strokeWidth={2.4} />
                            </Pressable>
                          )}
                        </View>
                      ))}
                      {subs.length === 0 && (
                        <Text style={styles.emptySubs}>No subcategories yet</Text>
                      )}
                    </View>

                    {/* Add row */}
                    <View style={styles.addRow}>
                      <TextInput
                        value={newIcon}
                        onChangeText={setNewIcon}
                        placeholder="🏷️"
                        placeholderTextColor={T.text3}
                        style={styles.iconInput}
                        maxLength={4}
                      />
                      <TextInput
                        value={newName}
                        onChangeText={t => {
                          setNewName(t);
                          setError('');
                        }}
                        placeholder={`New ${item.label} subcategory`}
                        placeholderTextColor={T.text3}
                        style={styles.nameInput}
                        onSubmitEditing={() => addSubcategory(item.id)}
                        returnKeyType="done"
                      />
                      <Pressable
                        onPress={() => addSubcategory(item.id)}
                        disabled={!newName.trim()}
                        style={({pressed}) => [
                          styles.addBtn,
                          {opacity: !newName.trim() ? 0.4 : pressed ? 0.8 : 1},
                        ]}>
                        <Icon name="Plus" size={16} color={T.accentInk} strokeWidth={2.6} />
                      </Pressable>
                    </View>
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  list: {padding: 16, paddingTop: 4, paddingBottom: 40, gap: 10},
  card: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  chip: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {fontFamily: FONTS.semibold, fontSize: 12.5, color: T.text},
  cardCount: {fontFamily: FONTS.regular, fontSize: 11, color: T.text3, marginTop: 1},
  subWrap: {
    borderTopWidth: 1,
    borderTopColor: T.border,
    padding: 12,
    gap: 10,
  },
  subGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 7},
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  subChipCustom: {borderColor: 'rgba(34,197,94,0.35)'},
  subChipText: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.text2, maxWidth: 160},
  emptySubs: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3},
  addRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  iconInput: {
    width: 46,
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    textAlign: 'center',
    fontSize: 14,
    color: T.text,
  },
  nameInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: T.text,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: R.small,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {fontFamily: FONTS.medium, fontSize: 11.5, color: T.expense},
});
