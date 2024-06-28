/* eslint-disable react/no-unstable-nested-components */
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Path, Svg} from 'react-native-svg';
import CustomHeader from '../Components/Header';
import BudgetScreen from '../screens/BudgetScreen';
import HomeScreen from '../screens/HomeScreen';
import RecordsPage from '../screens/RecordsPage';
import AccountScreenStack from './AccountNavigationStack';

const Tab = createBottomTabNavigator();

function MainStack() {
  const focusedColor = '#3b66b4';
  const notFocusedColor = '#586172';

  return (
    <Tab.Navigator
      initialRouteName="HomePage"
      screenOptions={{
        tabBarStyle: styles.tabBarStyle,
        tabBarShowLabel: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}>
      <Tab.Screen
        name="HomePage"
        component={HomeScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <View style={styles.iconContainer}>
              <Svg width="24" height="23" viewBox="0 0 24 23" fill="none">
                <Path
                  d="M8.59983 21.1024V17.6982C8.59983 16.8292 9.35621 16.1248 10.2892 16.1248H13.6999C14.148 16.1248 14.5777 16.2905 14.8945 16.5856C15.2113 16.8807 15.3893 17.2809 15.3893 17.6982V21.1024C15.3865 21.4636 15.5386 21.811 15.8119 22.0674C16.0852 22.3238 16.4571 22.468 16.845 22.468H19.1719C20.2587 22.4706 21.3019 22.0704 22.0713 21.3556C22.8408 20.6408 23.2732 19.6703 23.2732 18.6581V8.96017C23.2732 8.14257 22.8841 7.36702 22.2107 6.84246L14.2949 0.954441C12.918 -0.0779306 10.9451 -0.0445979 9.60923 1.03361L1.87408 6.84246C1.16888 7.35156 0.747391 8.1294 0.726562 8.96017V18.6482C0.726563 20.7578 2.56279 22.468 4.82789 22.468H7.10168C7.90735 22.468 8.56212 21.8626 8.56796 21.1123L8.59983 21.1024Z"
                  fill={focused ? focusedColor : notFocusedColor}
                />
              </Svg>
              <Text
                style={[
                  styles.menuText,
                  {color: focused ? focusedColor : notFocusedColor},
                ]}>
                Home
              </Text>
            </View>
          ),
          header: () => <CustomHeader showBackButton={false} />,
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="AccountsStack"
        component={AccountScreenStack}
        options={{
          tabBarIcon: ({focused}) => (
            <View style={styles.iconContainer}>
              <Svg width="24" height="23" viewBox="0 0 24 23" fill="none">
                <Path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M6.45872 0.202454H17.541C21.5769 0.202454 23.8553 2.35001 23.8671 6.13634V16.5346C23.8671 20.3198 21.5769 22.4685 17.541 22.4685H6.45872C2.42287 22.4685 0.133789 20.3198 0.133789 16.5346V6.13634C0.133789 2.35001 2.42287 0.202454 6.45872 0.202454ZM12.0586 17.8594C12.5701 17.8594 12.9961 17.5031 13.0435 17.0244V5.67989C13.091 5.33477 12.9142 4.98853 12.5938 4.80038C12.2603 4.61112 11.8569 4.61112 11.5377 4.80038C11.2161 4.98853 11.0393 5.33477 11.0737 5.67989V17.0244C11.1342 17.5031 11.5602 17.8594 12.0586 17.8594ZM17.5185 17.8594C18.0169 17.8594 18.4429 17.5031 18.5034 17.0244V13.3728C18.5378 13.0154 18.361 12.6826 18.0394 12.4933C17.7202 12.304 17.3167 12.304 16.9845 12.4933C16.6629 12.6826 16.4861 13.0154 16.5335 13.3728V17.0244C16.581 17.5031 17.007 17.8594 17.5185 17.8594ZM7.51367 17.0244C7.4662 17.5031 7.04019 17.8594 6.52874 17.8594C6.01847 17.8594 5.59127 17.5031 5.54499 17.0244V9.33152C5.50939 8.98528 5.6862 8.64127 6.00779 8.45201C6.327 8.26275 6.73166 8.26275 7.05206 8.45201C7.37127 8.64127 7.55046 8.98528 7.51367 9.33152V17.0244Z"
                  fill={focused ? focusedColor : notFocusedColor}
                />
              </Svg>
              <Text
                style={[
                  styles.menuText,
                  {color: focused ? focusedColor : notFocusedColor},
                ]}>
                Accounts
              </Text>
            </View>
          ),
          header: ({route}) => (
            <CustomHeader showBackButton={route.name !== 'Accounts'} />
          ),
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={RecordsPage}
        options={{
          tabBarIcon: ({focused}) => (
            <View style={styles.iconContainer}>
              <Svg width="24" height="23" viewBox="0 0 24 23" fill="none">
                <Path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M18.8457 6.30687H23.8666C23.8666 2.52476 21.4511 0.315308 17.3584 0.315308H6.64151C2.54883 0.315308 0.133301 2.52476 0.133301 6.25863V14.4114C0.133301 18.1453 2.54883 20.3547 6.64151 20.3547H17.3584C21.4511 20.3547 23.8666 18.1453 23.8666 14.4114V14.0641H18.8457C16.5155 14.0641 14.6265 12.3362 14.6265 10.2048C14.6265 8.07333 16.5155 6.34546 18.8457 6.34546V6.30687ZM18.8457 7.96637H22.9806C23.4699 7.96637 23.8666 8.32922 23.8666 8.77682V11.5941C23.8609 12.0395 23.4676 12.3994 22.9806 12.4046H18.9407C17.761 12.4191 16.7294 11.6803 16.4618 10.6293C16.3278 9.97685 16.5159 9.30361 16.9757 8.78999C17.4355 8.27637 18.12 7.9749 18.8457 7.96637ZM19.025 10.9284H19.4153C19.9163 10.9284 20.3225 10.5569 20.3225 10.0986C20.3225 9.64037 19.9163 9.26888 19.4153 9.26888H19.025C18.7854 9.2663 18.5547 9.35157 18.3842 9.50564C18.2138 9.65972 18.1179 9.8698 18.1179 10.089C18.1179 10.5488 18.5223 10.9231 19.025 10.9284ZM5.75546 6.30687H12.4535C12.9545 6.30687 13.3607 5.93538 13.3607 5.47712C13.3607 5.01886 12.9545 4.64737 12.4535 4.64737H5.75546C5.25855 4.64734 4.8541 5.01299 4.84832 5.46747C4.84829 5.92732 5.25276 6.30158 5.75546 6.30687Z"
                  fill={focused ? focusedColor : notFocusedColor}
                />
              </Svg>
              <Text
                style={[
                  styles.menuText,
                  {color: focused ? focusedColor : notFocusedColor},
                ]}>
                Records
              </Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Budget"
        component={BudgetScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <View style={styles.iconContainer}>
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <Path
                  opacity="0.5"
                  d="M9.052 4.5C9 5.07763 9 5.80355 9 6.72183V17.2781C9 18.1964 9 18.9224 9.05201 19.5H8C5.64298 19.5 4.46447 19.5 3.73223 18.7678C3 18.0355 3 16.857 3 14.5V9.5C3 7.14298 3 5.96447 3.73223 5.23223C4.46447 4.5 5.64298 4.5 8 4.5H9.052Z"
                  fill="#1C274C"
                />
                <Path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M9.70725 2.4087C9 3.03569 9 4.18259 9 6.4764V17.5236C9 19.8174 9 20.9643 9.70725 21.5913C10.4145 22.2183 11.4955 22.0297 13.6576 21.6526L15.9864 21.2465C18.3809 20.8288 19.5781 20.62 20.2891 19.7417C21 18.8635 21 17.5933 21 15.0529V8.94711C21 6.40671 21 5.13652 20.2891 4.25826C19.5781 3.37999 18.3809 3.17118 15.9864 2.75354L13.6576 2.34736C11.4955 1.97026 10.4145 1.78171 9.70725 2.4087ZM12.75 10.9535C12.75 10.52 12.4142 10.1686 12 10.1686C11.5858 10.1686 11.25 10.52 11.25 10.9535V13.0465C11.25 13.48 11.5858 13.8314 12 13.8314C12.4142 13.8314 12.75 13.48 12.75 13.0465V10.9535Z"
                  fill={focused ? focusedColor : notFocusedColor}
                />
              </Svg>
              <Text
                style={[
                  styles.menuText,
                  {color: focused ? focusedColor : notFocusedColor},
                ]}>
                Budget
              </Text>
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  menuText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    marginTop: 1,
  },
  tabBarStyle: {
    backgroundColor: '#252933',
    borderTopColor: 'transparent',
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopEndRadius: 10,
    borderTopRightRadius: 10,
    marginBottom: 0,
    padding: 0,
    position: 'absolute',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
  },
});

export default MainStack;
