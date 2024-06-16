import {createNativeStackNavigator} from '@react-navigation/native-stack';

import React from 'react';
import AccountDetails from '../screens/AccountDetails';
import AccountsPage from '../screens/AccountsPage';
import CreateAccountScreen from '../screens/CreateAccount';

const Stack = createNativeStackNavigator();

export default function AccountScreenStack() {
  return (
    <Stack.Navigator
      initialRouteName="AccountsPage"
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="AccountsPage" component={AccountsPage} />
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
      <Stack.Screen name="AccountDetails" component={AccountDetails} />
    </Stack.Navigator>
  );
}
