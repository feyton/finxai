/* eslint-disable react-native/no-inline-styles */
import {useQuery, useRealm} from '@realm/react';
import React, {useCallback, useState} from 'react';

import Clipboard from '@react-native-clipboard/clipboard';
import {styled} from 'nativewind';
import {
  Button,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Path, Svg} from 'react-native-svg';
import {Account, Transaction} from '../tools/Schema';

interface Props {
  navigation: any;
}

const StyledText = styled(Text);
const StyledView = styled(View);

const AccountsPage: React.FC<Props> = ({navigation}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const realm = useRealm();
  const accounts = useQuery(Account);

  const deleteAccount = useCallback(() => {
    realm.write(() => {
      const transactionsToDelete = realm
        .objects(Transaction)
        .filtered('account == $0', selectedAccount);
      realm.delete(transactionsToDelete);
      realm.delete(selectedAccount);
    });
    setModalVisible(false);
  }, [realm, selectedAccount]);

  const handleLongPress = useCallback((account: any) => {
    setSelectedAccount(account);
    setModalVisible(true);
  }, []);

  const handlePress = useCallback(
    (account: any) => {
      navigation.navigate('Details', {accountId: account._id});
    },
    [navigation],
  );

  const renderAccount = useCallback(
    ({item: account}: any) => (
      <TouchableOpacity
        key={account._id.toString()}
        style={styles.card}
        onPress={() => handlePress(account)}
        onLongPress={() => handleLongPress(account)}>
        <ImageBackground
          resizeMode="stretch"
          source={{
            uri: 'https://res.cloudinary.com/feyton/image/upload/v1717410044/f0xwtiflerpfsepgnkm4.png',
          }}>
          <View
            style={{
              width: 230,
              padding: 25,
              height: 170,
              marginHorizontal: 0,
              borderRadius: 10,
              position: 'relative',
            }}>
            <View>
              <Text
                style={{
                  fontFamily: 'Poppins-Bold',
                  fontSize: 12,
                  color: 'black',
                }}>
                {account.name}
              </Text>
              <Text
                style={{
                  fontFamily: 'Poppins-Bold',
                  fontSize: 16,
                  color: 'black',
                }}>
                RWF: {account.getTotalAmount}
              </Text>
            </View>
            <View style={{marginTop: 40, flexDirection: 'row', gap: 3}}>
              <TouchableOpacity
                onLongPress={() => {
                  Clipboard.setString(account.number);
                }}
                style={{flexDirection: 'row', alignItems: 'center', gap: 2}}>
                <Text
                  style={{
                    fontFamily: 'Poppins-Bold',
                    fontSize: 14,
                    color: '#1169c0',
                  }}>
                  {account.number}
                </Text>
                <Svg width="15px" height="15px" viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M6.59961 11.3974C6.59961 8.67119 6.59961 7.3081 7.44314 6.46118C8.28667 5.61426 9.64432 5.61426 12.3596 5.61426H15.2396C17.9549 5.61426 19.3125 5.61426 20.1561 6.46118C20.9996 7.3081 20.9996 8.6712 20.9996 11.3974V16.2167C20.9996 18.9429 20.9996 20.306 20.1561 21.1529C19.3125 21.9998 17.9549 21.9998 15.2396 21.9998H12.3596C9.64432 21.9998 8.28667 21.9998 7.44314 21.1529C6.59961 20.306 6.59961 18.9429 6.59961 16.2167V11.3974Z"
                    fill="#1C274C"
                  />
                  <Path
                    opacity="0.5"
                    d="M4.17157 3.17157C3 4.34315 3 6.22876 3 10V12C3 15.7712 3 17.6569 4.17157 18.8284C4.78913 19.446 5.6051 19.738 6.79105 19.8761C6.59961 19.0353 6.59961 17.8796 6.59961 16.2167V11.3974C6.59961 8.6712 6.59961 7.3081 7.44314 6.46118C8.28667 5.61426 9.64432 5.61426 12.3596 5.61426H15.2396C16.8915 5.61426 18.0409 5.61426 18.8777 5.80494C18.7403 4.61146 18.4484 3.79154 17.8284 3.17157C16.6569 2 14.7712 2 11 2C7.22876 2 5.34315 2 4.17157 3.17157Z"
                    fill="#1C274C"
                  />
                </Svg>
              </TouchableOpacity>
            </View>
            <Image
              style={{
                height: 30,
                width: 30,
                position: 'absolute',
                top: 25,
                right: 25,
                borderRadius: 50,
              }}
              source={{uri: account.logo}}
            />
          </View>
        </ImageBackground>
      </TouchableOpacity>
    ),
    [handlePress, handleLongPress],
  );
  return (
    <View style={styles.container}>
      <View>
        <Text
          style={{
            marginHorizontal: 20,
            color: 'white',
            fontFamily: 'Poppins-Bold',
            fontSize: 16,
          }}>
          Accounts
        </Text>
        <FlatList
          horizontal
          data={accounts}
          renderItem={renderAccount}
          keyExtractor={account => account._id.toString()}
          showsHorizontalScrollIndicator={false}
        />
      </View>

      {selectedAccount && (
        <Modal
          animationType="slide"
          transparent
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}>
          <View style={styles.centeredView}>
            <View style={styles.modalView}>
              <Text style={styles.modalText}>
                Do you want to delete this account?
              </Text>
              <Button title="Delete" onPress={deleteAccount} />
              <Button title="Cancel" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </Modal>
      )}

      <TouchableOpacity
        style={{position: 'absolute', bottom: 90, right: 30}}
        onPress={() => navigation.navigate('Account')}>
        <Svg width="50px" height="50px" viewBox="0 0 24 24" fill="white">
          <Path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M13 9C13 8.44772 12.5523 8 12 8C11.4477 8 11 8.44772 11 9V11H9C8.44772 11 8 11.4477 8 12C8 12.5523 8.44772 13 9 13H11V15C11 15.5523 11.4477 16 12 16C12.5523 16 13 15.5523 13 15V13H15C15.5523 13 16 12.5523 16 12C16 11.4477 15.5523 11 15 11H13V9ZM7.25007 2.38782C8.54878 2.0992 10.1243 2 12 2C13.8757 2 15.4512 2.0992 16.7499 2.38782C18.06 2.67897 19.1488 3.176 19.9864 4.01358C20.824 4.85116 21.321 5.94002 21.6122 7.25007C21.9008 8.54878 22 10.1243 22 12C22 13.8757 21.9008 15.4512 21.6122 16.7499C21.321 18.06 20.824 19.1488 19.9864 19.9864C19.1488 20.824 18.06 21.321 16.7499 21.6122C15.4512 21.9008 13.8757 22 12 22C10.1243 22 8.54878 21.9008 7.25007 21.6122C5.94002 21.321 4.85116 20.824 4.01358 19.9864C3.176 19.1488 2.67897 18.06 2.38782 16.7499C2.0992 15.4512 2 13.8757 2 12C2 10.1243 2.0992 8.54878 2.38782 7.25007C2.67897 5.94002 3.176 4.85116 4.01358 4.01358C4.85116 3.176 5.94002 2.67897 7.25007 2.38782Z"
            fill="#0cb5e9fb"
          />
        </Svg>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d2027',
    position: 'relative',
  },
  card: {},
  cardText: {
    fontSize: 16,
    marginBottom: 5,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 18,
  },
});

export default AccountsPage;
