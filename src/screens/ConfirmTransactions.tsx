import {useQuery, useRealm} from '@realm/react';
import React, {useState} from 'react';
import {
  Button,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {Transaction} from '../tools/Schema';

function ConfirmTransactionsScreen() {
  const transactionsQuery =
    useQuery(Transaction).filtered('confirmed == false');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const realm = useRealm();

  const handleTransactionClick = transaction => {
    setSelectedTransaction(transaction);
    setModalVisible(true);
  };

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
      setModalVisible(false);
    }
  };

  // Optimization 2: Extract renderTransaction for cleaner code and potential memoization
  const renderTransaction = ({item}) => (
    <TouchableOpacity onPress={() => handleTransactionClick(item)}>
      <View style={styles.transactionItem}>
        <Text>{item.sms}</Text>
        <Text>{item.amount}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={{color: 'white'}}>Confirm Transactions</Text>
      <FlatList
        data={transactionsQuery}
        keyExtractor={item => item._id.toString()}
        renderItem={renderTransaction}
        // Optimization 3: Enable FlatList optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={20}
        initialNumToRender={10}
        windowSize={5}
      />

      <Modal
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        {selectedTransaction && (
          <View style={styles.modalContent}>
            <Text style={styles.sms}>{selectedTransaction.sms}</Text>
            <TextInput
              style={styles.input}
              value={selectedTransaction.amount?.toString()}
              onChangeText={text =>
                setSelectedTransaction({...selectedTransaction, amount: text})
              }
              placeholder="Amount"
            />
            <TextInput
              style={styles.input}
              value={selectedTransaction.category}
              onChangeText={text =>
                setSelectedTransaction({...selectedTransaction, category: text})
              }
              placeholder="Category"
            />
            {/* Add other fields as needed */}
            <Button title="Save" onPress={handleSave} />
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#000',
  },
  transactionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  modalContent: {
    padding: 16,
    flex: 1,
    backgroundColor: '#000',
  },
  sms: {
    fontSize: 16,
    marginBottom: 16,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    padding: 8,
  },
});

export default ConfirmTransactionsScreen;
