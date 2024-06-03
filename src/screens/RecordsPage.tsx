import {useQuery} from '@realm/react';
import React, {useState} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TransactionItem from '../Components/Transaction';
import {Transaction} from '../tools/Schema';

const RecordsPage = ({navigation}: any) => {
  const transactionsQuery = useQuery(Transaction);
  const [searchQuery, setSearchQuery] = useState('');

  const groupTransactionsByDate = (transactions: any) => {
    const groupedTransactions: any = {};
    transactions.forEach((transaction: any) => {
      const date = new Date(transaction.date_time);
      const today = new Date();
      let dateLabel;

      if (date.toDateString() === today.toDateString()) {
        dateLabel = 'Today';
      } else if (
        date.toDateString() ===
        new Date(today.setDate(today.getDate() - 1)).toDateString()
      ) {
        dateLabel = 'Yesterday';
      } else if (date.getDay() === 5) {
        dateLabel = 'Friday';
      } else {
        dateLabel = date.toDateString();
      }

      if (!groupedTransactions[dateLabel]) {
        groupedTransactions[dateLabel] = [];
      }

      groupedTransactions[dateLabel].push(transaction);
    });

    return groupedTransactions;
  };

  const filteredTransactions = transactionsQuery.filter((transaction: any) =>
    transaction.account.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groupedTransactions = groupTransactionsByDate(filteredTransactions);
  const sections = Object.keys(groupedTransactions).map(date => ({
    title: date,
    data: groupedTransactions[date],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.headerView}>
        <TouchableOpacity
          style={styles.categoryButton}
          onPress={() => navigation.navigate('ManageCategories')}>
          <Text style={styles.catStyle}>Manage Categories</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchView}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transaction"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={sections}
        keyExtractor={item => item.title}
        renderItem={({item: section}) => (
          <View key={section.title} style={styles.sectionView}>
            <Text style={styles.dateHeader}>{section.title}</Text>
            <FlatList
              data={section.data}
              keyExtractor={item => item.id}
              renderItem={({item}) => <TransactionItem transaction={item} />}
              ListHeaderComponentStyle={styles.listHeader}
            />
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d2027',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  catStyle: {
    fontFamily: 'Poppins-Regular',
  },
  headerView: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  categoryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  searchView: {
    marginBottom: 5,
  },
  searchInput: {
    backgroundColor: '#2e2e2e',
    color: 'white',
    padding: 10,
    borderRadius: 8,
  },
  sectionView: {
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

export default RecordsPage;
