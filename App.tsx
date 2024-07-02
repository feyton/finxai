/* eslint-disable react/no-unstable-nested-components */
import React, {useEffect} from 'react';
import {PermissionsAndroid} from 'react-native';
import 'react-native-get-random-values';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {AppProvider, RealmProvider, UserProvider} from '@realm/react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import CustomHeader from './src/Components/Header';
import MyTabs from './src/navigation/MainStack';
import CategoryManagementScreen from './src/screens/CategoryManagementScreen';
import ConfirmTransactionsScreen from './src/screens/ConfirmTransactions';
import CreateBudgetScreen from './src/screens/CreateBudget';

import {ToastProvider} from 'react-native-toast-notifications';
import {OpenRealmBehaviorType} from 'realm';
import AddPlannedPaymentScreen from './src/screens/AddPlannedPayment';
import BudgetDetails from './src/screens/BudgetDetails';
import CreateRecord from './src/screens/CreateRecord';
import LoginScreen from './src/screens/LoginScreen';
import ScheduledPaymentsScreen from './src/screens/PlannedPaymentsScreen';
import ProfilePage from './src/screens/ProfilePage';
import {
  Account,
  AutoRecord,
  Budget,
  BudgetItem,
  Category,
  ScheduledPayment,
  SplitDetail,
  Subcategory,
  Subscription,
  Transaction,
  Transfer,
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
      <ToastProvider>
        <NavigationContainer>
          <AppProvider
            id="finxai-krgaaei"
            baseUrl="https://services.cloud.mongodb.com">
            <UserProvider fallback={<LoginScreen />}>
              <RealmProvider
                schemaVersion={0}
                sync={{
                  flexible: true,
                  newRealmFileBehavior: {
                    type: OpenRealmBehaviorType.DownloadBeforeOpen,
                  },
                  existingRealmFileBehavior: {
                    type: OpenRealmBehaviorType.OpenImmediately,
                  },
                  onError: (session, error) => {
                    // Replace this with a preferred logger in production.
                    console.error(error);
                  },
                  initialSubscriptions: {
                    update: (subs, realm) => {
                      subs.add(realm.objects(Account), {
                        name: 'All accounts',
                      });
                    },
                    rerunOnOpen: true,
                  },
                }}
                schema={[
                  Account,
                  Transaction,
                  Budget,
                  BudgetItem,
                  Category,
                  SplitDetail,
                  Subcategory,
                  AutoRecord,
                  Transfer,
                  ScheduledPayment,
                  Subscription,
                ]}>
                <Stack.Navigator
                  screenOptions={({route}) => ({
                    header: () => (
                      <CustomHeader showBackButton={route.name !== 'Home'} />
                    ),
                  })}>
                  <Stack.Screen
                    options={{headerShown: false}}
                    name="Home"
                    component={MyTabs}
                  />
                  <Stack.Screen name="CreateRecord" component={CreateRecord} />
                  <Stack.Screen
                    name="Confirm"
                    component={ConfirmTransactionsScreen}
                  />
                  <Stack.Screen
                    name="CreateBudget"
                    component={CreateBudgetScreen}
                  />
                  <Stack.Screen
                    name="BudgetDetails"
                    component={BudgetDetails}
                  />
                  <Stack.Screen
                    name="ManageCategories"
                    component={CategoryManagementScreen}
                  />
                  <Stack.Screen
                    name="ScheduledPayment"
                    component={ScheduledPaymentsScreen}
                  />
                  <Stack.Screen
                    name="AddPlannedPayment"
                    component={AddPlannedPaymentScreen}
                  />
                  <Stack.Screen name="UserProfile" component={ProfilePage} />
                </Stack.Navigator>
              </RealmProvider>
            </UserProvider>
          </AppProvider>
        </NavigationContainer>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}

export default App;
