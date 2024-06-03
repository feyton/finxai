import BottomSheet, {BottomSheetView} from '@gorhom/bottom-sheet';
import {Picker} from '@react-native-picker/picker';
import {useQuery, useRealm} from '@realm/react';
import React, {useCallback, useState} from 'react';
import {
  Button,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TransactionItem from '../Components/Transaction';
import {Budget, Category, Transaction} from '../tools/Schema';

function ConfirmTransactionsScreen() {
  const transactionsQuery =
    useQuery(Transaction).filtered('confirmed == false');
  const categoriesQuery = useQuery(Category);
  const budgetsQuery = useQuery(Budget);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = React.useMemo(() => ['25%', '50%', '90%'], []);
  const realm = useRealm();

  const handleTransactionClick = (transaction: any) => {
    setSelectedTransaction(transaction);
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
    if (selectedTransaction) {
      realm.write(() => {
        realm.create(
          'Transaction',
          {
            ...selectedTransaction,
            confirmed: true,
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

  const renderBottomSheetContent = () => {
    if (!selectedTransaction) {
      return null;
    }

    const handleFieldChange = (field: string, value: any) => {
      setSelectedTransaction({...selectedTransaction, [field]: value});
    };
    const renderSplitDetails = () => {
      if (selectedTransaction.transaction_type !== 'split') return null;

      return selectedTransaction.splitDetails.map(
        (splitDetail: any, index: number) => (
          <View key={index} style={styles.splitDetailContainer}>
            <TextInput
              style={styles.input}
              value={splitDetail.amount?.toString()}
              onChangeText={text => {
                const newSplitDetails = [...selectedTransaction.splitDetails];
                newSplitDetails[index].amount = parseFloat(text);
                handleFieldChange('splitDetails', newSplitDetails);
              }}
              placeholder="Amount"
              keyboardType="numeric"
            />
            <Picker
              selectedValue={splitDetail.category}
              onValueChange={value => {
                const newSplitDetails = [...selectedTransaction.splitDetails];
                newSplitDetails[index].category = value;
                handleFieldChange('splitDetails', newSplitDetails);
              }}>
              {categoriesQuery.map((category: any) => (
                <Picker.Item
                  key={category._id.toString()}
                  label={category.name}
                  value={category.name}
                />
              ))}
            </Picker>
            <TextInput
              style={styles.input}
              value={splitDetail.note}
              onChangeText={text => {
                const newSplitDetails = [...selectedTransaction.splitDetails];
                newSplitDetails[index].note = text;
                handleFieldChange('splitDetails', newSplitDetails);
              }}
              placeholder="Note"
            />
          </View>
        ),
      );
    };

    return (
      <KeyboardAvoidingView
        style={styles.sheetContent}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          <Text style={styles.sheetTitle}>Edit Transaction</Text>
          <Text style={styles.sms}>{selectedTransaction.sms}</Text>
          <TextInput
            style={styles.input}
            value={selectedTransaction.amount?.toString()}
            onChangeText={text => handleFieldChange('amount', parseFloat(text))}
            placeholder="Amount"
            keyboardType="numeric"
          />
          <Picker
            selectedValue={selectedTransaction.transaction_type}
            onValueChange={value =>
              handleFieldChange('transaction_type', value)
            }>
            <Picker.Item label={'Income'} value={'income'} />
            <Picker.Item label={'Expense'} value={'expense'} />
            <Picker.Item label={'Transfer'} value={'transfer'} />
            <Picker.Item label={'Split'} value={'split'} />
          </Picker>
          <Picker
            selectedValue={selectedTransaction.category}
            onValueChange={value => handleFieldChange('category', value)}>
            {categoriesQuery.map((category: any) => (
              <Picker.Item
                key={category._id.toString()}
                label={category.name}
                value={category.name}
              />
            ))}
          </Picker>
          <TextInput
            style={styles.input}
            value={selectedTransaction.subcategory}
            onChangeText={text => handleFieldChange('subcategory', text)}
            placeholder="Subcategory"
          />
          <TextInput
            style={styles.input}
            value={selectedTransaction.payee}
            onChangeText={text => handleFieldChange('payee', text)}
            placeholder="Payee"
          />
          <TextInput
            style={styles.input}
            value={selectedTransaction.currency}
            onChangeText={text => handleFieldChange('currency', text)}
            placeholder="Currency"
          />
          <Picker
            selectedValue={selectedTransaction.budget?._id}
            onValueChange={value =>
              handleFieldChange(
                'budget',
                budgetsQuery.filtered(`_id == '${value}'`)[0],
              )
            }>
            {budgetsQuery.map((budget: any) => (
              <Picker.Item
                key={budget._id.toString()}
                label={budget.name}
                value={budget._id.toString()}
              />
            ))}
          </Picker>
          {renderSplitDetails()}
          <Button title="Delete" onPress={deleteTransaction} />
          <Button title="Save" onPress={handleSave} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm Transactions</Text>
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
    backgroundColor: '#1d2027',
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
});

export default ConfirmTransactionsScreen;
