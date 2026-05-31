/* eslint-disable react/no-unstable-nested-components */
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {T, FONTS} from '../theme';
import {Icon} from '../Components/ui';
import BudgetScreen from '../screens/BudgetScreen';
import HomeScreen from '../screens/HomeScreen';
import RecordsPage from '../screens/RecordsPage';
import AccountScreenStack from './AccountNavigationStack';

const Tab = createBottomTabNavigator();

function AiFab({onPress}: {onPress?: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.aiFab, {transform: [{scale: pressed ? 0.94 : 1}]}]}>
      <Icon name="Sparkles" size={24} color={T.accentInk} strokeWidth={2.2} />
    </Pressable>
  );
}

function TabIcon({
  name,
  label,
  focused,
}: {
  name: string;
  label: string;
  focused: boolean;
}) {
  const color = focused ? T.accent : T.text3;
  return (
    <View style={styles.iconContainer}>
      <Icon name={name} size={21} color={color} strokeWidth={focused ? 2.4 : 1.9} />
      <Text style={[styles.label, {color}]}>{label}</Text>
    </View>
  );
}

function MainStack() {
  return (
    <Tab.Navigator
      initialRouteName="HomePage"
      screenOptions={{
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}>
      <Tab.Screen
        name="HomePage"
        component={HomeScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon name="Home" label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="AccountsStack"
        component={AccountScreenStack}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon name="Wallet" label="Accounts" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="AITab"
        component={HomeScreen} // dummy — navigation intercepts tabPress
        listeners={({navigation}) => ({
          tabPress: e => {
            e.preventDefault();
            navigation.getParent()?.navigate('AIChat');
          },
        })}
        options={{
          tabBarButton: ({onPress}) => <AiFab onPress={onPress as () => void} />,
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={RecordsPage}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon name="Receipt" label="Records" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Budget"
        component={BudgetScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon name="PieChart" label="Budget" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(13,17,21,0.95)',
    borderTopWidth: 1,
    borderTopColor: T.border,
    height: 64,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 0,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 10,
  },
  aiFab: {
    width: 52,
    height: 52,
    borderRadius: 18,
    marginBottom: 22,
    backgroundColor: T.accent600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: T.bg,
    shadowColor: T.accent,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
});

export default MainStack;
