/* eslint-disable react/no-unstable-nested-components */
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, AppState, PermissionsAndroid, Share, View} from 'react-native';
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
import CategoryTransactions from './src/screens/CategoryTransactions';
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
import {refreshBalanceWidget} from './src/widgets/refreshWidget';
import {startSyncWatchdog} from './src/tools/syncWatchdog';

const Stack = createNativeStackNavigator();

function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const requestSmsPermission = async () => {
    try {
      // READ_SMS covers the inbox poll; RECEIVE_SMS is what delivers the
      // broadcast as a message arrives, which is what makes capture real-time.
      // Requested together because refusing one makes the other half-useless.
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ]);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    requestSmsPermission();

    // Sync connection failures (auth rejection, network errors, etc.) were
    // previously silent — the UI just stayed empty with no diagnostic
    // trail anywhere. Logging status changes means a PowerSync-side issue
    // shows up in logcat instead of looking like a client bug.
    // Log only on an actual CHANGE. This fires many times a second during
    // normal sync, and an unconditional log buried every other diagnostic in
    // logcat — which is exactly where SMS-ingest and headless-task problems have
    // to be read from.
    let lastStatus = '';
    const unsubStatus = db.registerListener({
      statusChanged: status => {
        const snapshot = JSON.stringify({
          connected: status.connected,
          connecting: status.connecting,
          downloadError: status.dataFlowStatus?.downloadError?.message,
          uploadError: status.dataFlowStatus?.uploadError?.message,
        });
        if (snapshot !== lastStatus) {
          lastStatus = snapshot;
          console.log('[PowerSync status]', snapshot);
        }
      },
    });

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
      // Guarded for the same reason as the listener below: onAuthStateChange also
      // fires INITIAL_SESSION around now, so without this the app connects twice
      // before it has finished starting.
      if (s && !db.connected) {
        db.connect(connector);
      }
    });

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) {
        // Only connect when NOT already connected.
        //
        // This used to call db.connect(connector) on every auth event. Supabase
        // fires TOKEN_REFRESHED roughly hourly, so a long-lived session
        // re-connected an already-connected client again and again — on top of
        // the connect in getSession() above. That left PowerSync reporting
        // `connected: true` (downloads fine) while the CRUD upload loop was dead,
        // so local writes were recorded and never uploaded, silently, for hours.
        // The tell in logcat was "Trying to close for the second time".
        //
        // PowerSync does NOT need a reconnect to pick up a refreshed token: it
        // calls fetchCredentials itself when the current one expires.
        if (!db.connected) {
          console.log(`[PowerSync] connecting (auth event: ${event})`);
          db.connect(connector);
        }
      } else {
        // Plain disconnect — NOT disconnectAndClear. This fires on any
        // session loss, including a transient one Supabase recovers from
        // on its own (a token-refresh hiccup, the app being backgrounded
        // past token expiry, a clock skew blip) — none of those are the
        // user asking to sign out, and wiping local data on a recoverable
        // blip forces a full from-scratch resync for no reason (this bit
        // us: see the account-switching fix below for why clearing
        // matters, and ProfilePage's performLogout for where it actually
        // belongs — a DELIBERATE sign-out, never this listener).
        db.disconnect();
      }
    });

    // Watches for a connected-but-not-draining upload queue and rebuilds the sync
    // connection. PowerSync reports no error in that state, so without this the app
    // simply stops syncing — in both directions — until someone notices.
    const stopWatchdog = startSyncWatchdog();

    return () => {
      subscription.unsubscribe();
      unsubStatus();
      stopWatchdog();
    };
  }, []);

  useEffect(() => {
    // Best-effort refresh so the home-screen widget shows current balances
    // right as the user leaves the app — catches balance-changing flows
    // that don't already call refreshBalanceWidget() themselves.
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        refreshBalanceWidget();
      }
    });
    return () => sub.remove();
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
                <Stack.Screen name="CategoryTransactions" component={CategoryTransactions} />
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
