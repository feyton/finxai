/* eslint-disable react-hooks/exhaustive-deps */
import React, {useEffect, useState} from 'react';

import {useQuery, useRealm} from '@realm/react';
import {styled} from 'nativewind';
import {Button, Text, View} from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import {BSON} from 'realm';
import {Account} from '../tools/Schema';
import {extractTransactionInfo} from '../tools/parseSMS';

interface SMS {
  body: string;
  address: string;
}

interface Transaction {
  _id?: BSON.ObjectID;
  amount: number;
}
interface ExtractInfo {
  amount?: number;
  fees?: number;
  currency?: string;
  date_time: Date;
  payee: string;
  transaction_type: string;
}

const StyledView = styled(View);

function SMSRetriever(): React.JSX.Element {
  const [smsSummary, setSMSSummary] = useState();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const realm = useRealm();
  const accounts = useQuery(Account).filtered('auto == true');
  const getFirstDayOfMonthEpoch = () => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDayOfMonth.getTime();
  };

  const fetchSMS = async (account: Account) => {
    const getFilters = () => {
      return {
        box: 'inbox',
        minDate: account?.logDate || getFirstDayOfMonthEpoch(),
        address: account.address,
      };
    };

    SmsAndroid.list(
      JSON.stringify(getFilters()),
      (fail: string) => {
        console.log('Failed with this error: ' + fail);
      },
      (count: any, smsList: string) => {
        if (count > 0) {
          parseAndCreateTransactions(JSON.parse(smsList), account);
        }
        setSMSSummary({lastChecked: new Date().getTime()});
        return;
      },
    );
  };

  const parseAndCreateTransactions = (smsList: SMS[], account: Account) => {
    const transactions: Transaction[] = [];

    realm.write(() => {
      smsList.forEach((sms: SMS) => {
        const transactionData = extractTransactionInfo(sms.body);
        try {
          const transaction: Transaction = realm.create('Transaction', {
            _id: new BSON.ObjectId(),
            ...transactionData,
            sms: sms.body,
            account: account,
          });

          transactions.push(transaction);
        } catch (error) {
          console.log(error);
        }
      });
    });
    realm.write(() => {
      account.logDate = new Date().getTime();
    });
    const summary: any = {
      totalTransactions: transactions.length,
      totalAmount: transactions.reduce((sum, txn) => sum + txn.amount, 0),
      lastChecked: new Date().getTime(),
    };

    setSMSSummary(summary);
  };

  const recheckTransactions = () => {
    setInitialized(false);
  };

  useEffect(() => {
    if (!initialized) {
      setLoading(true);
      accounts.forEach(account => {
        fetchSMS(account);
      });
      setInitialized(true);
      setLoading(false); // Mark as initialized to prevent re-running
    }
  }, [initialized, accounts]);

  return (
    <StyledView className="py-5">
      {loading && <Text>Loadinging</Text>}
      {smsSummary ? (
        <View>
          <Text style={{color: 'white'}}>
            Transactions Created: {smsSummary?.totalTransactions}
          </Text>
          <Text style={{color: 'white'}}>
            Total Amount: {smsSummary?.totalAmount}
          </Text>
          <Text>Last checked: {smsSummary?.lastChecked}</Text>
        </View>
      ) : (
        <View>
          <Text>All is caught up</Text>
        </View>
      )}

      <Button onPress={recheckTransactions} title="Re-check" />
    </StyledView>
  );
}

export default SMSRetriever;
