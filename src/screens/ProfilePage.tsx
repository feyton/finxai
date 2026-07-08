/* eslint-disable react-native/no-inline-styles */
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {usePowerSync} from '@powersync/react-native';
import React, {useState} from 'react';
import {
  Alert,
  Image,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {COLORS, FONTS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {clearMyData, hasSeededData, seedDemoData} from '../tools/seed';
import {supabase} from '../tools/supabase';

const ProfilePage = () => {
  const coverPhoto =
    'https://www.blackpast.org/wp-content/uploads/prodimages/files/Kigali_Convention_Centre_December_1_2018_Courtesy_Raddison__CC_BY-SA_40.jpg';
  const {name, email, picture, userId} = useCurrentUser();
  const db = usePowerSync();
  const [busy, setBusy] = useState(false);

  const performLogout = async () => {
    try {
      await GoogleSignin.signOut();
    } catch {}
    await supabase.auth.signOut();
  };

  const doSeed = async () => {
    if (!userId) {
      return;
    }
    setBusy(true);
    try {
      await seedDemoData(db, userId);
      Alert.alert('Done', 'Demo data seeded.');
    } catch (e: any) {
      Alert.alert('Seed failed', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const runSeed = async () => {
    if (!userId || busy) {
      return;
    }
    if (await hasSeededData(db, userId)) {
      Alert.alert(
        'Data already exists',
        'You already have accounts. Seed anyway (adds duplicates)?',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Seed anyway', onPress: doSeed},
        ],
      );
    } else {
      await doSeed();
    }
  };

  const runClear = () => {
    if (!userId || busy) {
      return;
    }
    Alert.alert(
      'Clear all my data?',
      'Deletes every record owned by this user (local + synced). This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await clearMyData(db, userId);
              Alert.alert('Done', 'All your data was deleted.');
            } catch (e: any) {
              Alert.alert('Clear failed', e?.message ?? 'Unknown error');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
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
      {__DEV__ && (
        <View style={{paddingHorizontal: 10, marginTop: 20}}>
          <Text
            style={{
              color: '#9CA3AF',
              fontFamily: FONTS.bold,
              fontSize: 13,
              marginBottom: 6,
              marginLeft: 4,
            }}>
            Developer
          </Text>
          <TouchableOpacity
            onPress={runSeed}
            disabled={busy}
            style={{
              backgroundColor: '#22C55E',
              padding: 10,
              borderRadius: 10,
              alignItems: 'center',
              opacity: busy ? 0.5 : 1,
              marginBottom: 8,
            }}>
            <Text style={{color: 'white', fontFamily: 'Poppins-Bold'}}>
              {busy ? 'Working…' : 'Seed demo data'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={runClear}
            disabled={busy}
            style={{
              backgroundColor: '#374151',
              padding: 10,
              borderRadius: 10,
              alignItems: 'center',
              opacity: busy ? 0.5 : 1,
            }}>
            <Text style={{color: '#F87171', fontFamily: 'Poppins-Bold'}}>
              Clear my data
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default ProfilePage;
