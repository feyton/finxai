import React, {useEffect, useState} from 'react';
import {ActivityIndicator, PermissionsAndroid} from 'react-native';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {AppProvider, RealmProvider, UserProvider, useApp} from '@realm/react';
import {Credentials, OpenRealmBehaviorType} from 'realm';
import CreateAccountScreen from './src/screens/Account';
import AccountDetails from './src/screens/AccountDetails';
import HomeScreen from './src/screens/HomeScreen';
import {Account, SMSLog, Transaction} from './src/tools/Schema';
const Stack = createNativeStackNavigator();

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
    <NavigationContainer>
      <AppProvider id="finxai-krgaaei">
        <UserProvider>
          {isLoggedIn ? (
            <RealmProvider
              sync={{
                flexible: true,
                newRealmFileBehavior: {
                  type: OpenRealmBehaviorType.DownloadBeforeOpen,
                },
                existingRealmFileBehavior: {
                  type: OpenRealmBehaviorType.OpenImmediately,
                },
              }}
              schemaVersion={1}
              schema={[Account, Transaction, SMSLog]}
              deleteRealmIfMigrationNeeded={true}>
              <Stack.Navigator>
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Account" component={CreateAccountScreen} />
                <Stack.Screen
                  name="AccountDetails"
                  component={AccountDetails}
                />
              </Stack.Navigator>
            </RealmProvider>
          ) : (
            <ActivityIndicator size={'large'} />
          )}
        </UserProvider>
      </AppProvider>
    </NavigationContainer>
  );
}

export default App;
