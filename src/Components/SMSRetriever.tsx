import React, {useEffect, useState} from 'react';

import {styled} from 'nativewind';
import {Text, View} from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';

interface Account {
  name: string;
  number: string;
}

const StyledText = styled(Text);

const StyledView = styled(View);

function SMSRetriever(): React.JSX.Element {
  const [sms, setSMS] = useState();
  const accounts: Account[] = [
    {name: 'Mobile Money', number: 'M-Money'},
    {name: 'Equity', number: 'EQUITYBANK'},
    {name: 'Bank of Kigali', number: '2532265'},
  ];

  const fetchSMS = async () => {
    const getFilters = () => {
      return {
        box: 'inbox',
        minDate: new Date(2024, 5, 10).getTime() / 1000,
        address: 'BKeBANK',
      };
    };
    SmsAndroid.list(
      JSON.stringify(getFilters()),
      (fail: any) => {
        console.log('Failed with this error: ' + fail);
      },
      (count: any, smsList: any) => {
        console.log(count, smsList);
        setSMS(smsList);
      },
    );
  };

  useEffect(() => {
    fetchSMS();
  }, []);

  return (
    <StyledView>
      <StyledText className="text-white">Loading sms</StyledText>
    </StyledView>
  );
}

export default SMSRetriever;
