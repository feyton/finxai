import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Card, Icon, Pill} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T, fmtAmount} from '../theme';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function ShoppingScreen({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();

  const {data: lists} = useQuery(
    'SELECT * FROM shopping_lists WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );
  const {data: items} = useQuery(
    'SELECT * FROM shopping_items WHERE owner_id = ?',
    [userId ?? ''],
  );

  const [addingList, setAddingList] = useState<string | null>(null);
  const [itemText, setItemText] = useState('');
  const [itemCost, setItemCost] = useState('');
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const byList = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const it of items as any[]) {
      if (!map[it.list_id]) {
        map[it.list_id] = [];
      }
      map[it.list_id].push(it);
    }
    return map;
  }, [items]);

  const toggle = async (item: any) => {
    await db.execute('UPDATE shopping_items SET done = ? WHERE id = ?', [
      item.done ? 0 : 1,
      item.id,
    ]);
  };

  const addItem = async (listId: string) => {
    const text = itemText.trim();
    if (!text) {
      return;
    }
    await db.execute(
      'INSERT INTO shopping_items (id, list_id, text, quantity, estimated_cost, done, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), listId, text, '1', parseFloat(itemCost.replace(/,/g, '')) || 0, 0, userId ?? ''],
    );
    setItemText('');
    setItemCost('');
  };

  const createList = async () => {
    const name = newListName.trim() || 'New list';
    await db.execute(
      'INSERT INTO shopping_lists (id, name, shared, shared_with, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), name, 0, '', userId ?? '', new Date().toISOString()],
    );
    setNewListName('');
    setNewListOpen(false);
  };

  const listArr = lists as any[];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>Shopping lists</Text>
          <Text style={styles.subtitle}>Plan spend before you shop</Text>
        </View>
        <Pressable
          onPress={() => setNewListOpen(true)}
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Plus" size={18} color={T.accent} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding: 16, paddingTop: 4, gap: 14, paddingBottom: 40}}>
        {listArr.map(list => {
          const listItems = byList[list.id] ?? [];
          const doneCount = listItems.filter(i => i.done).length;
          const est = listItems.reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
          const isAdding = addingList === list.id;
          return (
            <Card key={list.id} pad={0}>
              {/* List header */}
              <View style={styles.listHead}>
                <View style={styles.cartIcon}>
                  <Icon name="ShoppingCart" size={17} color={T.accent} strokeWidth={2} />
                </View>
                <View style={{flex: 1, minWidth: 0}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 7}}>
                    <Text style={styles.listName} numberOfLines={1}>{list.name}</Text>
                    {!!list.shared_with && (
                      <Pill size={9} color={T.info} bg={T.info + '20'}>{list.shared_with}</Pill>
                    )}
                  </View>
                  <Text style={styles.listMeta}>
                    {doneCount}/{listItems.length} done · est {fmtAmount(est)} RWF
                  </Text>
                </View>
              </View>

              {/* Items */}
              {listItems.map(item => (
                <Pressable
                  key={item.id}
                  onPress={() => toggle(item)}
                  style={({pressed}) => [styles.itemRow, {opacity: pressed ? 0.7 : 1}]}>
                  <View style={[styles.check, item.done && styles.checkOn]}>
                    {!!item.done && <Icon name="Check" size={12} color={T.accentInk} strokeWidth={3} />}
                  </View>
                  <Text style={[styles.itemText, item.done && styles.itemDone]} numberOfLines={1}>
                    {item.text}
                    {item.quantity ? <Text style={styles.qty}>  ×{item.quantity}</Text> : null}
                  </Text>
                  <Text style={[styles.itemCost, item.done && styles.itemDone]}>
                    {fmtAmount(item.estimated_cost ?? 0)}
                  </Text>
                </Pressable>
              ))}

              {/* Add item */}
              {isAdding ? (
                <View style={styles.addRow}>
                  <TextInput
                    value={itemText}
                    onChangeText={setItemText}
                    placeholder="Item"
                    placeholderTextColor={T.text3}
                    style={styles.addInput}
                    autoFocus
                  />
                  <TextInput
                    value={itemCost}
                    onChangeText={setItemCost}
                    placeholder="0"
                    placeholderTextColor={T.text3}
                    keyboardType="numeric"
                    style={styles.addCost}
                  />
                  <Pressable
                    onPress={() => addItem(list.id)}
                    style={({pressed}) => [styles.addOk, {opacity: pressed ? 0.7 : 1}]}>
                    <Icon name="Check" size={15} color={T.accentInk} strokeWidth={2.6} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setAddingList(list.id);
                    setItemText('');
                    setItemCost('');
                  }}
                  style={({pressed}) => [styles.addItemBtn, {opacity: pressed ? 0.7 : 1}]}>
                  <Icon name="Plus" size={15} color={T.text3} strokeWidth={2.2} />
                  <Text style={styles.addItemText}>Add item</Text>
                </Pressable>
              )}
            </Card>
          );
        })}

        {listArr.length === 0 && (
          <Card style={{alignItems: 'center', gap: 6}} pad={24}>
            <Icon name="ShoppingCart" size={36} color={T.text3} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No shopping lists yet</Text>
            <Text style={styles.emptyHint}>Create one to plan spend before you shop</Text>
          </Card>
        )}
      </ScrollView>

      {/* Create-list modal */}
      <Modal visible={newListOpen} transparent animationType="fade" onRequestClose={() => setNewListOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setNewListOpen(false)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>New shopping list</Text>
          <TextInput
            value={newListName}
            onChangeText={setNewListName}
            placeholder="e.g. Weekly groceries"
            placeholderTextColor={T.text3}
            style={styles.modalInput}
            autoFocus
          />
          <Pressable
            onPress={createList}
            style={({pressed}) => [styles.modalBtn, {opacity: pressed ? 0.85 : 1}]}>
            <Text style={styles.modalBtnText}>Create list</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  iconBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center'},
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  addBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center'},
  listHead: {flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: T.border},
  cartIcon: {width: 38, height: 38, borderRadius: 12, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center'},
  listName: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text, flexShrink: 1},
  listMeta: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2, marginTop: 1},
  itemRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.border},
  check: {width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: T.border2, alignItems: 'center', justifyContent: 'center'},
  checkOn: {backgroundColor: T.accent, borderColor: T.accent},
  itemText: {flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, color: T.text},
  qty: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3},
  itemCost: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text2},
  itemDone: {color: T.text3, textDecorationLine: 'line-through'},
  addItemBtn: {flexDirection: 'row', alignItems: 'center', gap: 7, padding: 13, paddingLeft: 14},
  addItemText: {fontFamily: FONTS.medium, fontSize: 13, color: T.text3},
  addRow: {flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12},
  addInput: {flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: R.small, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, fontFamily: FONTS.medium, fontSize: 13, color: T.text},
  addCost: {width: 84, paddingHorizontal: 12, paddingVertical: 9, borderRadius: R.small, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, fontFamily: FONTS.medium, fontSize: 13, color: T.text, textAlign: 'right'},
  addOk: {width: 38, height: 38, borderRadius: R.small, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center'},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  emptyHint: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, textAlign: 'center'},
  overlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)'},
  modalCard: {position: 'absolute', top: '38%', left: 24, right: 24, backgroundColor: T.surface, borderRadius: R.large, borderWidth: 1, borderColor: T.border, padding: 18, gap: 12},
  modalTitle: {fontFamily: FONTS.bold, fontSize: 15, color: T.text},
  modalInput: {paddingHorizontal: 14, paddingVertical: 11, borderRadius: R.small, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, fontFamily: FONTS.medium, fontSize: 14, color: T.text},
  modalBtn: {alignItems: 'center', paddingVertical: 12, borderRadius: R.card, backgroundColor: T.accent},
  modalBtnText: {fontFamily: FONTS.bold, fontSize: 14, color: T.accentInk},
});
