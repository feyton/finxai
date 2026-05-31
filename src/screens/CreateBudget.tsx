import {Picker} from '@react-native-picker/picker';
import {usePowerSync} from '@powersync/react-native';
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
import {useCurrentUser} from '../hooks/useCurrentUser';
import categoriesData from '../tools/data.json';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface BudgetItem {
  categoryName: string;
  subcategoryName: string;
  amount: number;
}

interface Props {
  navigation: any;
}

const BudgetScreen: React.FC<Props> = ({navigation}) => {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const categories = categoriesData.categories;

  const [name, setName] = useState('');
  const [event, setEvent] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState('monthly');
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [currentCategory, setCurrentCategory] = useState('');
  const [currentSubcategory, setCurrentSubcategory] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');

  const selectedCategoryData = categories.find(c => c.name === currentCategory);

  const addItem = () => {
    if (currentCategory && currentAmount) {
      setItems([
        ...items,
        {
          categoryName: currentCategory,
          subcategoryName: currentSubcategory,
          amount: parseFloat(currentAmount),
        },
      ]);
      setCurrentCategory('');
      setCurrentSubcategory('');
      setCurrentAmount('');
    }
  };

  const createBudget = async () => {
    if (!name) {
      Alert.alert('A budget needs a name');
      return;
    }
    try {
      const budgetId = generateUUID();
      const now = new Date().toISOString();
      await db.execute(
        'INSERT INTO budgets (id, name, period, start_date, end_date, amount, recurring, event, shared_with, collaborators, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          budgetId,
          name,
          budgetPeriod,
          startDate || now,
          endDate || now,
          parseFloat(budgetAmount) || 0,
          recurring ? 1 : 0,
          event,
          '[]',
          '[]',
          userId ?? '',
          now,
        ],
      );
      for (const item of items) {
        await db.execute(
          'INSERT INTO budget_items (id, budget_id, category, subcategory, amount, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
          [
            generateUUID(),
            budgetId,
            item.categoryName,
            item.subcategoryName,
            item.amount,
            userId ?? '',
          ],
        );
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error creating budget: ' + err.message);
    }
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
            onValueChange={setBudgetPeriod}
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
            onValueChange={setRecurring}
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
            {items.map((item, i) => (
              <View style={styles.budgetItem} key={i}>
                <Text style={styles.budgetItemText}>
                  {item.categoryName} —{' '}
                  {item.subcategoryName || 'No Subcategory'}: {item.amount}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.budgetItemContainer}>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={currentCategory}
              onValueChange={setCurrentCategory}
              style={styles.picker}>
              <Picker.Item label="Select Category" value="" />
              {categories.map((cat, i) => (
                <Picker.Item
                  key={i}
                  label={`${cat.icon} ${cat.name}`}
                  value={cat.name}
                />
              ))}
            </Picker>
          </View>
          {selectedCategoryData && selectedCategoryData.subcategories.length > 0 && (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={currentSubcategory}
                onValueChange={setCurrentSubcategory}
                style={styles.picker}>
                <Picker.Item label="Select Subcategory" value="" />
                {selectedCategoryData.subcategories.map((sub, i) => (
                  <Picker.Item
                    key={i}
                    label={`${sub.icon} ${sub.name}`}
                    value={sub.name}
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
  container: {flex: 1, backgroundColor: '#121212'},
  scrollContainer: {padding: 16},
  header: {fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16},
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
  picker: {color: '#fff'},
  budgetItemContainer: {marginVertical: 8},
  budgetItem: {
    padding: 12,
    marginVertical: 4,
    backgroundColor: '#333',
    borderRadius: 10,
  },
  budgetItemText: {color: '#fff'},
  addButton: {
    backgroundColor: '#1E90FF',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 8,
  },
  addButtonText: {color: '#fff', fontWeight: 'bold'},
  saveButton: {
    backgroundColor: '#1E90FF',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 16,
  },
  saveButtonText: {color: '#fff', fontWeight: 'bold', fontSize: 18},
});

export default BudgetScreen;
