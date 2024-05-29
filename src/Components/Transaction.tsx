import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Path, Svg} from 'react-native-svg';

const TransactionItem = ({transaction}) => {
  return (
    <View style={styles.transactionItem}>
      <View style={styles.transactionInfo}>
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 22C13.1046 22 14 21.1046 14 20H10C10 21.1046 10.8954 22 12 22ZM18 16V11C18 7.13401 15.3137 4.11365 11.5 4.01385V4C11.5 3.72386 11.2761 3.5 11 3.5C10.7239 3.5 10.5 3.72386 10.5 4V4.01385C6.68629 4.11365 4 7.13401 4 11V16L2 18V19H22V18L20 16H18Z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionText}>{transaction.account}</Text>
          <Text style={styles.transactionAmount}>
            - RWF {transaction.amount.toLocaleString()}
          </Text>
        </View>
      </View>
      <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 22C13.1046 22 14 21.1046 14 20H10C10 21.1046 10.8954 22 12 22ZM18 16V11C18 7.13401 15.3137 4.11365 11.5 4.01385V4C11.5 3.72386 11.2761 3.5 11 3.5C10.7239 3.5 10.5 3.72386 10.5 4V4.01385C6.68629 4.11365 4 7.13401 4 11V16L2 18V19H22V18L20 16H18Z"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
};

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

export default TransactionItem;
