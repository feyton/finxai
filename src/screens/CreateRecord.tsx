import {Picker} from '@react-native-picker/picker';
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useState} from 'react';
import {Controller, useForm, useWatch} from 'react-hook-form';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import FloatingLabelInput from '../Components/FloatingInput';
import {COLORS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';
import categoriesData from '../tools/data.json';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface Props {
  navigation: any;
}

const CreateRecord: React.FC<Props> = ({navigation}) => {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );
  const {data: budgets} = useQuery(
    'SELECT * FROM budgets WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  const {
    control,
    handleSubmit,
    setValue,
    formState: {errors},
  } = useForm();
  const [error, setError] = useState('');

  const transactionType = useWatch({control, name: 'transaction_type'});
  const categoryName = useWatch({control, name: 'category'});

  const filteredCategories = categoriesData.categories.filter(cat => {
    if (!transactionType) {return true;}
    if (transactionType === 'income') {return cat.type === 'income';}
    return cat.type === 'expense';
  });

  const selectedCategory = categoriesData.categories.find(
    cat => cat.name === categoryName,
  );

  const createRecord = async (data: any) => {
    if (!data.amount || !data.account || !data.transaction_type) {
      setError('Amount, account and type are required');
      return;
    }
    try {
      const now = new Date().toISOString();
      await db.execute(
        'INSERT INTO transactions (id, amount, account_id, category, subcategory, date_time, confirmed, currency, payee, transaction_type, note, fees, budget_id, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          generateUUID(),
          parseFloat(data.amount),
          data.account,
          data.category || '',
          data.subcategory || '',
          now,
          1,
          'RWF',
          data.payee || '',
          data.transaction_type,
          data.note || '',
          0,
          data.budget || null,
          userId ?? '',
          now,
        ],
      );

      // Update account balance
      if (data.transaction_type === 'income') {
        await db.execute(
          'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
          [parseFloat(data.amount), data.account],
        );
      } else if (data.transaction_type === 'expense') {
        await db.execute(
          'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
          [parseFloat(data.amount), data.account],
        );
      }

      navigation.goBack();
    } catch (err: any) {
      setError('Error: ' + err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{flex: 1}} behavior="padding">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.header}>Create Record</Text>
        {error ? <Text style={{color: 'red', marginBottom: 8}}>{error}</Text> : null}
        <FloatingLabelInput control={control} name="amount" label="Amount" />
        <Controller
          name="transaction_type"
          control={control}
          rules={{required: 'Transaction type is required'}}
          render={({field: {onChange, value}}: any) => (
            <View style={styles.pickerContainer}>
              <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
                <Picker.Item label={'Select type'} value={''} />
                <Picker.Item label={'Income'} value={'income'} />
                <Picker.Item label={'Expense'} value={'expense'} />
                <Picker.Item label={'Transfer'} value={'transfer'} />
              </Picker>
              {errors.transaction_type && (
                <Text style={{color: 'red'}}>{String(errors.transaction_type.message)}</Text>
              )}
            </View>
          )}
        />
        <Controller
          name="account"
          control={control}
          rules={{required: 'Account is required'}}
          render={({field: {value}}: any) => (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={value}
                onValueChange={v => setValue('account', v)}
                style={styles.picker}>
                <Picker.Item label="Select Account" value="" />
                {accounts.map((account: any) => (
                  <Picker.Item
                    key={account.id}
                    label={account.name}
                    value={account.id}
                  />
                ))}
              </Picker>
            </View>
          )}
        />
        <Controller
          name="category"
          control={control}
          render={({field: {onChange, value}}: any) => (
            <View style={styles.pickerContainer}>
              <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
                <Picker.Item value="" label="Select Category" />
                {filteredCategories.map((cat, i) => (
                  <Picker.Item key={i} label={`${cat.icon} ${cat.name}`} value={cat.name} />
                ))}
              </Picker>
            </View>
          )}
        />
        {selectedCategory && selectedCategory.subcategories.length > 0 && (
          <Controller
            name="subcategory"
            control={control}
            render={({field: {onChange, value}}: any) => (
              <View style={styles.pickerContainer}>
                <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
                  <Picker.Item value={''} label="Select Subcategory" />
                  {selectedCategory.subcategories.map((sub, i) => (
                    <Picker.Item key={i} label={`${sub.icon} ${sub.name}`} value={sub.name} />
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
          render={({field: {onChange, value}}: any) => (
            <View style={styles.pickerContainer}>
              <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
                <Picker.Item label="No Budget" value="" />
                {budgets.map((budget: any) => (
                  <Picker.Item key={budget.id} label={budget.name} value={budget.id} />
                ))}
              </Picker>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.bgPrimary},
  scrollContainer: {padding: 16},
  header: {fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16},
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    marginVertical: 8,
  },
  picker: {color: '#fff'},
  saveButton: {
    backgroundColor: '#1E90FF',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 16,
  },
  saveButtonText: {color: '#fff', fontWeight: 'bold', fontSize: 18},
});

export default CreateRecord;
