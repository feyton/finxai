import {useQuery} from '@powersync/react-native';
import React, {useMemo} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {CATS, CategoryId, FONTS, R, T, resolveCat} from '../theme';

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default function CategoryManagementScreen({navigation}: any) {
  const {userId} = useCurrentUser();

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

  const cats = Object.values(CATS);

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
          <Text style={styles.subtitle}>How AI labels your spending</Text>
        </View>
        <Pressable
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Plus" size={18} color={T.accent} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Grid */}
      <FlatList
        data={cats}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        renderItem={({item}) => (
          <View style={styles.card}>
            <View style={[styles.chip, {backgroundColor: item.color + '22'}]}>
              <Icon name={item.icon} size={18} color={item.color} strokeWidth={2} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.cardLabel} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={styles.cardCount}>
                {counts[item.id] ?? 0} this month
              </Text>
            </View>
          </View>
        )}
      />
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
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {padding: 16, paddingTop: 4, gap: 10},
  gridRow: {gap: 10},
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
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
});
