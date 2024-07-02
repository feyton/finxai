/* eslint-disable react-native/no-inline-styles */
// CategoryManagementScreen.js

import {useQuery, useRealm, useUser} from '@realm/react';
import React, {useEffect, useState} from 'react';
import {
  Button,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {TouchableOpacity} from 'react-native-gesture-handler';
import {BSON} from 'realm';
import EmojiPicker from 'rn-emoji-picker';
import {emojis} from 'rn-emoji-picker/dist/data';
import {COLORS, FONTS} from '../assets/images';
import {Category} from '../tools/Schema';
import categoriesData from '../tools/data.json';

function CategoryManagementScreen() {
  const categories = useQuery(Category);

  const realm = useRealm();
  const user = useUser();

  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('');
  const [categoryType, setCategoryType] = useState('expense');
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

  const createInitialCategories = async () => {
    if (categories.length === 0) {
      realm.write(() => {
        categoriesData.categories.forEach(catData => {
          realm.create('Category', {
            _id: new BSON.ObjectId(),
            name: catData.name,
            icon: catData.icon,
            type: catData.type,
            owner_id: user.id,
            subcategories: catData.subcategories.map(subcat => ({
              _id: new BSON.ObjectId(),
              name: subcat.name,
              icon: subcat.icon,
            })),
          });
        });
      });
    }
  };

  useEffect(() => {
    // Prepopulate categories on initial render if needed
    realm.subscriptions.update(mutableSubs => {
      mutableSubs.add(realm.objects(Category));
    });
  }, []);

  const handleSaveCategory = () => {
    realm.write(() => {
      if (isEditing) {
        selectedCategory.name = categoryName;
      } else {
        realm.create('Category', {
          _id: new BSON.ObjectID(),
          name: categoryName,
          icon: categoryIcon,
          subcategories: [],
          owner_id: user.id,
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
      <View style={{justifyContent: 'center', alignItems: 'center'}}>
        <TouchableOpacity
          onPress={handleAddCategory}
          style={{
            backgroundColor: COLORS.buttonSecondary,
            padding: 10,
            borderRadius: 10,
            paddingHorizontal: 20,
            marginVertical: 10,
          }}>
          <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
            Add Category
          </Text>
        </TouchableOpacity>
      </View>

      {categories.length === 0 && (
        <View
          style={{
            marginTop: 50,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <Text
            style={{
              fontFamily: FONTS.regular,
              color: 'white',
              marginHorizontal: 10,
            }}>
            Seems like you have no categories defined
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: COLORS.buttonPrimary,
              padding: 10,
              borderRadius: 10,
              paddingHorizontal: 20,
              marginVertical: 10,
            }}
            onPress={() => createInitialCategories()}>
            <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
              Add initial categories
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={categories}
        keyExtractor={item => item._id.toString()}
        renderItem={({item}) => (
          <View
            style={{
              ...styles.categoryItem,
              backgroundColor:
                item.type === 'income' ? '#425b3b87' : '#5b3b3b86',
            }}>
            <Text style={styles.categoryText}>
              {item.icon} {item.name}
            </Text>

            <FlatList
              data={item.subcategories}
              keyExtractor={(subcat, index) => index.toString()}
              renderItem={({item: subcat}) => (
                <View style={styles.subcategoryItem}>
                  <Text style={styles.subcategoryText}>
                    {subcat.icon} {subcat.name}
                  </Text>
                </View>
              )}
            />
          </View>
        )}
      />

      <Modal
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalView}>
          <EmojiPicker
            emojis={emojis} // emojis data source see data/emojis
            autoFocus={false} // autofocus search input
            loading={false} // spinner for if your emoji data or recent store is async
            darkMode={true} // to be or not to be, that is the question
            perLine={10} // # of emoji's per line
            onSelect={data => setCategoryIcon(data.emoji)} // callback when user selects emoji - returns emoji obj
            // enabledCategories={[
            //   // optional list of enabled category keys
            //   'emojis',
            //   'activities',
            //   'food',
            //   'places',
            //   'nature',
            // ]}
            defaultCategory={'activities'} // optional default category key
          />

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
    backgroundColor: COLORS.bgPrimary,
  },
  categoryItem: {
    padding: 16,
    backgroundColor: COLORS.bgSecondary,
    marginVertical: 5,
    borderRadius: 10,
  },
  categoryText: {
    fontSize: 18,
    marginBottom: 8,
    fontFamily: FONTS.bold,
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
    fontSize: 15,
    fontFamily: FONTS.regular,
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    padding: 16,
    flexDirection: 'column',
  },
});

export default CategoryManagementScreen;
