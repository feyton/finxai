/* eslint-disable react/no-unstable-nested-components */
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {T, FONTS} from '../theme';
import {Icon} from '../Components/ui';
import BudgetScreen from '../screens/BudgetScreen';
import HomeScreen from '../screens/HomeScreen';
import RecordsPage from '../screens/RecordsPage';
import AccountScreenStack from './AccountNavigationStack';

const Tab = createBottomTabNavigator();

const TAB_HEIGHT = 68;

function AiFab({onPress}: {onPress?: () => void}) {
  return (
    <View style={styles.aiFabSlot}>
      <Pressable
        onPress={onPress}
        style={({pressed}) => [
          styles.aiFab,
          {transform: [{scale: pressed ? 0.93 : 1}]},
        ]}>
        <Icon name="Sparkles" size={23} color={T.accentInk} strokeWidth={2.2} />
      </Pressable>
    </View>
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
    <View style={styles.tabItem}>
      <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.4 : 1.9} />
      <Text style={[styles.tabLabel, {color}]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function MainStack() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName="HomePage"
      screenOptions={{
        tabBarStyle: [
          styles.tabBar,
          {
            height: TAB_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
          },
        ],
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
        component={HomeScreen}
        listeners={({navigation}) => ({
          tabPress: e => {
            e.preventDefault();
            navigation.getParent()?.navigate('AIChat');
          },
        })}
        options={{
          tabBarButton: ({onPress}) => (
            <AiFab onPress={onPress as () => void} />
          ),
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
    backgroundColor: '#0D1115',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
    // overflow visible is required so the floating FAB isn't clipped
    overflow: 'visible',
    elevation: 16,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 8,
    minWidth: 64,
  },
  tabLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    lineHeight: 14,
  },
  aiFabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  aiFab: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Lift it ~14px above the tab bar top edge
    marginTop: -14,
    // Ring that blends with the background, creating the floating look
    borderWidth: 3,
    borderColor: '#0D1115',
    // Android shadow via elevation
    elevation: 14,
    // iOS shadow
    shadowColor: T.accent,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
});
