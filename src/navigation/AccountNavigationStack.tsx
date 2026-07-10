import {createNativeStackNavigator} from '@react-navigation/native-stack';

import React from 'react';
import AccountDetails from '../screens/AccountDetails';
import AccountsPage from '../screens/AccountsPage';

const Stack = createNativeStackNavigator();

// CreateAccount lives on the ROOT stack (App.tsx), not here: inside the tab
// stack the floating tab bar overlays its footer button, and the tab
// remembers the create screen as its last route (stale "create" state).
export default function AccountScreenStack() {
  return (
    <Stack.Navigator
      initialRouteName="AccountsPage"
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="AccountsPage"  component={AccountsPage} />
      <Stack.Screen name="AccountDetails" component={AccountDetails} />
    </Stack.Navigator>
  );
}
