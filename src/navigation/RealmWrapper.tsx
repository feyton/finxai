/* eslint-disable react-hooks/exhaustive-deps */
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RealmProvider, useApp} from '@realm/react';
import React, {useState} from 'react';
import {SafeAreaView} from 'react-native';
import {OpenRealmBehaviorType} from 'realm';
import CreateAccountScreen from '../screens/Account';
import AccountDetails from '../screens/AccountDetails';
import HomeScreen from '../screens/HomeScreen';
import {Account, SMSLog, Transaction} from '../tools/Schema';

const Stack = createNativeStackNavigator();

function RealWrapper() {
  const app = useApp();
  const [isLoggedIn, setIsLogin] = useState(false);

  return (
    <SafeAreaView>
      <RealmProvider
        sync={{
          flexible: true,
          newRealmFileBehavior: {
            type: OpenRealmBehaviorType.DownloadBeforeOpen,
          },
          existingRealmFileBehavior: {
            type: OpenRealmBehaviorType.OpenImmediately,
          },
          onError: (_session, error) => {
            console.log(error);
          },
        }}
        schemaVersion={1}
        schema={[Account, Transaction, SMSLog]}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Account" component={CreateAccountScreen} />
          <Stack.Screen name="AccountDetails" component={AccountDetails} />
        </Stack.Navigator>
      </RealmProvider>
    </SafeAreaView>
  );
}

export default RealWrapper;
