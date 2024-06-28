import {Picker} from '@react-native-picker/picker';
import {useQuery, useRealm} from '@realm/react';
import React, {useEffect, useState} from 'react';
import {Controller, useForm, useWatch} from 'react-hook-form';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import FloatingLabelInput from '../Components/FloatingInput';
import {COLORS} from '../assets/images';
import {Account, Budget, Category, Transaction} from '../tools/Schema';

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
  const accounts = useQuery(Account);
  const budgets = useQuery(Budget);
  const {
    control,
    handleSubmit,
    setValue,
    formState: {errors},
  } = useForm();
  const [record, setRecord] = useState({});
  const [subcategories, setSubcategories] = useState<any[]>([]);

  const categoryChange = useWatch({control, name: 'category'});
  const createRecord = (data: any) => {
    console.log(data);
  };

  useEffect(()=>{
    realm.subscriptions.update(mutableSubs => {
      mutableSubs.add(realm.objects(Budget));
      mutableSubs.add(realm.objects(Transaction));
      mutableSubs.add(realm.objects(Account));
    });
  },[])

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.header}>Create Record</Text>
        <FloatingLabelInput control={control} name="amount" label="Amount" />
        <Controller
          name="transaction_type"
          control={control}
          rules={{required: 'Transaction type is required'}}
          render={({field: {onChange, onBlur, value, ref}}: any) => (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={value}
                onValueChange={onChange}
                style={styles.picker}>
                <Picker.Item label={'Select type'} value={''} />
                <Picker.Item label={'Income'} value={'income'} />
                <Picker.Item label={'Expense'} value={'expense'} />
                <Picker.Item label={'Transfer'} value={'transfer'} />
              </Picker>
              <Text>{errors.transaction_type?.message}</Text>
            </View>
          )}
        />
        <Controller
          name="account"
          control={control}
          rules={{required: 'Account is required'}}
          render={({value}: any) => (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={value}
                onValueChange={itemValue => setValue('account', itemValue)}
                style={styles.picker}>
                {accounts.map((account: any) => (
                  <Picker.Item
                    key={account._id.toString()}
                    label={account.name}
                    value={account._id.toString()}
                  />
                ))}
              </Picker>
              <Text>{errors.account?.message}</Text>
            </View>
          )}
        />
        <Controller
          name="category"
          control={control}
          rules={{required: 'Category is required'}}
          render={({field: {onChange, onBlur, value, ref}}: any) => (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={value}
                onValueChange={onChange}
                style={styles.picker}>
                <Picker.Item value="" label="Select Category" />
                {categories.map((category: any) => (
                  <Picker.Item
                    key={category._id.toString()}
                    label={category.name}
                    value={category._id.toString()}
                  />
                ))}
              </Picker>
              <Text>{errors.category?.message}</Text>
            </View>
          )}
        />
        {categoryChange && (
          <Controller
            name="subcategory"
            control={control}
            rules={{}}
            render={({field: {onChange, onBlur, value, ref}}: any) => (
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={value}
                  onValueChange={onChange}
                  style={styles.picker}>
                  <Picker.Item value={''} label="Select Subcategory" />
                  {categories
                    .find(cat => cat._id == categoryChange)
                    .subcategories.map((subcategory: any) => (
                      <Picker.Item
                        key={subcategory._id.toString()}
                        label={subcategory.name}
                        value={subcategory._id.toString()}
                      />
                    ))}
                </Picker>
              </View>
            )}
          />
        )}

        <FloatingLabelInput control={control} name="payee" label="Payee" />
        <Controller
          name="budget"
          control={control}
          rules={{}}
          render={({field: {onChange, onBlur, value, ref}}: any) => (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={value}
                onValueChange={onChange}
                style={styles.picker}>
                {budgets.map((budget: any) => (
                  <Picker.Item
                    key={budget._id.toString()}
                    label={budget.name}
                    value={budget._id.toString()}
                  />
                ))}
              </Picker>
              <Text>{errors.budget?.message}</Text>
            </View>
          )}
        />
        <FloatingLabelInput control={control} name="note" label="Note" />
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
    backgroundColor: COLORS.bgPrimary,
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
