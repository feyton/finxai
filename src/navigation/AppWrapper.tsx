import React, {useEffect} from 'react';

import {NavigationContainer} from '@react-navigation/native';
import {AppProvider, UserProvider} from '@realm/react';
import {PermissionsAndroid} from 'react-native';
import Login from '../screens/Login';
import RealWrapper from './RealmWrapper';

function AppWrapper() {
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
        <UserProvider fallback={<Login />}>
          <RealWrapper />
        </UserProvider>
      </AppProvider>
    </NavigationContainer>
  );
}

export default AppWrapper;
