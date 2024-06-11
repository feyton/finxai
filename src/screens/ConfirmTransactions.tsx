/* eslint-disable react-native/no-inline-styles */
import BottomSheet, {BottomSheetView} from '@gorhom/bottom-sheet';
import {Picker} from '@react-native-picker/picker';
import {useQuery, useRealm} from '@realm/react';
import React, {useCallback, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {BSON} from 'realm';
import FloatingLabelInputRegular from '../Components/FloatingInputRegular';
import TransactionItem from '../Components/Transaction';
import {COLORS, FONTS} from '../assets/images';
import {Account, Budget, Category, Transaction} from '../tools/Schema';

function ConfirmTransactionsScreen() {
  const transactionsQuery =
    useQuery(Transaction).filtered('confirmed == false');
  const categoriesQuery = useQuery(Category);
  const budgetsQuery = useQuery(Budget);
  const accounts = useQuery(Account);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = React.useMemo(() => ['25%', '50%', '90%'], []);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const realm = useRealm();

  const handleTransactionClick = (transaction: any) => {
    setSelectedTransaction(transaction);
    updateSubcategories(transaction?.category);
    bottomSheetRef.current?.snapToIndex(1); // Open the bottom sheet
  };

  const deleteTransaction = useCallback(() => {
    realm.write(() => {
      if (selectedTransaction) {
        realm.delete(selectedTransaction);
        setSelectedTransaction(null);
        bottomSheetRef.current?.close(); // Close the bottom sheet
      }
    });
  }, [realm, selectedTransaction]);

  const handleSave = () => {
    const cat = realm.objectForPrimaryKey(
      Category,
      new BSON.ObjectID(selectedTransaction.category),
    );
    const subCat = cat?.subcategories.filter(
      sub => sub._id == selectedTransaction?.subcategory,
    )[0];
    if (selectedTransaction) {
      realm.write(() => {
        realm.create(
          'Transaction',
          {
            ...selectedTransaction,
            confirmed: true,
            category: cat,
            subcategory: subCat,
          },
          'modified',
        );
      });
      setSelectedTransaction(null);
      bottomSheetRef.current?.close(); // Close the bottom sheet
    }
  };

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setSelectedTransaction(null); // Clear selected transaction when sheet is closed
    }
  }, []);

  const renderTransaction = ({item}: any) => (
    <TouchableOpacity onPress={() => handleTransactionClick(item)}>
      <TransactionItem transaction={item} />
    </TouchableOpacity>
  );
  const updateSubcategories = (categoryName: any) => {
    const selectedCategory: any = realm.objectForPrimaryKey(
      Category,
      new BSON.ObjectID(categoryName),
    );
    if (selectedCategory) {
      setSubcategories(selectedCategory.subcategories);
    } else {
      setSubcategories([]);
    }
  };

  const renderBottomSheetContent = () => {
    if (!selectedTransaction) {
      return null;
    }

    const handleFieldChange = (field: string, value: any) => {
      if (field === 'category') {
        updateSubcategories(value);
      }
      setSelectedTransaction({...selectedTransaction, [field]: value});
    };

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
            value={selectedTransaction.amount?.toString()}
            onChangeText={text => handleFieldChange('amount', parseFloat(text))}
            keyboardType="numeric"
          />
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedTransaction.transaction_type}
              onValueChange={value =>
                handleFieldChange('transaction_type', value)
              }>
              <Picker.Item label={'Income'} value={'income'} />
              <Picker.Item label={'Expense'} value={'expense'} />
              <Picker.Item label={'Transfer'} value={'transfer'} />
            </Picker>
          </View>
          {selectedTransaction.transaction_type === 'transfer' && (
            <View style={styles.pickerContainer}>
              <Picker
                style={styles.picker}
                selectedValue={selectedTransaction.category}
                onValueChange={value => handleFieldChange('toAccount', value)}>
                <Picker.Item label={'Select account'} value={''} />
                {accounts.map((account: any) => (
                  <Picker.Item
                    key={account._id.toString()}
                    label={account.name}
                    value={account._id.toString()}
                  />
                ))}
              </Picker>
              {selectedTransaction?.category && (
                <Picker
                  selectedValue={selectedTransaction.category}
                  onValueChange={value =>
                    handleFieldChange('subcategory', value)
                  }>
                  <Picker.Item label={'Select subcategory'} value={''} />
                  {subcategories.map((subcategory: any) => (
                    <Picker.Item
                      key={subcategory._id.toString()}
                      label={subcategory.name}
                      value={subcategory.name}
                    />
                  ))}
                </Picker>
              )}
            </View>
          )}

          <View style={styles.pickerContainer}>
            <Picker
              style={styles.picker}
              selectedValue={selectedTransaction.category}
              onValueChange={value => handleFieldChange('category', value)}>
              <Picker.Item label={'Select category'} value={''} />
              {categoriesQuery.map((category: any) => (
                <Picker.Item
                  key={category._id.toString()}
                  label={category.name}
                  value={category._id.toString()}
                />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerContainer}>
            {selectedTransaction?.category && (
              <Picker
                style={styles.picker}
                selectedValue={selectedTransaction.subcategory}
                onValueChange={value =>
                  handleFieldChange('subcategory', value)
                }>
                <Picker.Item label={'Select subcategory'} value={''} />
                {subcategories.map((subcategory: any) => (
                  <Picker.Item
                    key={subcategory._id.toString()}
                    label={subcategory.name}
                    value={subcategory._id.toString()}
                  />
                ))}
              </Picker>
            )}
          </View>

          <FloatingLabelInputRegular
            value={selectedTransaction.payee}
            name="payee"
            onChangeText={text => handleFieldChange('payee', text)}
            label="Payee"
          />

          <View style={styles.pickerContainer}>
            <Picker
              style={styles.picker}
              selectedValue={selectedTransaction.budget?._id}
              onValueChange={value =>
                handleFieldChange(
                  'budget',
                  budgetsQuery.filtered(`_id == '${value}'`)[0],
                )
              }>
              <Picker.Item label={'Select budget'} value={''} />
              {budgetsQuery.map((budget: any) => (
                <Picker.Item
                  key={budget._id.toString()}
                  label={budget.name}
                  value={budget._id.toString()}
                />
              ))}
            </Picker>
          </View>
          <FloatingLabelInputRegular
            value={selectedTransaction.payee}
            name="note"
            onChangeText={text => handleFieldChange('note', text)}
            label="Note"
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
                alignContent: 'center',
                justifyContent: 'center',
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
                alignContent: 'center',
                justifyContent: 'center',
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
    <View style={styles.container}>
      <FlatList
        data={transactionsQuery}
        keyExtractor={item => item._id.toString()}
        renderItem={renderTransaction}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        initialNumToRender={10}
        windowSize={5}
      />
      <BottomSheet
        ref={bottomSheetRef}
        index={-1} // Start the sheet closed
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        enablePanDownToClose={true}
        backgroundStyle={styles.sheetContent}
        keyboardBehavior="extend"
        handleIndicatorStyle={styles.sheetHandle}>
        <BottomSheetView>{renderBottomSheetContent()}</BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1d2027',
    paddingBottom: 20,
  },
  title: {
    color: 'white',
    fontSize: 20,
    marginBottom: 16,
    fontFamily: 'Poppins-Bold',
  },
  transactionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
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
  scrollViewContent: {
    flexGrow: 1,
  },

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
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    padding: 8,
    color: 'white',
  },
  sheetHandle: {
    color: 'white',
    backgroundColor: 'white',
  },
  splitDetailContainer: {
    marginBottom: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#bdb7b7',
    borderRadius: 10,
    marginVertical: 8,
    fontFamily: 'Poppins-Regular',
    paddingHorizontal: 10,
  },

  picker: {
    color: '#ffffff',
    fontFamily: 'Poppins-Regular',
  },
});

export default ConfirmTransactionsScreen;
