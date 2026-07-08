/* eslint-disable react-native/no-inline-styles */
import BottomSheet, {BottomSheetView} from '@gorhom/bottom-sheet';
import {Picker} from '@react-native-picker/picker';
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useCallback, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DatePicker from 'react-native-date-picker';
import {ScrollView} from 'react-native-gesture-handler';
import FloatingLabelInputRegular from '../Components/FloatingInputRegular';
import TransactionItem from '../Components/Transaction';
import {COLORS, FONTS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';
import categoriesData from '../tools/data.json';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function ConfirmTransactionsScreen() {
  const db = usePowerSync();
  const {userId} = useCurrentUser();

  const {data: transactionsQuery} = useQuery(
    'SELECT ar.*, a.name as account_name, a.logo as account_logo FROM auto_records ar LEFT JOIN accounts a ON ar.account_id = a.id WHERE ar.owner_id = ? ORDER BY ar.date_time DESC',
    [userId ?? ''],
  );
  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );
  const {data: budgets} = useQuery(
    'SELECT * FROM budgets WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = React.useMemo(() => ['25%', '80%'], []);
  const [filteredCategories, setFilteredCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const updateCategories = (type: string) => {
    const cats = categoriesData.categories.filter(cat => {
      if (type === 'income') {return cat.type === 'income';}
      return cat.type === 'expense';
    });
    setFilteredCategories(cats);
  };

  const updateSubcategories = (categoryName: string) => {
    const cat = categoriesData.categories.find(c => c.name === categoryName);
    setSubcategories(cat?.subcategories ?? []);
  };

  const handleTransactionClick = (transaction: any) => {
    setSelectedTransaction({...transaction});
    updateCategories(transaction.transaction_type ?? 'expense');
    updateSubcategories(transaction.category ?? '');
    bottomSheetRef.current?.snapToIndex(1);
  };

  const deleteTransaction = useCallback(async () => {
    if (selectedTransaction) {
      await db.execute('DELETE FROM auto_records WHERE id = ?', [
        selectedTransaction.id,
      ]);
      setSelectedTransaction(null);
      bottomSheetRef.current?.close();
    }
  }, [db, selectedTransaction]);

  const handleSave = async () => {
    if (!selectedTransaction) {return;}
    const now = new Date().toISOString();
    const amount = parseFloat(selectedTransaction.amount) || 0;

    try {
      if (selectedTransaction.transaction_type === 'transfer') {
        await db.execute(
          'INSERT INTO transfers (id, from_account_id, to_account_id, amount, date_time, note, currency, fees, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            generateUUID(),
            selectedTransaction.account_id,
            selectedTransaction.to_account_id || '',
            amount,
            selectedTransaction.date_time || now,
            selectedTransaction.note || '',
            'RWF',
            selectedTransaction.fees || 0,
            userId ?? '',
            now,
          ],
        );
        // Update balances
        if (selectedTransaction.account_id) {
          await db.execute(
            'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
            [amount, selectedTransaction.account_id],
          );
        }
        if (selectedTransaction.to_account_id) {
          await db.execute(
            'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
            [amount, selectedTransaction.to_account_id],
          );
        }
      } else {
        await db.execute(
          'INSERT INTO transactions (id, amount, account_id, category, subcategory, date_time, sms, confirmed, currency, payee, transaction_type, note, fees, budget_id, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            generateUUID(),
            amount,
            selectedTransaction.account_id || '',
            selectedTransaction.category || '',
            selectedTransaction.subcategory || '',
            selectedTransaction.date_time || now,
            selectedTransaction.sms || '',
            1,
            'RWF',
            selectedTransaction.payee || '',
            selectedTransaction.transaction_type || 'expense',
            selectedTransaction.note || '',
            selectedTransaction.fees || 0,
            selectedTransaction.budget_id || null,
            userId ?? '',
            now,
          ],
        );
        // Update account balance
        if (selectedTransaction.account_id) {
          if (selectedTransaction.transaction_type === 'income') {
            await db.execute(
              'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
              [amount, selectedTransaction.account_id],
            );
          } else {
            await db.execute(
              'UPDATE accounts SET available_balance = available_balance - ? WHERE id = ?',
              [amount, selectedTransaction.account_id],
            );
          }
        }
      }

      await db.execute('DELETE FROM auto_records WHERE id = ?', [
        selectedTransaction.id,
      ]);
      setSelectedTransaction(null);
      bottomSheetRef.current?.close();
    } catch (err: any) {
      console.error('Error saving transaction:', err);
    }
  };

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setSelectedTransaction(null);
    }
  }, []);

  const renderTransaction = ({item}: any) => (
    <TouchableOpacity onPress={() => handleTransactionClick(item)}>
      <TransactionItem transaction={item} />
    </TouchableOpacity>
  );

  const handleFieldChange = (field: string, value: any) => {
    if (field === 'transaction_type') {
      updateCategories(value);
    }
    if (field === 'category') {
      updateSubcategories(value);
    }
    setSelectedTransaction((prev: any) => ({...prev, [field]: value}));
  };

  const renderBottomSheetContent = () => {
    if (!selectedTransaction) {
      return null;
    }

    const dateValue = selectedTransaction.date_time
      ? new Date(selectedTransaction.date_time)
      : new Date();

    return (
      <KeyboardAvoidingView
        keyboardVerticalOffset={150}
        style={styles.sheetContent}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          keyboardShouldPersistTaps={'handled'}
          contentContainerStyle={styles.scrollViewContent}>
          <Text style={styles.sheetTitle}>Edit Transaction</Text>
          <Text style={styles.sms}>{selectedTransaction.sms}</Text>
          <FloatingLabelInputRegular
            name="amount"
            label="Amount"
            value={String(selectedTransaction?.amount ?? '')}
            onChangeText={text => handleFieldChange('amount', text)}
            keyboardType="numeric"
          />
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedTransaction.transaction_type}
              onValueChange={value => handleFieldChange('transaction_type', value)}>
              <Picker.Item label={'Income'} value={'income'} />
              <Picker.Item label={'Expense'} value={'expense'} />
              <Picker.Item label={'Transfer'} value={'transfer'} />
            </Picker>
          </View>
          <View style={styles.pickerContainer}>
            <Picker
              style={styles.picker}
              selectedValue={selectedTransaction?.account_id}
              onValueChange={value => handleFieldChange('account_id', value)}>
              <Picker.Item label={'Select account'} value={''} />
              {accounts.map((account: any) => (
                <Picker.Item
                  key={account.id}
                  label={account.name}
                  value={account.id}
                />
              ))}
            </Picker>
          </View>
          {selectedTransaction.transaction_type === 'transfer' && (
            <View style={styles.pickerContainer}>
              <Picker
                style={styles.picker}
                selectedValue={selectedTransaction.to_account_id}
                onValueChange={value =>
                  handleFieldChange('to_account_id', value)
                }>
                <Picker.Item label={'To account'} value={''} />
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
          <View style={styles.pickerContainer}>
            <Picker
              style={styles.picker}
              selectedValue={selectedTransaction.category}
              onValueChange={value => handleFieldChange('category', value)}>
              <Picker.Item label={'Select category'} value={''} />
              {filteredCategories.map((category: any, i: number) => (
                <Picker.Item
                  key={i}
                  label={`${category.icon} ${category.name}`}
                  value={category.name}
                />
              ))}
            </Picker>
          </View>
          {subcategories.length > 0 && (
            <View style={styles.pickerContainer}>
              <Picker
                style={styles.picker}
                selectedValue={selectedTransaction.subcategory}
                onValueChange={value =>
                  handleFieldChange('subcategory', value)
                }>
                <Picker.Item label={'Select subcategory'} value={''} />
                {subcategories.map((sub: any, i: number) => (
                  <Picker.Item
                    key={i}
                    label={`${sub.icon} ${sub.name}`}
                    value={sub.name}
                  />
                ))}
              </Picker>
            </View>
          )}
          <FloatingLabelInputRegular
            value={selectedTransaction.payee ?? ''}
            name="payee"
            onChangeText={text => handleFieldChange('payee', text)}
            label="Payee"
          />
          <View style={styles.pickerContainer}>
            <Picker
              style={styles.picker}
              selectedValue={selectedTransaction.budget_id}
              onValueChange={value => handleFieldChange('budget_id', value)}>
              <Picker.Item label={'No budget'} value={''} />
              {budgets.map((budget: any) => (
                <Picker.Item
                  key={budget.id}
                  label={budget.name}
                  value={budget.id}
                />
              ))}
            </Picker>
          </View>
          <FloatingLabelInputRegular
            value={selectedTransaction.note ?? ''}
            name="note"
            onChangeText={text => handleFieldChange('note', text)}
            label="Note"
          />
          <View style={{flexDirection: 'row', gap: 5, marginVertical: 8}}>
            <Text style={{color: 'white'}}>
              Date: {dateValue.toLocaleString()}
            </Text>
            <TouchableOpacity
              style={{padding: 3, backgroundColor: 'gray'}}
              onPress={() => setDatePickerOpen(true)}>
              <Text style={{color: 'white'}}>Change</Text>
            </TouchableOpacity>
          </View>
          <DatePicker
            modal
            mode="date"
            open={datePickerOpen}
            date={dateValue}
            onConfirm={date => {
              setDatePickerOpen(false);
              handleFieldChange('date_time', date.toISOString());
            }}
            onCancel={() => setDatePickerOpen(false)}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignContent: 'center',
              marginVertical: 10,
            }}>
            <TouchableOpacity
              onPress={deleteTransaction}
              style={{
                backgroundColor: COLORS.buttonSecondary,
                paddingHorizontal: 30,
                paddingVertical: 10,
                borderRadius: 5,
              }}>
              <Text style={{color: COLORS.textPrimary, fontFamily: FONTS.bold}}>
                Delete
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={{
                backgroundColor: COLORS.buttonPrimary,
                paddingHorizontal: 30,
                borderRadius: 5,
                paddingVertical: 10,
              }}>
              <Text style={{color: COLORS.textPrimary, fontFamily: FONTS.bold}}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {transactionsQuery.length === 0 && (
        <View style={{marginTop: 20}}>
          <Text style={{fontFamily: FONTS.bold, textAlign: 'center', color: 'white'}}>
            Congz. All is cleared up now!
          </Text>
          <Text style={{fontFamily: FONTS.bold, textAlign: 'center', color: 'white'}}>
            No Transactions
          </Text>
        </View>
      )}
      <FlatList
        data={transactionsQuery}
        keyExtractor={item => item.id}
        renderItem={renderTransaction}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        initialNumToRender={10}
        windowSize={5}
      />
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        enablePanDownToClose={true}
        backgroundStyle={styles.sheetContent}
        keyboardBehavior="extend"
        handleIndicatorStyle={styles.sheetHandle}>
        <BottomSheetView>{renderBottomSheetContent()}</BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1d2027',
    paddingBottom: 20,
  },
  sheetContent: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    color: 'white',
    fontSize: 18,
    marginBottom: 10,
    fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  scrollViewContent: {flexGrow: 1, paddingBottom: 50},
  sms: {
    fontSize: 11,
    marginBottom: 16,
    color: 'white',
    fontFamily: 'Poppins-Light',
    textAlign: 'justify',
    borderRadius: 10,
    borderColor: 'gray',
    borderWidth: 1,
    padding: 5,
  },
  sheetHandle: {color: 'white', backgroundColor: 'white'},
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#bdb7b7',
    borderRadius: 10,
    marginVertical: 8,
    fontFamily: 'Poppins-Regular',
    paddingHorizontal: 10,
  },
  picker: {color: '#ffffff', fontFamily: 'Poppins-Regular'},
});

export default ConfirmTransactionsScreen;
