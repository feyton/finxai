import {useQuery} from '@realm/react';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import TransactionItem from '../Components/Transaction';
import {Transaction} from '../tools/Schema';

function RecentTransactions() {
  const transactions = useQuery(Transaction)
    .sorted('date_time', true) // Sort by date_time in descending order
    .slice(0, 5); // Get the top 5 recent transactions

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recent Transactions</Text>
      {transactions.map((transaction: any) => (
        <TransactionItem key={transaction.id} transaction={transaction} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
    fontFamily: 'Poppins-Bold',
  },
  transactionItem: {
    backgroundColor: '#004',
    padding: 16,
    marginBottom: 10,
    borderRadius: 4,
  },
  noTransactions: {
    color: '#fff',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
});

export default RecentTransactions;
