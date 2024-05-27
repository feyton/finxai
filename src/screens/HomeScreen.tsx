import React, {useState} from 'react';
import {
  Button,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {useQuery, useRealm} from '@realm/react';
import {styled} from 'nativewind';
import SMSRetriever from '../Components/SMSRetriever';
import {Account} from '../tools/Schema';

const StyledText = styled(Text);

const StyledView = styled(View);

function HomeScreen({navigation}): React.JSX.Element {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const realm = useRealm();
  const accounts = useQuery(Account);
  const deleteAccount = () => {
    realm.write(() => {
      realm.delete(selectedAccount);
    });
    setModalVisible(false);
  };

  const handleLongPress = account => {
    setSelectedAccount(account);
    setModalVisible(true);
  };

  const handlePress = account => {
    navigation.navigate('AccountDetails', {accountId: account._id});
  };

  return (
    <View style={{backgroundColor: '#000'}}>
      <StyledView className="pt-1 bg-primary">
        <StyledText className="font-bold text-center text-white">
          Hello Fabrice
        </StyledText>
      </StyledView>
      <SMSRetriever />
      <StyledView className="px-2 py-1 bg-white rounded-lg shadow-lg">
        <StyledText className="text-black">All accounts</StyledText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {accounts.map(account => (
            <TouchableOpacity
              key={account._id.toHexString()}
              style={styles.card}
              onPress={() => handlePress(account)}
              onLongPress={() => handleLongPress(account)}>
              <Text style={styles.cardText}>Name: {account.name}</Text>
              <Text style={styles.cardText}>Category: {account.type}</Text>
              <Text style={styles.cardText}>Number: {account.address}</Text>
              <Text style={styles.cardText}>Total: {account.amount}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </StyledView>
      <Button
        title="Create Account"
        onPress={() => navigation.navigate('Account')}
      />

      {selectedAccount && (
        <Modal
          animationType="slide"
          transparent={true}
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
}

const styles = StyleSheet.create({
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

export default HomeScreen;
