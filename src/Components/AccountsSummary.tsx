import {useQuery} from '@realm/react';
import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Account, Transaction} from '../tools/Schema';

function Summary() {
  const accounts = useQuery(Account);
  const transactions = useQuery(Transaction);

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const {totalAvailable, totalIncome, totalExpenses} = useMemo(() => {
    let totalAvailable = 0;
    let totalIncome = 0;
    let totalExpenses = 0;

    accounts.forEach(account => {
      let accountTotal = account.initial_amount || 0;

      transactions.filtered('account == $0', account).forEach(transaction => {
        if (transaction.transaction_type === 'income') {
          accountTotal += transaction.amount;
          if (
            transaction.date_time.getMonth() === currentMonth &&
            transaction.date_time.getFullYear() === currentYear
          ) {
            totalIncome += transaction.amount;
          }
        } else if (transaction.transaction_type === 'expense') {
          accountTotal -= transaction.amount;
          if (
            transaction.date_time.getMonth() === currentMonth &&
            transaction.date_time.getFullYear() === currentYear
          ) {
            totalExpenses += transaction.amount;
          }
        }
      });

      totalAvailable += accountTotal;
    });

    return {totalAvailable, totalIncome, totalExpenses};
  }, [accounts, transactions, currentMonth, currentYear]);

  return (
    <View style={styles.container}>
      <Text style={styles.totalText}>Total Available: {totalAvailable}</Text>
      <Text style={styles.totalText}>Monthly Income: {totalIncome}</Text>
      <Text style={styles.totalText}>Monthly Expenses: {totalExpenses}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#001',
  },
  totalText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
  },
});

export default Summary;
