/* eslint-disable react-native/no-inline-styles */
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useCallback, useState} from 'react';
import {
  Button,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {COLORS, FONTS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';

export default function BudgetScreen({navigation}: any) {
  const {userId} = useCurrentUser();
  const db = usePowerSync();
  const {data: budgets} = useQuery(
    'SELECT * FROM budgets WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<any>(null);

  const handleDeleteBudget = useCallback(async () => {
    if (!selectedBudget) {return;}
    await db.execute('DELETE FROM budget_items WHERE budget_id = ?', [
      selectedBudget.id,
    ]);
    await db.execute('DELETE FROM budgets WHERE id = ?', [selectedBudget.id]);
    setModalVisible(false);
    setSelectedBudget(null);
  }, [db, selectedBudget]);

  const handlePress = useCallback(
    (budget: any) => {
      navigation.navigate('BudgetDetails', {budgetId: budget.id});
    },
    [navigation],
  );

  const handleLongPress = useCallback((budget: any) => {
    setSelectedBudget(budget);
    setModalVisible(true);
  }, []);

  return (
    <SafeAreaView
      style={{flex: 1, backgroundColor: '#1d2027', padding: 16}}
      edges={['top']}>
      <Text style={{fontFamily: FONTS.bold, fontSize: 16, color: 'white'}}>
        Budget
      </Text>
      <Button
        onPress={() => navigation.navigate('CreateBudget')}
        title="Create Budget"
      />
      {budgets.map((budget: any) => (
        <TouchableOpacity
          onPress={() => handlePress(budget)}
          onLongPress={() => handleLongPress(budget)}
          key={budget.id}>
          <View
            style={{
              backgroundColor: COLORS.bgSecondary,
              margin: 10,
              padding: 16,
            }}>
            <Text style={{color: 'white', fontFamily: FONTS.bold}}>
              {budget.name}
            </Text>
            <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
              RWF: {Number(budget.amount || 0).toLocaleString()}
            </Text>
            <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
              Period: {budget.period}
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
                Do you want to delete this budget?
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    shadowOffset: {width: 0, height: 2},
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
