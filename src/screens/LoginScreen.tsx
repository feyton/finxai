/* eslint-disable react-native/no-inline-styles */
import {useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {ScrollView} from 'react-native-gesture-handler';
import {Path, Svg} from 'react-native-svg';
import {useToast} from 'react-native-toast-notifications';
import {COLORS, FONTS} from '../assets/images';
import {supabase} from '../tools/supabase';

GoogleSignin.configure({
  webClientId:
    '560260143969-rtfri6clp3brl8fcndptb89p96nd3hnn.apps.googleusercontent.com',
  scopes: ['email', 'profile'],
});

const LoginScreen = () => {
  const [inProgress, setInprogress] = useState(false);
  const toast = useToast();

  const signIn = async () => {
    try {
      setInprogress(true);
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        const {user, idToken} = response.data;
        if (!idToken) {
          toast.show('Google sign-in failed: no ID token', {type: 'danger'});
          return;
        }
        const {error} = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (error) {
          throw error;
        }
        toast.show('Welcome ' + user.givenName, {type: 'success'});
        // Auth state listener in App.tsx handles navigation automatically
      } else {
        toast.show('Sign In Cancelled', {type: 'info'});
      }
    } catch (error: any) {
      if (error.code === statusCodes.IN_PROGRESS) {
        toast.show('In Progress', {type: 'warning'});
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        toast.show('Enable Play Services', {type: 'danger'});
      } else {
        toast.show(error?.message ?? 'Sign in failed', {type: 'danger'});
      }
    } finally {
      setInprogress(false);
    }
  };

  return (
    <KeyboardAvoidingView contentContainerStyle={{flex: 1}}>
      <ScrollView
        contentContainerStyle={{
          backgroundColor: COLORS.bgPrimary,
          padding: 20,
          justifyContent: 'center',
          alignContent: 'center',
        }}
        keyboardShouldPersistTaps={'handled'}>
        <Text
          style={{
            color: '#d5d5d5',
            textAlign: 'center',
            fontFamily: 'Poppins-Black',
            fontSize: 25,
            marginTop: 50,
            marginBottom: 15,
          }}>
          Seamlessly Manage Your Finance
        </Text>
        <Text
          style={{
            justifyContent: 'center',
            textAlign: 'center',
            fontFamily: FONTS.regular,
          }}>
          FinxAI Help You Track Your Finance in style. From expenses to
          budgeting, we got you covered. Login to get started ➡️
        </Text>
        <Image
          resizeMode="contain"
          style={{
            height: 250,
            marginBottom: 10,
            marginTop: 10,
            marginLeft: -40,
          }}
          source={require('../assets/images/man.png')}
        />
        <TouchableOpacity
          onPress={signIn}
          style={{justifyContent: 'center', flex: 1, alignItems: 'center'}}>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#233f78',
              justifyContent: 'space-between',
              paddingHorizontal: 30,
              paddingVertical: 10,
              borderRadius: 10,
              width: 200,
              alignContent: 'center',
              alignItems: 'center',
            }}>
            <Image
              source={require('../assets/images/google_logo.png')}
              style={{width: 25, height: 25}}
            />
            <Text
              style={{
                fontFamily: 'Poppins-Regular',
                color: 'white',
                fontSize: 20,
                textAlign: 'center',
              }}>
              Login
            </Text>
            {inProgress ? (
              <ActivityIndicator
                style={{height: 25, width: 25}}
                color={'#7eb345'}
              />
            ) : (
              <Svg width="25px" height="25px" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M14.1427 15.9621C14.2701 16.2169 14.1593 16.5264 13.8991 16.6424L4.49746 20.835C3.00163 21.5021 1.45007 20.0209 2.19099 18.6331L5.34302 12.7294C5.58818 12.2702 5.58818 11.7298 5.34302 11.2706L2.19099 5.36689C1.45006 3.97914 3.00163 2.49789 4.49746 3.16496L8.02178 4.73662C8.44465 4.9252 8.78899 5.25466 8.99606 5.6688L14.1427 15.9621Z"
                  fill="#e0e2e9"
                />
                <Path
                  opacity="0.5"
                  d="M15.5332 15.3904C15.6529 15.6297 15.9397 15.7324 16.1841 15.6235L21.0066 13.4728C22.3304 12.8825 22.3304 11.1181 21.0066 10.5278L12.1089 6.55983C11.6802 6.36864 11.2481 6.82023 11.458 7.24008L15.5332 15.3904Z"
                  fill="#ffffff"
                />
              </Svg>
            )}
          </View>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
