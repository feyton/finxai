/* eslint-disable react/no-unstable-nested-components */
import React, {useEffect} from 'react';
import {PermissionsAndroid} from 'react-native';
import 'react-native-get-random-values';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RealmProvider} from '@realm/react';
import CustomHeader from './src/Components/Header';
import MyTabs from './src/navigation/MainStack';
import CreateAccountScreen from './src/screens/Account';
import AccountDetails from './src/screens/AccountDetails';
import CategoryManagementScreen from './src/screens/CategoryManagementScreen';
import ConfirmTransactionsScreen from './src/screens/ConfirmTransactions';
import CreateBudgetScreen from './src/screens/CreateBudget';
import {
  Account,
  Budget,
  BudgetItem,
  Category,
  Transaction,
} from './src/tools/Schema';
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
      <RealmProvider
        schemaVersion={1}
        deleteRealmIfMigrationNeeded={true}
        schema={[Account, Transaction, Budget, BudgetItem, Category]}>
        <Stack.Navigator
          screenOptions={({route}) => ({
            header: () => (
              <CustomHeader showBackButton={route.name !== 'Home'} />
            ),
          })}>
          <Stack.Screen name="Home" component={MyTabs} />
          <Stack.Screen name="Account" component={CreateAccountScreen} />
          <Stack.Screen name="Details" component={AccountDetails} />
          <Stack.Screen name="Confirm" component={ConfirmTransactionsScreen} />
          <Stack.Screen name="CreateBudget" component={CreateBudgetScreen} />
          <Stack.Screen
            name="ManageCategories"
            component={CategoryManagementScreen}
          />
        </Stack.Navigator>
      </RealmProvider>
    </NavigationContainer>
  );
}

export default App;
