import React from 'react';
import {Button, Text, View} from 'react-native';

import {useQuery, useRealm} from '@realm/react';
import {styled} from 'nativewind';
import SMSRetriever from '../Components/SMSRetriever';
import {Account} from '../tools/Schema';

const StyledText = styled(Text);

const StyledView = styled(View);

function HomeScreen({navigation}): React.JSX.Element {
  const realm = useRealm();
  const accounts = useQuery(Account);
  const deleteAccount = account => {
    realm.write(() => {
      realm.delete(account);
    });
  };

  return (
    <View style={{backgroundColor: '#000'}}>
      <StyledView className="pt-1 bg-primary">
        <StyledText className="font-bold text-center text-white">
          Hello Fabrice
        </StyledText>
      </StyledView>
      <SMSRetriever />
      <StyledView className="px-2 py-1 bg-white rounded-lg shadow-lg">
        <StyledText className="text-black ">All account</StyledText>
        {accounts.map(account => {
          return (
            <>
              <View>
                <Text>{account.name}</Text>
                <Text>{account.amount}</Text>
                <Button
                  onPress={() => deleteAccount(account)}
                  title="Delete"></Button>
              </View>
            </>
          );
        })}
      </StyledView>
      <Button
        title="Create Account"
        onPress={() => navigation.navigate('Account')}
      />
    </View>
  );
}

export default HomeScreen;
