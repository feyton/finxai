/* eslint-disable react/no-unstable-nested-components */
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, PermissionsAndroid, Share, View} from 'react-native';
import 'react-native-get-random-values';
import {AppDialogHost, appAlert} from './src/Components/AppDialog';
import {installCrashReporter, takeLastCrash} from './src/tools/crashReporter';

// Capture fatal JS errors as early as possible.
installCrashReporter();

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {PowerSyncContext} from '@powersync/react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ToastProvider} from 'react-native-toast-notifications';
import {Session} from '@supabase/supabase-js';

import MyTabs from './src/navigation/MainStack';
import AIChatScreen from './src/screens/AIChatScreen';
import AISettingsScreen from './src/screens/AISettingsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import SMSReviewScreen from './src/screens/SMSReviewScreen';
import CategoryManagementScreen from './src/screens/CategoryManagementScreen';
import ConfirmTransactionsScreen from './src/screens/ConfirmTransactions';
import CreateAccountScreen from './src/screens/CreateAccount';
import CreateBudgetScreen from './src/screens/CreateBudget';
import AddPlannedPaymentScreen from './src/screens/AddPlannedPayment';
import BudgetDetails from './src/screens/BudgetDetails';
import CreateRecord from './src/screens/CreateRecord';
import EditTransaction from './src/screens/EditTransaction';
import CategoryStats from './src/screens/CategoryStats';
import DebtScreen from './src/screens/DebtScreen';
import DebtDetails from './src/screens/DebtDetails';
import AddDebt from './src/screens/AddDebt';
import ShoppingScreen from './src/screens/ShoppingScreen';
import SharedScreen from './src/screens/SharedScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import LoginScreen from './src/screens/LoginScreen';
import ScheduledPaymentsScreen from './src/screens/PlannedPaymentsScreen';
import ProfilePage from './src/screens/ProfilePage';

import {db} from './src/tools/database';
import {connector} from './src/tools/SupabaseConnector';
import {supabase} from './src/tools/supabase';

const Stack = createNativeStackNavigator();

function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const requestSmsPermission = async () => {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    requestSmsPermission();

    // If the previous session died on a fatal JS error, show exactly what
    // happened so it can be reported instead of a bare "keeps stopping".
    takeLastCrash().then(crash => {
      if (!crash) {
        return;
      }
      const head = crash.stack.split('\n').slice(0, 5).join('\n');
      appAlert(
        `FinXAI crashed (v${crash.version})`,
        `${crash.message}\n\n${head}`,
        [
          {text: 'Dismiss', style: 'cancel'},
          {
            text: 'Share report',
            onPress: () =>
              Share.share({
                message: `FinXAI crash v${crash.version} at ${crash.at}\n${crash.message}\n\n${crash.stack}`,
              }).catch(() => {}),
          },
        ],
      );
    });

    supabase.auth.getSession().then(({data: {session: s}}) => {
      setSession(s);
      setLoading(false);
      if (s) {
        db.connect(connector);
      }
    });

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        db.connect(connector);
      } else {
        db.disconnect();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{flex: 1, backgroundColor: '#0A0D10', justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PowerSyncContext.Provider value={db}>
        <GestureHandlerRootView style={{flex: 1}}>
          <ToastProvider>
          <NavigationContainer>
            {!session ? (
              <LoginScreen />
            ) : (
              <Stack.Navigator
                screenOptions={{
                  headerShown: false,
                  contentStyle: {backgroundColor: '#0A0D10'},
                }}>
                <Stack.Screen name="Home" component={MyTabs} />
                <Stack.Screen name="AIChat" component={AIChatScreen} />
                <Stack.Screen name="AISettings" component={AISettingsScreen} />
                <Stack.Screen name="SMSReview" component={SMSReviewScreen} />
                <Stack.Screen name="Notifications" component={NotificationsScreen} />
                <Stack.Screen name="CreateRecord" component={CreateRecord} />
                <Stack.Screen name="EditTransaction" component={EditTransaction} />
                <Stack.Screen name="CategoryStats" component={CategoryStats} />
                <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
                <Stack.Screen name="Confirm" component={ConfirmTransactionsScreen} />
                <Stack.Screen name="CreateBudget" component={CreateBudgetScreen} />
                <Stack.Screen name="BudgetDetails" component={BudgetDetails} />
                <Stack.Screen name="ManageCategories" component={CategoryManagementScreen} />
                <Stack.Screen name="ScheduledPayment" component={ScheduledPaymentsScreen} />
                <Stack.Screen name="AddPlannedPayment" component={AddPlannedPaymentScreen} />
                <Stack.Screen name="UserProfile" component={ProfilePage} />
                <Stack.Screen name="Debt" component={DebtScreen} />
                <Stack.Screen name="DebtDetails" component={DebtDetails} />
                <Stack.Screen name="AddDebt" component={AddDebt} />
                <Stack.Screen name="Shopping" component={ShoppingScreen} />
                <Stack.Screen name="Shared" component={SharedScreen} />
                <Stack.Screen name="Schedule" component={ScheduleScreen} />
              </Stack.Navigator>
            )}
          </NavigationContainer>
          <AppDialogHost />
          </ToastProvider>
        </GestureHandlerRootView>
      </PowerSyncContext.Provider>
    </SafeAreaProvider>
  );
}

export default App;
