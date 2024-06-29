/* eslint-disable react-native/no-inline-styles */
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {useAuth, useUser} from '@realm/react';
import React from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {COLORS, FONTS} from '../assets/images';
import { Profile } from '../Components/Header';

const ProfilePage = () => {
  const coverPhoto =
    'https://www.blackpast.org/wp-content/uploads/prodimages/files/Kigali_Convention_Centre_December_1_2018_Courtesy_Raddison__CC_BY-SA_40.jpg';
  const user:any = useUser();
  const userData:Profile = user.profile;
  const {logOut} = useAuth();
  const performLogout = () => {
    GoogleSignin.configure({
      offlineAccess: true,
      webClientId:
        '560260143969-6nqjnkc3juvn8p7177bl3k69csnfifm1.apps.googleusercontent.com',
    });
    GoogleSignin.signOut();
    logOut();
  };

  const {width} = useWindowDimensions();

  return (
    <View style={{flex: 1, backgroundColor: COLORS.bgPrimary}}>
      <View style={{height: 150}}>
        <Image
          source={{uri: coverPhoto}}
          style={{width: '100%', height: '100%'}}
        />
        <View
          style={{
            position: 'absolute',
            top: 100,
            left: width / 2 - 50,
            backgroundColor: 'white',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
          <Image source={{uri: userData?.picture}} height={100} width={100} />
        </View>
      </View>
      <View style={{paddingHorizontal: 20, marginTop: 100}}>
        <Text
          style={{
            fontSize: 20,
            fontFamily: FONTS.bold,
            color: 'white',
          }}>
          {userData?.name}
        </Text>

        <Text
          style={{fontSize: 16, color: 'white', fontFamily: 'Poppins-Medium'}}>
          {userData?.email}
        </Text>
      </View>
      <TouchableOpacity
        onPress={performLogout}
        style={{
          backgroundColor: 'red',
          padding: 10,
          margin: 10,
          borderRadius: 10,
          paddingHorizontal: 20,
          alignItems: 'center',
          width: 'auto',
        }}>
        <Text style={{color: 'white', fontFamily: 'Poppins-Bold'}}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ProfilePage;
