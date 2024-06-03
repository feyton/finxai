// CategoryManagementScreen.js

import {useQuery, useRealm} from '@realm/react';
import React, {useState} from 'react';
import {
  Button,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Category} from '../tools/Schema';

function CategoryManagementScreen() {
  const realm = useRealm();
  const categories = useQuery(Category);

  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [subcategory, setSubcategory] = useState('');

  const handleAddCategory = () => {
    setIsEditing(false);
    setSelectedCategory(null);
    setCategoryName('');
    setSubcategory('');
    setModalVisible(true);
  };

  const handleEditCategory = category => {
    setIsEditing(true);
    setSelectedCategory(category);
    setCategoryName(category.name);
    setModalVisible(true);
  };

  const handleDeleteCategory = category => {
    realm.write(() => {
      realm.delete(category);
    });
  };

  const handleSaveCategory = () => {
    realm.write(() => {
      if (isEditing) {
        selectedCategory.name = categoryName;
      } else {
        realm.create('Category', {
          _id: new Realm.BSON.ObjectID(),
          name: categoryName,
          subcategories: [],
        });
      }
    });
    setModalVisible(false);
  };

  const handleAddSubcategory = category => {
    if (subcategory) {
      realm.write(() => {
        category.subcategories.push(subcategory);
      });
      setSubcategory('');
    }
  };

  const handleDeleteSubcategory = (category, subcat) => {
    realm.write(() => {
      category.subcategories = category.subcategories.filter(
        sub => sub !== subcat,
      );
    });
  };

  return (
    <View style={styles.container}>
      <Button title="Add Category" onPress={handleAddCategory} />
      <FlatList
        data={categories}
        keyExtractor={item => item._id.toString()}
        renderItem={({item}) => (
          <View style={styles.categoryItem}>
            <Text style={styles.categoryText}>{item.name}</Text>
            <View style={styles.categoryActions}>
              <Button title="Edit" onPress={() => handleEditCategory(item)} />
              <Button
                title="Delete"
                onPress={() => handleDeleteCategory(item)}
              />
            </View>
            <FlatList
              data={item.subcategories}
              keyExtractor={(subcat, index) => index.toString()}
              renderItem={({item: subcat}) => (
                <View style={styles.subcategoryItem}>
                  <Text style={styles.subcategoryText}>{subcat}</Text>
                  <Button
                    title="Delete"
                    onPress={() => handleDeleteSubcategory(item, subcat)}
                  />
                </View>
              )}
            />
            <View style={styles.addSubcategory}>
              <TextInput
                placeholder="Add Subcategory"
                value={subcategory}
                onChangeText={setSubcategory}
                style={styles.input}
              />
              <Button title="Add" onPress={() => handleAddSubcategory(item)} />
            </View>
          </View>
        )}
      />

      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalView}>
          <TextInput
            placeholder="Category Name"
            value={categoryName}
            onChangeText={setCategoryName}
            style={styles.input}
          />
          <View style={{flexDirection: 'row', gap: 2}}>
            <Button title="Save" onPress={handleSaveCategory} />
            <Button title="Cancel" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#000',
  },
  categoryItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  categoryText: {
    fontSize: 18,
    marginBottom: 8,
  },
  categoryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subcategoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 16,
  },
  subcategoryText: {
    fontSize: 16,
  },
  addSubcategory: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginVertical: 8,
    borderRadius: 10,
  },
  modalView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});

export default CategoryManagementScreen;
