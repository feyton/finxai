/* eslint-disable react-native/no-inline-styles */
/* eslint-disable @typescript-eslint/no-shadow */
import {useObject, useQuery} from '@realm/react';
import React, {useMemo} from 'react';
import {SectionList, StyleSheet, Text, View} from 'react-native';
import {Path, Svg} from 'react-native-svg';
import {BSON} from 'realm';
import TransactionItem from '../Components/Transaction';
import {COLORS} from '../assets/images';
import {Account, AutoRecord, Transaction} from '../tools/Schema';

interface AccountDetailsProps {
  route: any;
}

const AccountDetails: React.FC<AccountDetailsProps> = ({route}) => {
  const {accountId} = route.params;
  const account = useObject<Account>(Account, new BSON.ObjectID(accountId));

  const transactions = useQuery(Transaction).filtered(
    'account._id == $0',
    account?._id,
  );
  const unconfirmedTransactions = useQuery(AutoRecord).filtered(
    'account._id == $0',
    account?._id,
  );

  const {monthlyIncome, monthlyExpenses} = useMemo(() => {
    let monthlyIncome = transactions
      .filtered('transaction_type == $0', 'income')
      .sum('amount');
    let monthlyExpenses = transactions
      .filtered('transaction_type == $0', 'expense')
      .sum('amount');

    return {monthlyIncome, monthlyExpenses};
  }, [transactions]);

  const latestConfirmedTransactions = transactions
    .filtered('account._id == $0', account?._id)
    .sorted('date_time');

  const renderTransaction = ({item}: any) => (
    <TransactionItem transaction={item} />
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
      title: 'Recent Records ✅(Today)',
      data: latestConfirmedTransactions,
    },
    {title: 'Unconfirmed Records', data: unconfirmedTransactions},
  ];

  const renderSectionHeader = ({section: {title}}: any) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  const renderSectionFooter = ({section: {data}}: any) =>
    data.length === 0 ? (
      <Text style={styles.noTransactions}>No transactions</Text>
    ) : null;

  return (
    <View style={styles.container}>
      <View
        style={{
          padding: 16,
          backgroundColor: '#2e2e2e',
          marginHorizontal: 10,
          borderRadius: 10,
          marginBottom: 10,
        }}>
        <Text style={{fontFamily: 'Poppins-Bold', color: 'white'}}>
          {account.name}
        </Text>
        <Text style={styles.totalText}>
          RWF: {account.available_balance.toLocaleString()}
        </Text>
        <View style={{flexDirection: 'row', gap: 30}}>
          <View style={{flexDirection: 'row', gap: 2, alignItems: 'center'}}>
            <Svg width="30px" height="30px" viewBox="0 0 24 24" fill="none">
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
            <View style={{flexDirection: 'column', gap: 0}}>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: 'Poppins-Bold',
                  marginBottom: -8,
                  color: 'green',
                }}>
                {monthlyIncome.toLocaleString()}
              </Text>
              <Text
                style={{
                  margin: 0,
                  padding: 0,
                  fontSize: 10,
                  fontFamily: 'Poppins-Bold',
                }}>
                Rwf
              </Text>
            </View>
          </View>
          <View style={{flexDirection: 'row', gap: 2, alignItems: 'center'}}>
            <Svg width="30px" height="30px" viewBox="0 0 24 24" fill="white">
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
            <View style={{flexDirection: 'column', gap: 0}}>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: 'Poppins-Bold',
                  marginBottom: -8,
                  color: 'red',
                }}>
                {monthlyExpenses.toLocaleString()}
              </Text>
              <Text
                style={{
                  margin: 0,
                  padding: 0,
                  fontSize: 10,
                  fontFamily: 'Poppins-Bold',
                }}>
                Rwf
              </Text>
            </View>
          </View>
        </View>
      </View>

      <SectionList
        sections={combinedTransactions}
        keyExtractor={(item: any) => item._id.toString()}
        renderItem={renderTransaction}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.bgPrimary,
  },
  totalText: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 10,
    fontFamily: 'Poppins-Bold',
  },
  accountDetails: {
    marginBottom: 20,
  },
  accountText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
    fontFamily: 'Poppins-Bold',
  },
  noTransactions: {
    color: '#fff',
    textAlign: 'center',
    padding: 16,
    fontFamily: 'Poppins-Regular',
  },
});

export default AccountDetails;
