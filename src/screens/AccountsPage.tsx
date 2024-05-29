import React from 'react';

import {FlatList, StyleSheet, Text, View} from 'react-native';
import TransactionItem from '../Components/Transaction';

export default function AccountsPage() {
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
      type: 'income',
      account: 'MTN Push to Bank',
      amount: 10000,
      date: '2024-05-08',
      confirmed: false,
    },
    {
      id: '5',
      type: 'expense',
      account: 'Momo Outw...',
      amount: 10000,
      date: '2024-05-08',
      confirmed: true,
    },
  ];
  return (
    <View style={styles.container}>
      <Text>Accounts</Text>
      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        renderItem={({item}) => <TransactionItem transaction={item} />}
        ListHeaderComponent={<Text style={styles.dateHeader}>TOMORROW</Text>}
        ListHeaderComponentStyle={styles.listHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    paddingHorizontal: 16,
    paddingTop: 48,
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
    fontSize: 14,
    marginBottom: 8,
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
