import {useQuery, useRealm} from '@realm/react';
import React, {useCallback, useState} from 'react';

import {styled} from 'nativewind';
import {
  Button,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
        <Text style={styles.cardText}>Name: {account.name}</Text>
        <Text style={styles.cardText}>Category: {account.type}</Text>
        <Text style={styles.cardText}>Number: {account.address}</Text>
        <Text style={styles.cardText}>Total: {account.amount}</Text>
      </TouchableOpacity>
    ),
    [handlePress, handleLongPress],
  );
  return (
    <View style={styles.container}>
      <Text>Accounts</Text>
      <StyledView className="px-2 py-1 bg-white rounded-lg shadow-lg">
        <StyledText className="text-black">All accounts</StyledText>
        <FlatList
          horizontal
          data={accounts}
          renderItem={renderAccount}
          keyExtractor={account => account._id.toString()}
          showsHorizontalScrollIndicator={false}
        />
      </StyledView>
      <Button
        title="Create Account"
        onPress={() => navigation.navigate('Account')}
      />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d2027',
  },
  card: {
    backgroundColor: '#000',
    borderRadius: 10,
    padding: 15,
    margin: 10,
    width: 200,
    shadowColor: '#fff',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
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
