import React, {useEffect} from 'react';
import {PermissionsAndroid, SafeAreaView, Text, View} from 'react-native';

import {styled} from 'nativewind';
import SMSRetriever from './src/Components/SMSRetriever';

const StyledText = styled(Text);

const StyledView = styled(View);

function App(): React.JSX.Element {
  const requestSmsPermission = async () => {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    requestSmsPermission();
  }, []);

  return (
    <SafeAreaView style={{backgroundColor: '#1d2027', flex: 1}}>
      <StyledView className="pt-1 bg-primary">
        <StyledText className="font-bold text-center text-white">
          Hello Fabrice
        </StyledText>
      </StyledView>
      <SMSRetriever />
      <StyledView className="px-2 py-1 bg-white rounded-lg shadow-lg">
        <StyledText className="text-black ">All account</StyledText>
        <StyledText>300,000 Rwf</StyledText>
      </StyledView>
    </SafeAreaView>
  );
}

export default App;
