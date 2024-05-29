/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {Path, Svg} from 'react-native-svg';
import IMAGES from '../assets/images';

interface Transaction {
  account: 'object';
  amount: number;
  transaction_type: string;
  confirmed: boolean;
  date: string;
}

interface Props {
  transaction: Transaction;
}

const TransactionItem: React.FC<Props> = ({transaction}) => {
  return (
    <View style={styles.transactionItem}>
      <View style={styles.transactionInfo}>
        <View style={{position: 'relative'}}>
          <Image source={IMAGES.MTN} style={styles.accountImage} />
          <View
            style={{
              position: 'absolute',
              bottom: -15,
              right: 0,
              backgroundColor: '#1d202742',
            }}>
            {transaction.transaction_type === 'income' ? (
              <Svg width="20px" height="20px" viewBox="0 0 24 24" fill="none">
                <Path
                  opacity="0.5"
                  d="M11.9993 2C16.7133 2 19.0704 2 20.5348 3.46447C21.2923 4.22195 21.658 5.21824 21.8345 6.65598V10H2.16406V6.65598C2.3406 5.21824 2.70628 4.22195 3.46377 3.46447C4.92823 2 7.28525 2 11.9993 2Z"
                  fill="#737886"
                />
                <Path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M2 14C2 11.1997 2 9.79961 2.54497 8.73005C3.02433 7.78924 3.78924 7.02433 4.73005 6.54497C5.79961 6 7.19974 6 10 6H14C16.8003 6 18.2004 6 19.27 6.54497C20.2108 7.02433 20.9757 7.78924 21.455 8.73005C22 9.79961 22 11.1997 22 14C22 16.8003 22 18.2004 21.455 19.27C20.9757 20.2108 20.2108 20.9757 19.27 21.455C18.2004 22 16.8003 22 14 22H10C7.19974 22 5.79961 22 4.73005 21.455C3.78924 20.9757 3.02433 20.2108 2.54497 19.27C2 18.2004 2 16.8003 2 14ZM12.5303 10.4697C12.3897 10.329 12.1989 10.25 12 10.25C11.8011 10.25 11.6103 10.329 11.4697 10.4697L8.96967 12.9697C8.67678 13.2626 8.67678 13.7374 8.96967 14.0303C9.26256 14.3232 9.73744 14.3232 10.0303 14.0303L11.25 12.8107V17C11.25 17.4142 11.5858 17.75 12 17.75C12.4142 17.75 12.75 17.4142 12.75 17V12.8107L13.9697 14.0303C14.2626 14.3232 14.7374 14.3232 15.0303 14.0303C15.3232 13.7374 15.3232 13.2626 15.0303 12.9697L12.5303 10.4697Z"
                  fill="green"
                />
              </Svg>
            ) : (
              <Svg width="20px" height="20px" viewBox="0 0 24 24" fill="white">
                <Path
                  opacity="0.5"
                  d="M11.9993 2C16.7133 2 19.0704 2 20.5348 3.46447C21.2923 4.22195 21.658 5.21824 21.8345 6.65598V10H2.16406V6.65598C2.3406 5.21824 2.70628 4.22195 3.46377 3.46447C4.92823 2 7.28525 2 11.9993 2Z"
                  fill="#cfbbba"
                />
                <Path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M2 14C2 11.1997 2 9.79961 2.54497 8.73005C3.02433 7.78924 3.78924 7.02433 4.73005 6.54497C5.79961 6 7.19974 6 10 6H14C16.8003 6 18.2004 6 19.27 6.54497C20.2108 7.02433 20.9757 7.78924 21.455 8.73005C22 9.79961 22 11.1997 22 14C22 16.8003 22 18.2004 21.455 19.27C20.9757 20.2108 20.2108 20.9757 19.27 21.455C18.2004 22 16.8003 22 14 22H10C7.19974 22 5.79961 22 4.73005 21.455C3.78924 20.9757 3.02433 20.2108 2.54497 19.27C2 18.2004 2 16.8003 2 14ZM12.75 11C12.75 10.5858 12.4142 10.25 12 10.25C11.5858 10.25 11.25 10.5858 11.25 11V15.1893L10.0303 13.9697C9.73744 13.6768 9.26256 13.6768 8.96967 13.9697C8.67678 14.2626 8.67678 14.7374 8.96967 15.0303L11.4697 17.5303C11.6103 17.671 11.8011 17.75 12 17.75C12.1989 17.75 12.3897 17.671 12.5303 17.5303L15.0303 15.0303C15.3232 14.7374 15.3232 14.2626 15.0303 13.9697C14.7374 13.6768 14.2626 13.6768 13.9697 13.9697L12.75 15.1893V11Z"
                  fill="red"
                />
              </Svg>
            )}
          </View>
        </View>

        <View style={styles.transactionDetails}>
          <Text style={styles.transactionText}>{transaction.account}</Text>
          <View style={styles.transactionAmountContainer}>
            <Text style={styles.date}>{transaction.date}</Text>
            <Text
              style={[
                styles.transactionAmount,
                transaction.transaction_type === 'income'
                  ? styles.income
                  : styles.expense,
              ]}>
              RWF {transaction.amount.toLocaleString()}
            </Text>
          </View>
          <Text style={styles.payee}>Payee: Fabrice | Food</Text>
        </View>
      </View>
      {transaction.confirmed ? (
        <Svg width="30px" height="30px" viewBox="0 0 24 24" fill="none">
          <Path
            opacity="0.5"
            d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
            fill="#0d6604"
          />
          <Path
            d="M16.0303 8.96967C16.3232 9.26256 16.3232 9.73744 16.0303 10.0303L11.0303 15.0303C10.7374 15.3232 10.2626 15.3232 9.96967 15.0303L7.96967 13.0303C7.67678 12.7374 7.67678 12.2626 7.96967 11.9697C8.26256 11.6768 8.73744 11.6768 9.03033 11.9697L10.5 13.4393L12.7348 11.2045L14.9697 8.96967C15.2626 8.67678 15.7374 8.67678 16.0303 8.96967Z"
            fill="#638579"
          />
        </Svg>
      ) : (
        <Svg width="30px" height="30px" viewBox="0 0 24 24" fill="none">
          <Path
            opacity="0.5"
            d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
            fill="#85361d"
          />
          <Path
            d="M8.96967 8.96967C9.26256 8.67678 9.73744 8.67678 10.0303 8.96967L12 10.9394L13.9697 8.96969C14.2626 8.6768 14.7374 8.6768 15.0303 8.96969C15.3232 9.26258 15.3232 9.73746 15.0303 10.0304L13.0607 12L15.0303 13.9696C15.3232 14.2625 15.3232 14.7374 15.0303 15.0303C14.7374 15.3232 14.2625 15.3232 13.9696 15.0303L12 13.0607L10.0304 15.0303C9.73746 15.3232 9.26258 15.3232 8.96969 15.0303C8.6768 14.7374 8.6768 14.2626 8.96969 13.9697L10.9394 12L8.96967 10.0303C8.67678 9.73744 8.67678 9.26256 8.96967 8.96967Z"
            fill="#c3c6cf"
          />
        </Svg>
      )}
    </View>
  );
};
const styles = StyleSheet.create({
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
    marginLeft: 10,
  },
  transactionText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'Poppins-Light',
  },
  transactionAmountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 50,
  },
  transactionAmount: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
  },
  income: {
    color: 'green',
  },
  expense: {
    color: 'red',
  },
  date: {
    fontFamily: 'Poppins-Light',
  },
  payee: {
    fontFamily: 'Poppins-Light',
    fontSize: 10,
  },
  accountImage: {
    width: 40,
    height: 40,
    borderRadius: 15,
    marginLeft: -10,
    borderWidth: 1,
    borderColor: '#fff',
  },
});

export default TransactionItem;
