import {Picker} from '@react-native-picker/picker';
import {useQuery, useRealm} from '@realm/react';
import React, {useState} from 'react';
import {Controller, useForm} from 'react-hook-form';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import FloatingLabelInput from '../Components/FloatingInput';
import {Category} from '../tools/Schema';

interface BudgetItem {
  category: string;
  subcategory: string;
  amount: number;
}

interface Props {
  navigation: any; // You should replace 'any' with the appropriate type for navigation
}

const CreateRecord: React.FC<Props> = ({navigation}) => {
  const realm = useRealm();
  const categories = useQuery(Category);
  const {control, handleSubmit, setValue} = useForm();
  const [record, setRecord] = useState({});

  const createRecord = (data: any) => {
    console.log(data);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.header}>Create Record</Text>
        <FloatingLabelInput control={control} name="note" label="Note" />
        <Controller
          name="category"
          control={control}
          rules={{required: 'Category is required'}}
          render={({value}: any) => (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={value}
                onValueChange={itemValue => setValue('category', itemValue)}
                style={styles.picker}>
                {categories.map((category: any) => (
                  <Picker.Item
                    key={category._id.toString()}
                    label={category.name}
                    value={category.name}
                  />
                ))}
              </Picker>
            </View>
          )}
        />
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSubmit(createRecord)}>
          <Text style={styles.saveButtonText}>Save Record</Text>
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

export default CreateRecord;
