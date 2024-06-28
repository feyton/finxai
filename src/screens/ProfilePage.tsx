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

const ProfilePage = () => {
  const coverPhoto =
    'https://www.blackpast.org/wp-content/uploads/prodimages/files/Kigali_Convention_Centre_December_1_2018_Courtesy_Raddison__CC_BY-SA_40.jpg';
  const user = useUser();
  console.log(user)
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
    <View style={{flex: 1, backgroundColor: 'white'}}>
      <View style={{height: 200}}>
        <Image
          source={{uri: coverPhoto}}
          style={{width: '100%', height: '100%'}}
        />
        <View
          style={{
            position: 'absolute',
            top: 150,
            left: width / 2 - 50,
            backgroundColor: 'white',
            borderRadius: 100,
            padding: 5,
          }}>
          <Image
            source={{uri: user?.photo ||  'https://res.cloudinary.com/feyton/image/upload/v1704708292/logo_dkwxhb.png'}}
          />
        </View>
      </View>
      <View style={{paddingHorizontal: 20, marginTop: 100}}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            fontFamily: 'Poppins-Medium',
            color: 'black',
          }}>
          {user?.name}
        </Text>
        <Text
          style={{
            fontSize: 16,
            color: 'black',
            fontFamily: 'Poppins-Medium',
          }}
        />
        <Text
          style={{fontSize: 16, color: 'black', fontFamily: 'Poppins-Medium'}}>
          {user?.email}
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
