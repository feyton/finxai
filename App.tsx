/* eslint-disable react/no-unstable-nested-components */
import React, {useEffect} from 'react';
import {PermissionsAndroid} from 'react-native';
import 'react-native-get-random-values';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RealmProvider} from '@realm/react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import CustomHeader from './src/Components/Header';
import MyTabs from './src/navigation/MainStack';
import AccountDetails from './src/screens/AccountDetails';
import CategoryManagementScreen from './src/screens/CategoryManagementScreen';
import ConfirmTransactionsScreen from './src/screens/ConfirmTransactions';
import CreateAccountScreen from './src/screens/CreateAccount';
import CreateBudgetScreen from './src/screens/CreateBudget';

import CreateRecord from './src/screens/CreateRecord';
import {
  Account,
  Budget,
  BudgetItem,
  Category,
  SplitDetail,
  Subcategory,
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
    <GestureHandlerRootView>
      <NavigationContainer>
        <RealmProvider
          schemaVersion={1}
          deleteRealmIfMigrationNeeded={true}
          schema={[
            Account,
            Transaction,
            Budget,
            BudgetItem,
            Category,
            SplitDetail,
            Subcategory,
          ]}>
          <Stack.Navigator
            screenOptions={({route}) => ({
              header: () => (
                <CustomHeader showBackButton={route.name !== 'Home'} />
              ),
            })}>
            <Stack.Screen name="Home" component={MyTabs} />
            <Stack.Screen name="Account" component={CreateAccountScreen} />
            <Stack.Screen name="Details" component={AccountDetails} />
            <Stack.Screen name="CreateRecord" component={CreateRecord} />
            <Stack.Screen
              name="Confirm"
              component={ConfirmTransactionsScreen}
            />
            <Stack.Screen name="CreateBudget" component={CreateBudgetScreen} />
            <Stack.Screen
              name="ManageCategories"
              component={CategoryManagementScreen}
            />
          </Stack.Navigator>
        </RealmProvider>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

export default App;
