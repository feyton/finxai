import React, {useEffect} from 'react';
import {PermissionsAndroid} from 'react-native';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RealmProvider} from '@realm/react';
import CreateAccountScreen from './src/screens/Account';
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
    <NavigationContainer >
      <RealmProvider schema={[Account, Transaction, SMSLog]}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Account" component={CreateAccountScreen} />
        </Stack.Navigator>
      </RealmProvider>
    </NavigationContainer>
  );
}

export default App;
