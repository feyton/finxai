/* eslint-disable react-native/no-inline-styles */
import {TouchableOpacity} from '@gorhom/bottom-sheet';
import {useNavigation} from '@react-navigation/native';
import React from 'react';
import {Text, View} from 'react-native';
import {Path, Svg} from 'react-native-svg';

const ServiceSection = () => {
  const navigate = useNavigation();
  return (
    <View
      style={{
        padding: 16,
        backgroundColor: '#2e2e2e',
        margin: 10,
        borderRadius: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 70,
      }}>
      <TouchableOpacity
        onPress={() => navigate.navigate('ManageCategories')}
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}>
        <Svg width="30px" height="30px" viewBox="0 0 24 24" fill="none">
          <Path
            d="M3.00156 9.75C3 10.1421 3 10.558 3 11V13C3 16.7497 3 18.6246 3.95491 19.9389C4.26331 20.3634 4.6366 20.7367 5.06107 21.0451C6.3754 22 8.25027 22 12 22C15.7497 22 17.6246 22 18.9389 21.0451C19.3634 20.7367 19.7367 20.3634 20.0451 19.9389C21 18.6246 21 16.7497 21 13V11C21 10.558 21 10.1421 20.9984 9.75H17.6465C17.32 10.9043 16.2588 11.75 15 11.75H9C7.74122 11.75 6.67998 10.9043 6.35352 9.75H3.00156Z"
            fill="#e5e9f3"
          />
          <Path
            opacity="0.5"
            d="M3.02148 8.25H6.35371C6.68017 7.09575 7.74141 6.25 9.00019 6.25H15.0002C16.259 6.25 17.3202 7.09575 17.6467 8.25H20.9789C20.9245 6.23924 20.7314 5.00546 20.0453 4.06107C19.7369 3.6366 19.3636 3.26331 18.9391 2.95491C17.6248 2 15.7499 2 12.0002 2C8.25046 2 6.37559 2 5.06126 2.95491C4.63679 3.26331 4.2635 3.6366 3.95511 4.06107C3.26897 5.00546 3.07584 6.23924 3.02148 8.25Z"
            fill="#a4e22f"
          />
          <Path
            opacity="0.7"
            d="M7.75 9C7.75 8.30964 8.30964 7.75 9 7.75H15C15.6904 7.75 16.25 8.30964 16.25 9C16.25 9.69036 15.6904 10.25 15 10.25H9C8.30964 10.25 7.75 9.69036 7.75 9Z"
            fill="#cc2d18"
          />
        </Svg>
        <Text
          style={{
            fontFamily: 'Poppins-Regular',
            fontSize: 11,
          }}>
          Categories
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}>
        <Svg width="30px" height="30px" viewBox="0 0 24 24" fill="none">
          <Path
            opacity="0.5"
            d="M9.052 4.5C9 5.07763 9 5.80355 9 6.72183V17.2781C9 18.1964 9 18.9224 9.05201 19.5H8C5.64298 19.5 4.46447 19.5 3.73223 18.7678C3 18.0355 3 16.857 3 14.5V9.5C3 7.14298 3 5.96447 3.73223 5.23223C4.46447 4.5 5.64298 4.5 8 4.5H9.052Z"
            fill="#939ab1"
          />
          <Path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M9.70725 2.4087C9 3.03569 9 4.18259 9 6.4764V17.5236C9 19.8174 9 20.9643 9.70725 21.5913C10.4145 22.2183 11.4955 22.0297 13.6576 21.6526L15.9864 21.2465C18.3809 20.8288 19.5781 20.62 20.2891 19.7417C21 18.8635 21 17.5933 21 15.0529V8.94711C21 6.40671 21 5.13652 20.2891 4.25826C19.5781 3.37999 18.3809 3.17118 15.9864 2.75354L13.6576 2.34736C11.4955 1.97026 10.4145 1.78171 9.70725 2.4087ZM12.75 10.9535C12.75 10.52 12.4142 10.1686 12 10.1686C11.5858 10.1686 11.25 10.52 11.25 10.9535V13.0465C11.25 13.48 11.5858 13.8314 12 13.8314C12.4142 13.8314 12.75 13.48 12.75 13.0465V10.9535Z"
            fill="#6bd424"
          />
        </Svg>
        <Text
          style={{
            fontFamily: 'Poppins-Regular',
            fontSize: 11,
          }}>
          Debt
        </Text>
      </TouchableOpacity>
      <View
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}>
        <Svg width="30px" height="30px" viewBox="0 0 24 24" fill="none">
          <Path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M7 5H11C12.8856 5 13.8284 5 14.4142 5.58579C15 6.17157 15 7.11438 15 9V21.25H16.5H21H22C22.4142 21.25 22.75 21.5858 22.75 22C22.75 22.4142 22.4142 22.75 22 22.75H2C1.58579 22.75 1.25 22.4142 1.25 22C1.25 21.5858 1.58579 21.25 2 21.25H3V9C3 7.11438 3 6.17157 3.58579 5.58579C4.17157 5 5.11438 5 7 5ZM5.25 8C5.25 7.58579 5.58579 7.25 6 7.25H12C12.4142 7.25 12.75 7.58579 12.75 8C12.75 8.41421 12.4142 8.75 12 8.75H6C5.58579 8.75 5.25 8.41421 5.25 8ZM5.25 11C5.25 10.5858 5.58579 10.25 6 10.25H12C12.4142 10.25 12.75 10.5858 12.75 11C12.75 11.4142 12.4142 11.75 12 11.75H6C5.58579 11.75 5.25 11.4142 5.25 11ZM5.25 14C5.25 13.5858 5.58579 13.25 6 13.25H12C12.4142 13.25 12.75 13.5858 12.75 14C12.75 14.4142 12.4142 14.75 12 14.75H6C5.58579 14.75 5.25 14.4142 5.25 14ZM9 18.25C9.41421 18.25 9.75 18.5858 9.75 19V21.25H8.25V19C8.25 18.5858 8.58579 18.25 9 18.25Z"
            fill="#7e1b60"
          />
          <Path
            opacity="0.5"
            d="M15 2H17C18.8856 2 19.8284 2 20.4142 2.58579C21 3.17157 21 4.11438 21 6V21.25H15V9C15 7.11438 15 6.17157 14.4142 5.58579C13.8416 5.01319 12.9279 5.0003 11.126 5.00001V3.49999C11.2103 3.11275 11.351 2.82059 11.5858 2.58579C12.1715 2 13.1144 2 15 2Z"
            fill="#0b34b9"
          />
        </Svg>
        <Text
          style={{
            fontFamily: 'Poppins-Regular',
            fontSize: 11,
          }}>
          Shopping
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => navigate.navigate('ScheduledPayment')}
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}>
        <Svg
          width="30px"
          height="30px"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <Path
            d="M6.96006 2C7.37758 2 7.71605 2.30996 7.71605 2.69231V4.08883C8.38663 4.07692 9.13829 4.07692 9.98402 4.07692H14.016C14.8617 4.07692 15.6134 4.07692 16.284 4.08883V2.69231C16.284 2.30996 16.6224 2 17.0399 2C17.4575 2 17.7959 2.30996 17.7959 2.69231V4.15008C19.2468 4.25647 20.1992 4.51758 20.899 5.15838C21.5987 5.79917 21.8838 6.67139 22 8V9H2V8C2.11618 6.67139 2.4013 5.79917 3.10104 5.15838C3.80079 4.51758 4.75323 4.25647 6.20406 4.15008V2.69231C6.20406 2.30996 6.54253 2 6.96006 2Z"
            fill="#cca525"
          />
          <Path
            opacity="0.5"
            d="M22 14V12C22 11.161 21.9873 9.66527 21.9744 9H2.00586C1.99296 9.66527 2.00564 11.161 2.00564 12V14C2.00564 17.7712 2.00564 19.6569 3.17688 20.8284C4.34813 22 6.23321 22 10.0034 22H14.0023C17.7724 22 19.6575 22 20.8288 20.8284C22 19.6569 22 17.7712 22 14Z"
            fill="#a4acc5"
          />
          <Path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M16 13.25C16.4142 13.25 16.75 13.5858 16.75 14V15.25L18 15.25C18.4142 15.25 18.75 15.5858 18.75 16C18.75 16.4142 18.4142 16.75 18 16.75H16.75L16.75 18C16.75 18.4142 16.4142 18.75 16 18.75C15.5858 18.75 15.25 18.4142 15.25 18L15.25 16.75L14 16.75C13.5858 16.75 13.25 16.4142 13.25 16C13.25 15.5858 13.5858 15.25 14 15.25H15.25L15.25 14C15.25 13.5858 15.5858 13.25 16 13.25Z"
            fill="#cca525"
          />
        </Svg>
        <Text
          style={{
            fontFamily: 'Poppins-Regular',
            fontSize: 11,
          }}>
          Planned
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default ServiceSection;
