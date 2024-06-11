import {useQuery, useRealm} from '@realm/react';
import React, {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import TransactionItem from '../Components/Transaction';
import {Transaction} from '../tools/Schema';

function RecentTransactions() {
  const realm = useRealm();
  const transactions = useQuery(Transaction)
    .sorted('date_time', true) // Sort by date_time in descending order
    .slice(0, 5); // Get the top 5 recent transactions

  useEffect(() => {
    realm.write(() => {
      // Find transactions without an account and delete them
      const transactionsWithoutAccount = realm
        .objects(Transaction)
        .filtered('account == null');
      transactionsWithoutAccount.forEach(transaction => {
        realm.delete(transaction);
      });
    });
  }, [realm]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recent Transactions</Text>
      {transactions.map((transaction: any) => (
        <TransactionItem key={transaction._id} transaction={transaction} />
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
