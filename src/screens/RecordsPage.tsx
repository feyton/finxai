import React from 'react';

import {styled} from 'nativewind';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TransactionItem from '../Components/Transaction';

const StyledView = styled(View);
const StyledText = styled(Text);

export default function RecordsPage({navigation}: any) {
  const transactions = [
    {
      id: '1',
      type: 'expense',
      account: 'Momo Outw...',
      amount: 1200,
      date: '2024-05-30',
      confirmed: true,
    },
    {
      id: '2',
      type: 'expense',
      account: 'Bill Payt EUCL...',
      amount: 3000,
      date: '2024-05-30',
      confirmed: true,
    },
    {
      id: '3',
      type: 'expense',
      account: 'BK-BK Acc...',
      amount: 200000,
      date: '2024-05-08',
      confirmed: true,
    },
    {
      id: '4',
      transaction_type: 'income',
      account: 'MTN Push to Bank',
      amount: 10000,
      date: '2024-05-08',
      confirmed: false,
    },
    {
      id: '5',
      transaction_type: 'expense',
      account: 'Momo Outw...',
      amount: 10000,
      date: '2024-05-08',
      confirmed: true,
    },
  ];
  return (
    <View style={styles.container}>
      <View>
        <TouchableOpacity
          style={styles.categoryView}
          onPress={() => navigation.navigate('ManageCategories')}>
          <StyledText className="font-bold font-poppins">Manage Categories</StyledText>
        </TouchableOpacity>
      </View>

      <View>
        <TextInput placeholder="Search transaction" />
      </View>
      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        renderItem={({item}: any) => <TransactionItem transaction={item} />}
        ListHeaderComponent={
          <Text style={styles.dateHeader}>Recent Records</Text>
        }
        ListHeaderComponentStyle={styles.listHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d2027',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  categoryView: {
    backgroundColor: 'green',
    padding: 5,
    borderRadius: 10,
    fontFamily: 'Poppins-Regular',
  },
  header: {
    fontSize: 20,
    color: 'white',
    marginBottom: 16,
  },
  listHeader: {
    paddingBottom: 8,
  },
  dateHeader: {
    color: '#888',
    fontSize: 16,
    marginBottom: 4,
    fontFamily: 'Poppins-Bold',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2e2e2e',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  transactionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionDetails: {
    marginLeft: 16,
  },
  transactionText: {
    color: 'white',
    fontSize: 16,
  },
  transactionAmount: {
    color: '#ff6347',
    fontSize: 16,
  },
});
