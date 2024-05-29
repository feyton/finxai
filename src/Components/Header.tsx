import {useNavigation} from '@react-navigation/native';
import React from 'react';
import {Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Circle, Path, Svg} from 'react-native-svg';

interface HeaderProps {
  showBackButton?: boolean;
}

const CustomHeader: React.FC<HeaderProps> = ({showBackButton}) => {
  const user: any = {name: 'Fabrice', photo: 'https://example.com/photo.jpg'}; // Replace with your user context or prop
  const navigation: any = useNavigation();

  const handleBackPress = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftContainer}>
        {showBackButton ? (
          <TouchableOpacity onPress={handleBackPress}>
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <Path
                d="M15 19L8 12L15 5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </TouchableOpacity>
        ) : (
          <View>
            <Svg width="30" height="30" viewBox="0 0 30 30">
              <Path fill="#fff" d="M10 6L15 18L20 6H10Z" />
              <Path stroke="#fff" strokeWidth="2" d="M5 24L25 24" />
              <Circle cx="15" cy="12" r="2" fill="#000" />
            </Svg>
          </View>
        )}
        <View style={styles.welcomeContainer}>
          <Text style={styles.hello}>Hello</Text>
          <Text style={styles.name}>{user.name}</Text>
        </View>
      </View>
      <View style={styles.rightContainer}>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 22C13.1046 22 14 21.1046 14 20H10C10 21.1046 10.8954 22 12 22ZM18 16V11C18 7.13401 15.3137 4.11365 11.5 4.01385V4C11.5 3.72386 11.2761 3.5 11 3.5C10.7239 3.5 10.5 3.72386 10.5 4V4.01385C6.68629 4.11365 4 7.13401 4 11V16L2 18V19H22V18L20 16H18Z"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Image source={{uri: user.photo}} style={styles.profileImage} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: 'gray',
    borderBottomWidth: 0.5,
    marginBottom: 10,
    marginTop: 5,
    paddingBottom: 5,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  welcomeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginLeft: 5,
    gap: 3,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hello: {
    fontFamily: 'Poppins-Regular',
    textAlign: 'left',
  },
  name: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    textAlign: 'left',
  },
  profileImage: {
    height: 40,
    width: 40,
    borderRadius: 20,
    marginLeft: 15,
  },
});

export default CustomHeader;
