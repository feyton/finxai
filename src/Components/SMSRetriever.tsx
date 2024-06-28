/* eslint-disable react-hooks/exhaustive-deps */
import {useNavigation} from '@react-navigation/native';
import {useQuery, useRealm} from '@realm/react';
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {formatDistanceToNow} from 'date-fns';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import {Path, Svg} from 'react-native-svg';
import {FONTS} from '../assets/images';
import {Account, AutoRecord} from '../tools/Schema';
import {extractTransactionInfo} from '../tools/parseSMS';

interface SMS {
  body: string;
  address: string;
}

const SMSRetriever: React.FC = ({refreshing}: any) => {
  const navigation = useNavigation<any>();
  const [initialized, setInitialized] = useState(refreshing);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setlastChecked] = useState<Date>(new Date());
  const realm = useRealm();
  const accounts = useQuery(Account).filtered('auto == true');

  const getFirstDayOfMonthEpoch = () => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDayOfMonth.getTime();
  };

  const parseAndCreateTransactions = async (
    smsList: SMS[],
    account: Account,
  ) => {
    const accountToUpdate = realm.objectForPrimaryKey(Account, account._id);
    realm.write(() => {
      account.logDate = new Date().getTime();
      smsList.map(sms => {
        let transactionData = extractTransactionInfo(sms.body);
        if (!transactionData || isNaN(transactionData.amount)) {
          transactionData = {amount: 0, date_time: new Date()};
        } else {
          try {
            transactionData.date_time = new Date(transactionData.date_time);
          } catch (error) {
            transactionData.date_time = new Date();
          }
        }
        try {
          realm.create('AutoRecord', {
            ...transactionData,
            sms: sms.body,
            account: accountToUpdate,
          });
        } catch (error) {
          console.log('Error parsing sms', error);
        }
      });
    });
  };

  const fetchSmsForAccount = async (account: Account) => {
    const filters = {
      box: 'inbox',
      minDate: account?.logDate || getFirstDayOfMonthEpoch(),
      address: account.address,
    };

    return new Promise<void>((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filters),
        (fail: string) => {
          console.log('Failed with this error: ' + fail);
          reject(fail);
        },
        async (count: any, smsList: string) => {
          if (count > 0) {
            await parseAndCreateTransactions(JSON.parse(smsList), account);
          }
          resolve();
        },
      );
    });
  };

  const retrieveTransactions = async () => {
    setLoading(true);
    try {
      await Promise.all(accounts.map(account => fetchSmsForAccount(account)));
      const tx = realm.objects('AutoRecord').filtered('account == null');
      realm.write(() => {
        realm.delete(tx);
      });
    } catch (error) {
      console.error('Error retrieving transactions:', error);
    } finally {
      setlastChecked(new Date());
      setInitialized(true);
      setLoading(false);
    }
  };

  const recheckTransactions = () => {
    setInitialized(false);
  };

  const navigateToConfirmations = () => {
    navigation.navigate('Confirm');
  };

  useEffect(() => {
    realm.subscriptions.update(mutableSubs => {
      mutableSubs.add(realm.objects(AutoRecord));
      mutableSubs.add(realm.objects(Account));
    });
    if (!initialized) {
      retrieveTransactions();
    }
  }, [initialized]);

  const transactions = useQuery(AutoRecord);

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Getting updates...</Text>
        </View>
      )}
      {!loading && (
        <View style={styles.summaryContainer}>
          <View>
            <Text style={styles.congratsText}>
              {transactions.length === 0
                ? 'All sorted. Congz!'
                : 'Confirm ' + transactions.length + ' transactions'}
            </Text>
            <Text style={styles.checkedText}>
              Checked:{' '}
              <Text style={{fontFamily: FONTS.bold}}>
                {formatDistanceToNow(lastChecked, {
                  addSuffix: true,
                })}
              </Text>
            </Text>
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              onPress={recheckTransactions}
              style={styles.button}>
              <Svg width="40px" height="40px" viewBox="0 0 24 24" fill="none">
                <Path
                  opacity="1"
                  d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"
                  fill="#375edf"
                />
                <Path
                  d="M16.4017 6.28616C16.4017 5.98121 16.217 5.70662 15.9346 5.59158C15.6522 5.47653 15.3283 5.54393 15.1152 5.76208L14.3647 6.53037C12.244 5.55465 9.66551 5.95905 7.92796 7.7378C5.69068 10.0281 5.69068 13.7344 7.92796 16.0247C10.1748 18.3248 13.8252 18.3248 16.072 16.0247C17.3754 14.6904 17.9168 12.8779 17.7055 11.1507C17.6552 10.7396 17.2812 10.447 16.87 10.4973C16.4589 10.5476 16.1663 10.9217 16.2166 11.3328C16.3757 12.6335 15.9667 13.9859 14.999 14.9765C13.3407 16.6742 10.6593 16.6742 9.00097 14.9765C7.33301 13.269 7.33301 10.4935 9.00097 8.78596C10.1467 7.61303 11.7795 7.25143 13.225 7.69705L12.4635 8.47659C12.2527 8.69245 12.1917 9.01364 12.3088 9.29174C12.4259 9.56984 12.6983 9.75067 13 9.75067H15.6517C16.0659 9.75067 16.4017 9.41489 16.4017 9.00067V6.28616Z"
                  fill="#e6e7e7"
                />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={navigateToConfirmations}
              style={styles.button}>
              <Svg width="40px" height="40px" viewBox="0 0 24 24" fill="none">
                <Path
                  opacity="0.9"
                  d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                  fill="#1baa2e"
                />
                <Path
                  d="M11.0303 8.46967C10.7374 8.17678 10.2626 8.17678 9.96967 8.46967C9.67678 8.76256 9.67678 9.23744 9.96967 9.53033L12.4393 12L9.96967 14.4697C9.67678 14.7626 9.67678 15.2374 9.96967 15.5303C10.2626 15.8232 10.7374 15.8232 11.0303 15.5303L14.0303 12.5303C14.3232 12.2374 14.3232 11.7626 14.0303 11.4697L11.0303 8.46967Z"
                  fill="#ffffff"
                />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#2e2e2e',
    margin: 10,
    borderRadius: 10,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  loadingText: {
    marginLeft: 10,
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    marginBottom: 2,
  },
  congratsText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    marginBottom: 0,
  },
  checkedText: {
    fontFamily: 'Poppins-Light',
    color: '#ffffff',
    fontSize: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Poppins-Regular',
  },
});

export default SMSRetriever;
