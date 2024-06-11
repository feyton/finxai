import {Picker} from '@react-native-picker/picker';
import {useQuery, useRealm} from '@realm/react';
import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {BSON} from 'realm';
import {Category} from '../tools/Schema';

interface BudgetItem {
  category: string;
  subcategory: string;
  amount: number;
}

interface Props {
  navigation: any; // You should replace 'any' with the appropriate type for navigation
}

const BudgetScreen: React.FC<Props> = ({navigation}) => {
  const realm = useRealm();
  const categories = useQuery(Category);

  const [name, setName] = useState<string>('');
  const [event, setEvent] = useState<string>('');
  const [recurring, setRecurring] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [budgetPeriod, setBudgetPeriod] = useState<string>('Monthly');
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [budgetAmount, setBudgetAmount] = useState<string>('');
  const [currentCategory, setCurrentCategory] = useState<string>();
  const [currentSubcategory, setCurrentSubcategory] = useState<string>();
  const [currentAmount, setCurrentAmount] = useState<string>('');

  const addItem = () => {
    if (currentCategory && currentAmount) {
      const cat = categories.find(cat => cat._id.toString() == currentCategory);
      setItems([
        ...items,
        {
          category: cat,
          subcategory: cat?.subcategories.find(
            sub => sub._id.toString() == currentSubcategory,
          ),
          amount: parseFloat(currentAmount),
        },
      ]);

      setCurrentCategory('');
      setCurrentSubcategory('');
      setCurrentAmount('');
    }
    console.log(items);
  };

  const createBudget = () => {
    if (!name || items.length == 0) {
      Alert.alert('A budget Need A name');
      return;
    }
    realm.write(() => {
      realm.create('Budget', {
        _id: new BSON.ObjectID(),
        name,
        amount: parseFloat(budgetAmount),
        event,
        recurring,
        start_date: new Date(startDate),
        end_date: new Date(endDate),
        items: items.map(item => ({
          category: item.category,
          subcategory: item.subcategory,
          amount: item.amount,
        })),
        shared_with: [],
      });
    });
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.header}>Create Budget</Text>
        <TextInput
          placeholder="Budget Name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          placeholder="Budget Amount"
          placeholderTextColor="#999"
          value={budgetAmount}
          onChangeText={setBudgetAmount}
          keyboardType="numeric"
          style={styles.input}
        />
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={budgetPeriod}
            onValueChange={itemValue => setBudgetPeriod(itemValue)}
            style={styles.picker}>
            <Picker.Item label="Monthly" value="monthly" />
            <Picker.Item label="Weekly" value="weekly" />
            <Picker.Item label="Custom" value="custom" />
          </Picker>
        </View>
        <TextInput
          placeholder="Event (Optional)"
          placeholderTextColor="#999"
          value={event}
          onChangeText={setEvent}
          style={styles.input}
        />
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={recurring}
            onValueChange={itemValue => setRecurring(itemValue)}
            style={styles.picker}>
            <Picker.Item label="One-time Event" value={false} />
            <Picker.Item label="Recurring Budget" value={true} />
          </Picker>
        </View>
        <TextInput
          placeholder="Start Date (YYYY-MM-DD)"
          placeholderTextColor="#999"
          value={startDate}
          onChangeText={setStartDate}
          style={styles.input}
        />
        <TextInput
          placeholder="End Date (YYYY-MM-DD)"
          placeholderTextColor="#999"
          value={endDate}
          onChangeText={setEndDate}
          style={styles.input}
        />
        {items.length > 0 && (
          <>
            {items.map(item => (
              <View style={styles.budgetItem}>
                <Text style={styles.budgetItemText}>
                  {item.category.name} -{' '}
                  {item.subcategory?.name || 'No Subcategory'}: ${item.amount}
                </Text>
              </View>
            ))}
          </>
        )}
        <View style={styles.budgetItemContainer}>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={currentCategory}
              onValueChange={itemValue => setCurrentCategory(itemValue)}
              style={styles.picker}>
              <Picker.Item label="Select Category" value="" />
              {categories.map(cat => (
                <Picker.Item
                  key={cat._id.toString()}
                  label={cat.name}
                  value={cat._id.toString()}
                />
              ))}
            </Picker>
          </View>
          {currentCategory && (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={currentSubcategory}
                onValueChange={itemValue => setCurrentSubcategory(itemValue)}
                style={styles.picker}>
                <Picker.Item label="Select Subcategory" value="" />
                {categories
                  .find(cat => cat._id.toString() === currentCategory)
                  ?.subcategories.map(subcat => (
                    <Picker.Item
                      key={subcat._id.toString()}
                      label={subcat.name}
                      value={subcat._id.toString()}
                    />
                  ))}
              </Picker>
            </View>
          )}
          <TextInput
            placeholder="Amount"
            placeholderTextColor="#999"
            value={currentAmount}
            onChangeText={setCurrentAmount}
            keyboardType="numeric"
            style={styles.input}
          />
          <TouchableOpacity style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={createBudget}>
          <Text style={styles.saveButtonText}>Save Budget</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContainer: {
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
    borderColor: '#333',
    borderRadius: 10,
    color: '#fff',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    marginVertical: 8,
  },
  picker: {
    color: '#fff',
  },
  budgetItemContainer: {
    marginVertical: 8,
  },
  budgetItem: {
    padding: 12,
    marginVertical: 4,
    backgroundColor: '#333',
    borderRadius: 10,
  },
  budgetItemText: {
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#1E90FF',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#1E90FF',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
});

export default BudgetScreen;
