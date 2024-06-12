import {useQuery, useRealm} from '@realm/react';
import React, {useCallback, useState} from 'react';
import {
  Button,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {COLORS, FONTS} from '../assets/images';
import {Budget} from '../tools/Schema';

export default function BudgetScreen({navigation}: any) {
  const budgets = useQuery(Budget);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const realm = useRealm();

  const handleDeleteBudget = useCallback(() => {
    realm.write(() => {
      realm.delete(selectedBudget);
      setModalVisible(false);
    });
  }, [realm, selectedBudget]);

  const handlePress = useCallback((budget: any) => {
    setSelectedBudget(budget);
    setModalVisible(true);
  }, []);
  return (
    <View style={{flex: 1, backgroundColor: '#1d2027', padding: 16}}>
      <Text style={{fontFamily: FONTS.bold, fontSize: 16}}>Budget</Text>
      <Button
        onPress={() => navigation.navigate('CreateBudget')}
        title="Create Budget"
      />
      {budgets.map((budget, index) => (
        <TouchableOpacity onLongPress={() => handlePress(budget)}>
          <View
            key={index}
            style={{
              backgroundColor: COLORS.bgSecondary,
              margin: 10,
              padding: 16,
            }}>
            <Text>{budget.name}</Text>
            <Text style={{fontFamily: FONTS.regular}}>
              {budget.getTotalAmount()}
            </Text>
            <Text style={{fontFamily: FONTS.regular}}>
              {budget.getCurrentSpending()}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      {selectedBudget && (
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
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#1E90FF',
                    padding: 12,
                    borderRadius: 10,
                    alignItems: 'center',
                    marginVertical: 8,
                    marginHorizontal: 10,
                  }}
                  onPress={() => setModalVisible(false)}>
                  <Text style={{fontFamily: 'Poppins-Regular', color: 'white'}}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#7c1616',
                    padding: 12,
                    borderRadius: 10,
                    alignItems: 'center',
                    marginVertical: 8,
                    marginHorizontal: 10,
                  }}
                  onPress={handleDeleteBudget}>
                  <Text style={{fontFamily: 'Poppins-Regular', color: 'white'}}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

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
    backgroundColor: '#2e2e2e',
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
    fontSize: 14,
    color: 'white',
    fontFamily: 'Poppins-Regular',
  },
});
