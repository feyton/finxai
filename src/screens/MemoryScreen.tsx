/**
 * What FinXAI knows about you — the facts the SMS classifier reads.
 *
 * Plain sentences, in the user's words (see src/tools/memory.ts for why this is
 * notes-and-a-cloud-model rather than an on-device AI). Shown in full so the
 * user can see exactly what is sent along with their SMS, and remove anything —
 * a memory nobody can inspect is one nobody can trust.
 */
import {usePowerSync, useQuery} from '@powersync/react-native';
import React, {useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {formatDistanceToNowStrict} from 'date-fns';

import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {MEMORY_MAX_CHARS, addMemory, cleanMemoryText, deleteMemory} from '../tools/memory';
import {FONTS, R, T} from '../theme';

// Shown when empty — what a useful memory looks like is not obvious.
const EXAMPLES = [
  '0788 000 000 is my landlord — that is rent',
  'Money to my mother is family support, never a loan',
  'Hope Bread is the bakery near the office',
  'Transfers to MoKash are savings',
];

function when(at: string | null): string {
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? formatDistanceToNowStrict(d, {addSuffix: true}) : '';
}

export default function MemoryScreen({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  const {data: memories} = useQuery(
    `SELECT id, text, source, created_at FROM memories
      WHERE owner_id = ? ORDER BY created_at DESC`,
    [userId ?? ''],
  );

  const save = async () => {
    const text = cleanMemoryText(draft);
    if (!text || !userId) {
      return;
    }
    const id = await addMemory(db, userId, text, {source: 'user'});
    setNote(id ? '' : 'Already remembered.');
    if (id) {
      setDraft('');
    }
  };

  const leave = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home');

  const list = (memories as any[]) ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={leave}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>What FinXAI knows</Text>
          <Text style={styles.subtitle}>
            Read by the AI with every SMS, so it stops asking.
          </Text>
        </View>
      </View>

      <View style={styles.addWrap}>
        <TextInput
          value={draft}
          onChangeText={t => {
            setDraft(t);
            setNote('');
          }}
          placeholder="Tell FinXAI something only you know…"
          placeholderTextColor={T.text3}
          style={styles.input}
          multiline
          maxLength={MEMORY_MAX_CHARS}
        />
        <Pressable
          onPress={save}
          disabled={!cleanMemoryText(draft)}
          style={({pressed}) => [
            styles.addBtn,
            {opacity: !cleanMemoryText(draft) ? 0.4 : pressed ? 0.85 : 1},
          ]}>
          <Icon name="Plus" size={16} color={T.accentInk} strokeWidth={2.6} />
          <Text style={styles.addText}>Remember</Text>
        </Pressable>
      </View>
      {!!note && <Text style={styles.note}>{note}</Text>}

      <FlatList
        data={list}
        keyExtractor={m => m.id}
        contentContainerStyle={[styles.list, {paddingBottom: 24 + insets.bottom}]}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing yet. Things worth telling it:</Text>
            {EXAMPLES.map(e => (
              <Pressable key={e} onPress={() => setDraft(e)} style={styles.example}>
                <Text style={styles.exampleText}>“{e}”</Text>
              </Pressable>
            ))}
            <Text style={styles.emptyHint}>
              You can also tell the AI Coach: “remember that …”.
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.row}>
            <Icon name="Brain" size={15} color={T.accent} strokeWidth={2.2} />
            <View style={{flex: 1}}>
              <Text style={styles.rowText}>{item.text}</Text>
              <Text style={styles.rowMeta}>
                {item.source === 'coach' ? 'From the coach' : 'You added this'}
                {when(item.created_at) ? ` · ${when(item.created_at)}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => deleteMemory(db, item.id)} hitSlop={10}>
              <Icon name="X" size={16} color={T.text3} strokeWidth={2.2} />
            </Pressable>
          </View>
        )}
      />
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
  addWrap: {
    marginHorizontal: 16,
    padding: 12,
    gap: 10,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  input: {
    minHeight: 44,
    padding: 0,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: T.text,
    textAlignVertical: 'top',
  },
  addBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: R.pill,
    backgroundColor: T.accent,
  },
  addText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.accentInk},
  note: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginHorizontal: 20, marginTop: 6},
  list: {padding: 16, gap: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: R.card,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  rowText: {fontFamily: FONTS.medium, fontSize: 14, color: T.text, lineHeight: 20},
  rowMeta: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, marginTop: 4},
  empty: {paddingTop: 8, gap: 8},
  emptyTitle: {fontFamily: FONTS.medium, fontSize: 13, color: T.text2, marginBottom: 2},
  example: {
    padding: 12,
    borderRadius: R.small,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  exampleText: {fontFamily: FONTS.regular, fontSize: 13, color: T.text2},
  emptyHint: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 6},
});
