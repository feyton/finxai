/**
 * People & places — who your money goes to and comes from.
 *
 * Places (kind 'merchant') are the shops and services paid most often: tell it
 * once what a place IS ("Hope Bread → Groceries") and its payments are filed
 * that way, like a known person, with no AI call.
 *
 * The helper the owner asked for: rather than a form to fill in, it lists the
 * counterparties you deal with most that FinXAI does not know yet ("Who is
 * Claudine? 6 payments") with one-tap relationships. Once known, a person's
 * payments are filed by relationship with no AI call (src/tools/people.ts), and
 * their past generic payments can be re-filed in one confirmation.
 */
import {usePowerSync, useQuery} from '@powersync/react-native';
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {Icon} from '../Components/ui';
import {appAlert} from '../Components/AppDialog';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, CategoryId, FONTS, R, T, categoriesForType, fmtAmount} from '../theme';
import {
  Person,
  PersonSuggestion,
  PlaceSuggestion,
  RELATIONSHIPS,
  RELATIONSHIP_ORDER,
  Relationship,
  applyRefile,
  deletePerson,
  personCategory,
  personFromRow,
  planRefile,
  savePerson,
  suggestPeople,
  suggestPlaces,
} from '../tools/people';

// The usual category first (what it is filed as today), then every spending
// category — a place is something you buy FROM.
function CategoryChips({
  usual,
  value,
  onPick,
}: {
  usual?: CategoryId | null;
  value?: CategoryId | null;
  onPick: (c: CategoryId) => void;
}) {
  const all = categoriesForType('expense');
  const ordered = usual && all.includes(usual) ? [usual, ...all.filter(c => c !== usual)] : all;
  return (
    <View style={styles.chips}>
      {ordered.map(c => {
        const on = value === c;
        return (
          <Pressable
            key={c}
            onPress={() => onPick(c)}
            style={[styles.chip, on && styles.chipOn, c === usual && !value && styles.chipUsual]}>
            <Text style={[styles.chipText, on && {color: T.text}]}>{CATS[c].label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlaceCard({s, onPick}: {s: PlaceSuggestion; onPick: (c: CategoryId) => void}) {
  const [open, setOpen] = useState(!s.usual);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Icon name="ShoppingBag" size={16} color={T.accent} strokeWidth={2.2} />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
          <Text style={styles.meta}>{s.count} payments · {fmtAmount(s.outTotal)} out</Text>
        </View>
      </View>
      {/* Most places are already filed right: confirming that is ONE tap. */}
      {s.usual && !open && (
        <View style={styles.confirmRow}>
          <Pressable onPress={() => onPick(s.usual!)} style={({pressed}) => [styles.confirmBtn, {opacity: pressed ? 0.85 : 1}]}>
            <Icon name="Check" size={14} color={T.accentInk} strokeWidth={2.6} />
            <Text style={styles.confirmText} numberOfLines={1}>{CATS[s.usual].label}</Text>
          </Pressable>
          <Pressable onPress={() => setOpen(true)} style={styles.changeBtn}>
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        </View>
      )}
      {open && <CategoryChips usual={s.usual} onPick={onPick} />}
    </View>
  );
}

const PAGE = 4;

function filingLine(p: Person): string {
  if (p.kind === 'merchant') {
    return p.categoryOut ? `Filed as ${CATS[p.categoryOut].label}` : 'Ask me each time';
  }
  const out = personCategory(p, 'debit');
  const inn = personCategory(p, 'credit');
  const part = (c: ReturnType<typeof personCategory>) =>
    c ? `${CATS[c.category].label}${c.subcategory ? ` › ${c.subcategory}` : ''}` : 'ask me';
  return `Out: ${part(out)} · In: ${part(inn)}`;
}

function RelationshipChips({
  value,
  onPick,
}: {
  value?: Relationship;
  onPick: (r: Relationship) => void;
}) {
  return (
    <View style={styles.chips}>
      {RELATIONSHIP_ORDER.map(r => {
        const on = value === r;
        return (
          <Pressable key={r} onPress={() => onPick(r)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && {color: T.text}]}>{RELATIONSHIPS[r].short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PeopleScreen({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const insets = useSafeAreaInsets();
  const [suggestions, setSuggestions] = useState<PersonSuggestion[]>([]);
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [morePeople, setMorePeople] = useState(false);
  const [morePlaces, setMorePlaces] = useState(false);

  const {data: rows} = useQuery('SELECT * FROM people WHERE owner_id = ? ORDER BY name', [userId ?? '']);
  const people = ((rows as any[]) ?? []).map(personFromRow);

  const refresh = useCallback(() => {
    if (userId) {
      suggestPeople(db, userId).then(setSuggestions).catch(() => setSuggestions([]));
      suggestPlaces(db, userId).then(setPlaces).catch(() => setPlaces([]));
    }
  }, [db, userId]);
  useEffect(refresh, [refresh, rows?.length]);

  // Save, then offer to re-file what is already there — with the count, before
  // anything changes. Only generic rows move (see planRefile).
  const identify = async (
    s: {name: string; spellings: string[]; phones: string[]},
    rel: Relationship,
    place?: CategoryId,
  ) => {
    if (!userId) return;
    const saved = await savePerson(db, userId, {
      kind: place ? 'merchant' : 'person',
      name: s.name,
      spellings: s.spellings,
      phones: s.phones,
      relationship: rel,
      categoryOut: place ?? null,
    });
    const plans = await planRefile(db, userId, saved);
    refresh();
    if (!plans.length) return;
    const first = plans[0];
    appAlert(
      `Re-file ${plans.length} past payment${plans.length === 1 ? '' : 's'}?`,
      saved.kind === 'merchant'
        ? `Your earlier payments at ${saved.name} would be filed as ${CATS[first.category].label}. Splits and transfers stay as they are.`
        : `${saved.name}'s earlier payments filed as Other or generic family/transfer would move to how you just described them (e.g. ${CATS[first.category].label}). Anything you filed specifically stays as it is.`,
      [
        {text: 'Not now', style: 'cancel'},
        {
          text: 'Re-file',
          onPress: async () => {
            const n = await applyRefile(db, plans);
            appAlert('Done', `${n} payment${n === 1 ? '' : 's'} re-filed.`);
          },
        },
      ],
    );
  };

  const leave = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={leave} style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>People & places</Text>
          <Text style={styles.subtitle}>Tell FinXAI once who someone is, or what a place is — it files their payments from then on.</Text>
        </View>
      </View>

      <FlatList
        data={people}
        keyExtractor={p => p.id}
        contentContainerStyle={[styles.list, {paddingBottom: 24 + insets.bottom}]}
        ListHeaderComponent={
          <>
            {/* People first: identifying them is what files the payments still
                left in Other. Then places. Four of each, the rest on request. */}
            {suggestions.length > 0 && (
              <View style={{marginBottom: 14}}>
                <Text style={styles.section}>Who is this?</Text>
                {suggestions.slice(0, morePeople ? 20 : PAGE).map(sg => (
                  <View key={sg.key} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={styles.avatar}>
                        <Icon name="User" size={16} color={T.accent} strokeWidth={2.2} />
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={styles.name} numberOfLines={1}>{sg.name}</Text>
                        <Text style={styles.meta}>
                          {sg.count} payments
                          {sg.outTotal ? ` · ${fmtAmount(sg.outTotal)} out` : ''}
                          {sg.inTotal ? ` · ${fmtAmount(sg.inTotal)} in` : ''}
                        </Text>
                      </View>
                    </View>
                    <RelationshipChips onPick={rel => identify(sg, rel)} />
                  </View>
                ))}
                {suggestions.length > PAGE && (
                  <Pressable onPress={() => setMorePeople(v => !v)} style={styles.more}>
                    <Text style={styles.moreText}>
                      {morePeople ? 'Show fewer' : `Show ${Math.min(suggestions.length, 20) - PAGE} more`}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {places.length > 0 && (
              <View style={{marginBottom: 14}}>
                <Text style={styles.section}>Your regular places</Text>
                {places.slice(0, morePlaces ? 20 : PAGE).map(pl => (
                  <PlaceCard key={pl.key} s={pl} onPick={c => identify(pl, 'business', c)} />
                ))}
                {places.length > PAGE && (
                  <Pressable onPress={() => setMorePlaces(v => !v)} style={styles.more}>
                    <Text style={styles.moreText}>
                      {morePlaces ? 'Show fewer' : `Show ${Math.min(places.length, 20) - PAGE} more`}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {suggestions.length === 0 && places.length === 0 && people.length === 0 && (
              <Text style={styles.empty}>
                Nobody to ask about yet. As you pay people and places by MoMo, the ones you deal
                with most will appear here.
              </Text>
            )}
            {people.length > 0 && <Text style={styles.section}>Known</Text>}
          </>
        }
        renderItem={({item}) => (
          <Pressable onPress={() => setEditing(editing === item.id ? null : item.id)} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.avatar}>
                <Icon name={item.kind === 'merchant' ? 'ShoppingBag' : 'Users'} size={16} color={T.accent} strokeWidth={2.2} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                  {item.kind === 'merchant' ? '' : ` · ${RELATIONSHIPS[item.relationship].label}`}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>{filingLine(item)}</Text>
              </View>
              <Icon name={editing === item.id ? 'ChevronDown' : 'ChevronRight'} size={16} color={T.text3} strokeWidth={2.2} />
            </View>
            {editing === item.id && (
              <>
                {item.kind === 'merchant' ? (
                  <CategoryChips
                    value={item.categoryOut}
                    onPick={c =>
                      identify({name: item.name, spellings: item.matchKeys, phones: item.phones}, 'business', c)
                    }
                  />
                ) : (
                  <RelationshipChips
                    value={item.relationship}
                    onPick={rel =>
                      identify({name: item.name, spellings: item.matchKeys, phones: item.phones}, rel)
                    }
                  />
                )}
                <Pressable
                  onPress={() =>
                    appAlert(`Forget ${item.name}?`, 'Their past payments stay as they are.', [
                      {text: 'Cancel', style: 'cancel'},
                      {text: 'Forget', style: 'destructive', onPress: () => deletePerson(db, item.id)},
                    ])
                  }
                  style={styles.forget}>
                  <Text style={styles.forgetText}>Forget this person</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16},
  iconBtn: {width: 36, height: 36, borderRadius: R.iconBtn, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surface},
  title: {fontFamily: FONTS.semibold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3},
  list: {paddingHorizontal: 16, gap: 8},
  section: {fontFamily: FONTS.medium, fontSize: 12, color: T.text3, marginBottom: 8},
  empty: {fontFamily: FONTS.regular, fontSize: 13, color: T.text3, lineHeight: 19, padding: 8},
  card: {padding: 12, borderRadius: R.card, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, marginBottom: 8, gap: 10},
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: 10},
  avatar: {width: 34, height: 34, borderRadius: R.pill, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center'},
  name: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  meta: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 1},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border},
  chipOn: {borderColor: T.accent, backgroundColor: T.accentSoft},
  chipUsual: {borderColor: T.accent + '66'},
  confirmRow: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: R.pill,
    backgroundColor: T.accent,
    paddingHorizontal: 12,
  },
  confirmText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.accentInk},
  changeBtn: {height: 38, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: T.border2, justifyContent: 'center'},
  changeText: {fontFamily: FONTS.medium, fontSize: 13, color: T.text2},
  more: {alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14},
  moreText: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.accent},
  chipText: {fontFamily: FONTS.medium, fontSize: 12, color: T.text2},
  forget: {alignSelf: 'flex-start', paddingVertical: 4},
  forgetText: {fontFamily: FONTS.medium, fontSize: 12.5, color: T.expense},
});
