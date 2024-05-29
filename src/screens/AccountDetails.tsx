import {useObject, useQuery} from '@realm/react';
import React, {useMemo} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {Account, Transaction} from '../tools/Schema';

function AccountDetails({route}) {
  const {accountId} = route.params;
  const account = useObject(Account, accountId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const transactions = useQuery(Transaction).filtered('account == $0', account);

  const {totalAmount, monthlyIncome, monthlyExpenses} = useMemo(() => {
    let totalAmount = account.openingBalance || 0;
    let monthlyIncome = 0;
    let monthlyExpenses = 0;

    transactions.forEach(transaction => {
      if (transaction.transaction_type === 'income') {
        totalAmount += transaction.amount;
        if (
          transaction.date_time.getMonth() === currentMonth &&
          transaction.date_time.getFullYear() === currentYear
        ) {
          monthlyIncome += transaction.amount;
        }
      } else if (transaction.transaction_type === 'expense') {
        totalAmount -= transaction.amount;
        if (
          transaction.date_time.getMonth() === currentMonth &&
          transaction.date_time.getFullYear() === currentYear
        ) {
          monthlyExpenses += transaction.amount;
        }
      }
    });

    return {totalAmount, monthlyIncome, monthlyExpenses};
  }, [transactions, account, currentMonth, currentYear]);

  const latestConfirmedTransactions = useQuery(Transaction).filtered(
    'account == $0 && confirmed == true',
    account,
  );
  const unconfirmedTransactions = useQuery(Transaction).filtered(
    'account == $0 && confirmed == false',
    account,
  );

  const renderTransaction = ({item}) => (
    <View style={styles.transactionItem}>
      <Text>Amount: {item.amount}</Text>
      <Text>Category: {item.category}</Text>
      <Text>Date: {item.date_time.toLocaleString()}</Text>
      <Text>Payee: {item.payee}</Text>
      <Text>Type: {item.transaction_type}</Text>
    </View>
  );

  if (!account) {
    return (
      <View>
        <Text>Account not found</Text>
      </View>
    );
  }

  const combinedTransactions = [
    {
      title: 'Latest Confirmed Transactions (Today)',
      data: latestConfirmedTransactions,
    },
    {title: 'Unconfirmed Transactions', data: unconfirmedTransactions},
  ];

  const renderSectionHeader = ({section: {title}}) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  const renderSectionFooter = ({section: {data}}) =>
    data.length === 0 ? (
      <Text style={styles.noTransactions}>No transactions</Text>
    ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.accountDetails}>
        <Text style={styles.accountText}>Name: {account.name}</Text>
        <Text style={styles.accountText}>Category: {account.type}</Text>
        <Text style={styles.accountText}>Number: {account.address}</Text>
        <Text style={styles.accountText}>Total Available: {totalAmount}</Text>
        <Text style={styles.accountText}>Monthly Income: {monthlyIncome}</Text>
        <Text style={styles.accountText}>
          Monthly Expenses: {monthlyExpenses}
        </Text>
      </View>

      <FlatList
        data={combinedTransactions}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({item}) => (
          <FlatList
            data={item.data}
            keyExtractor={item => item._id.toString()}
            renderItem={renderTransaction}
          />
        )}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#001',
  },
  accountDetails: {
    marginBottom: 20,
  },
  accountText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 4,
  },
  transactionSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
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

export default AccountDetails;
