/* eslint-disable react-native/no-inline-styles */
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import React from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {COLORS, FONTS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {supabase} from '../tools/supabase';

const ProfilePage = () => {
  const coverPhoto =
    'https://www.blackpast.org/wp-content/uploads/prodimages/files/Kigali_Convention_Centre_December_1_2018_Courtesy_Raddison__CC_BY-SA_40.jpg';
  const {name, email, picture} = useCurrentUser();

  const performLogout = async () => {
    try {
      await GoogleSignin.signOut();
    } catch {}
    await supabase.auth.signOut();
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
          <Image source={{uri: picture ?? undefined}} height={100} width={100} />
        </View>
      </View>
      <View style={{paddingHorizontal: 20, marginTop: 100}}>
        <Text
          style={{
            fontSize: 20,
            fontFamily: FONTS.bold,
            color: 'white',
          }}>
          {name}
        </Text>
        <Text
          style={{fontSize: 16, color: 'white', fontFamily: 'Poppins-Medium'}}>
          {email}
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
