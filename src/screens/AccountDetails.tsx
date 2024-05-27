import {useObject} from '@realm/react';
import React from 'react';
import {Text, View} from 'react-native';
import {Account} from '../tools/Schema';

function AccountDetails({route}) {
  const {accountId} = route.params;
  const account = useObject(Account, accountId);

  if (!account) {
    return (
      <View>
        <Text>Account not found</Text>
      </View>
    );
  }

  return (
    <View style={{backgroundColor: '#001'}}>
      <Text>Name: {account.name}</Text>
      <Text>Category: {account.type}</Text>
      <Text>Number: {account.address}</Text>
      <Text>Total: {account.amount}</Text>
    </View>
  );
}

export default AccountDetails;
