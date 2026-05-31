/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {COLORS, FONTS} from '../assets/images';
import categoriesData from '../tools/data.json';

function CategoryManagementScreen() {
  const categories = categoriesData.categories;

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={(item, index) => index.toString()}
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
    color: 'white',
  },
  subcategoryItem: {
    paddingLeft: 16,
    paddingVertical: 2,
  },
  subcategoryText: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: 'white',
  },
});

export default CategoryManagementScreen;
