// Pick the tags for one transaction, or create a new one by typing it.
//
// Typing a name that already exists (any case) offers that tag instead of
// "Create" — the same errand under two spellings would split its money across
// two reports, and nothing server-side prevents it (see migration v21).
import {useQuery} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {colorForName, findTagByName} from '../../shared/tags';
import {FONTS, R, T} from '../theme';
import type {TagRow} from '../tools/tags';
import {Icon} from './ui';

export function tagColor(t: {name: string | null; color: string | null}): string {
  return t.color || colorForName(t.name ?? '');
}

export function TagPill({tag, onRemove}: {tag: {name: string; color: string | null}; onRemove?: () => void}) {
  const c = tagColor(tag);
  return (
    <View style={[styles.pill, {backgroundColor: c + '26', borderColor: c + '55'}]}>
      <View style={[styles.dot, {backgroundColor: c}]} />
      <Text style={[styles.pillText, {color: c}]} numberOfLines={1}>
        {tag.name}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Icon name="X" size={11} color={c} strokeWidth={2.6} />
        </Pressable>
      )}
    </View>
  );
}

export default function TagPicker({
  visible,
  ownerId,
  selected,
  onToggle,
  onCreate,
  onClose,
}: {
  visible: boolean;
  ownerId: string;
  selected: string[];
  onToggle: (tag: TagRow) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const {data: tags} = useQuery<TagRow>(
    'SELECT id, name, color, note, archived FROM tags WHERE owner_id = ? ORDER BY created_at DESC',
    [ownerId],
  );
  const needle = q.trim().toLowerCase();
  // Archived tags stay listed while still ticked, so they can be removed.
  const shown = useMemo(
    () =>
      tags.filter(
        t =>
          (!t.archived || selected.includes(t.id)) &&
          (t.name ?? '').toLowerCase().includes(needle),
      ),
    [tags, needle, selected],
  );
  const exact = needle ? findTagByName(tags, q) : undefined;

  const submit = () => {
    if (!needle) {
      return;
    }
    if (exact) {
      onToggle(exact);
    } else {
      onCreate(q);
    }
    setQ('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}>Tags</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Group payments by what they were for. Tag the money that comes back too, and the tag
          shows as settled when it evens out.
        </Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={submit}
          placeholder="Find or create, e.g. Shopping for Aline"
          placeholderTextColor={T.text3}
          style={styles.input}
          returnKeyType="done"
        />
        <ScrollView style={{maxHeight: 280}} keyboardShouldPersistTaps="handled">
          {needle !== '' && !exact && (
            <Pressable onPress={submit} style={({pressed}) => [styles.row, {opacity: pressed ? 0.7 : 1}]}>
              <Icon name="Plus" size={16} color={T.accent} strokeWidth={2.4} />
              <Text style={[styles.rowText, {color: T.accent}]}>Create “{q.trim()}”</Text>
            </Pressable>
          )}
          {shown.map(t => {
            const on = selected.includes(t.id);
            const c = tagColor(t);
            return (
              <Pressable
                key={t.id}
                onPress={() => onToggle(t)}
                style={({pressed}) => [styles.row, {opacity: pressed ? 0.7 : 1}]}>
                <View style={[styles.box, {borderColor: c, backgroundColor: on ? c : 'transparent'}]}>
                  {on && <Icon name="Check" size={12} color="#fff" strokeWidth={3} />}
                </View>
                <Text style={styles.rowText} numberOfLines={1}>
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
          {tags.length === 0 && needle === '' && (
            <Text style={styles.empty}>No tags yet — type a name above.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)'},
  card: {
    position: 'absolute',
    top: '18%',
    left: 20,
    right: 20,
    backgroundColor: T.surface,
    borderRadius: R.large,
    borderWidth: 1,
    borderColor: T.border,
    padding: 18,
    gap: 10,
  },
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontFamily: FONTS.bold, fontSize: 16, color: T.text},
  done: {fontFamily: FONTS.semibold, fontSize: 13.5, color: T.accent},
  hint: {fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 16, color: T.text3},
  input: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: T.text,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10},
  rowText: {flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, color: T.text},
  box: {width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center'},
  empty: {fontFamily: FONTS.regular, fontSize: 12.5, color: T.text3, paddingVertical: 12},
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: 1,
    maxWidth: 170,
  },
  dot: {width: 6, height: 6, borderRadius: 3},
  pillText: {fontFamily: FONTS.semibold, fontSize: 11.5, lineHeight: 15, flexShrink: 1},
});
