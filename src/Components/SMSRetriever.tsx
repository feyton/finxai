import React, {useEffect, useState} from 'react';

import {useQuery, useRealm} from '@realm/react';
import {styled} from 'nativewind';
import {Text, View} from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import {BSON} from 'realm';
import {Account, SMSLog} from '../tools/Schema';
import {extractTransactionInfo} from '../tools/parseSMS';

const StyledText = styled(Text);
const StyledView = styled(View);

function SMSRetriever(): React.JSX.Element {
  const [smsSummary, setSMSSummary] = useState(null);
  const realm = useRealm();
  const smsLogs = useQuery(SMSLog).sorted('date', true);
  const accounts = useQuery(Account).filtered('auto == true');
  const getFirstDayOfMonthEpoch = () => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDayOfMonth.getTime();
  };

  const getLastSMSLogDate = () => {
    if (smsLogs.length > 0) {
      return smsLogs[0].date;
    }
    return getFirstDayOfMonthEpoch();
  };

  const fetchSMS = async (minDate, address) => {
    const getFilters = () => {
      return {
        box: 'inbox',
        minDate: minDate,
        address: address,
      };
    };

    SmsAndroid.list(
      JSON.stringify(getFilters()),
      fail => {
        console.log('Failed with this error: ' + fail);
      },
      (count, smsList) => {
        parseAndCreateTransactions(JSON.parse(smsList), address);
      },
    );
  };

  const parseAndCreateTransactions = (smsList, account) => {
    const transactions = [];

    realm.write(() => {
      smsList.forEach((sms: string) => {
        const transactionData = extractTransactionInfo(sms.body);
        const transaction = realm.create('Transaction', {
          _id: new BSON.ObjectId(),
          ...transactionData,
        });

        transactions.push(transaction);
      });

      const newSMSLog = realm.create(SMSLog, {
        _id: new BSON.ObjectId(),
        date: new Date().getTime(),
        count: smsList.length,
        smsData: JSON.stringify(smsList),
      });

      const summary = {
        totalTransactions: transactions.length,
        totalAmount: transactions.reduce((sum, txn) => sum + txn.amount, 0),
      };

      setSMSSummary((prevSummary: any) => ({
        totalTransactions:
          (prevSummary?.totalTransactions || 0) + summary.totalTransactions,
        totalAmount: (prevSummary?.totalAmount || 0) + summary.totalAmount,
      }));
    });
  };

  useEffect(() => {
    const lastLogDate = getLastSMSLogDate();
    accounts.forEach(account => {
      fetchSMS(lastLogDate, account.address);
    });
  }, [accounts]);

  return (
    <StyledView className="py-5">
      {}
      {smsSummary && (
        <View>
          <Text style={{color: 'white'}}>
            Transactions Created: {smsSummary.totalTransactions}
          </Text>
          <Text style={{color: 'white'}}>
            Total Amount: {smsSummary.totalAmount}
          </Text>
        </View>
      )}
    </StyledView>
  );
}

export default SMSRetriever;
