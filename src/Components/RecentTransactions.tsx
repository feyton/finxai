import {useQuery} from '@powersync/react-native';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import TransactionItem from '../Components/Transaction';
import {useCurrentUser} from '../hooks/useCurrentUser';

function RecentTransactions() {
  const {userId} = useCurrentUser();
  const {data: transactions} = useQuery(
    'SELECT t.*, a.name as account_name, a.logo as account_logo FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.owner_id = ? ORDER BY t.date_time DESC LIMIT 5',
    [userId ?? ''],
  );

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
});

export default RecentTransactions;
