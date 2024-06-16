/* eslint-disable react-native/no-inline-styles */

import {useQuery} from '@realm/react';
import React from 'react';
import {Button, FlatList, StyleSheet, Text, View} from 'react-native';
import {COLORS} from '../assets/images';
import {ScheduledPayment} from '../tools/Schema';
const ScheduledPaymentsScreen = ({navigation}) => {
  const scheduledPayments = useQuery(ScheduledPayment);

  const renderScheduledPayment = ({item}) => (
    <View style={{padding: 10}}>
      <Text>Name: {item.name}</Text>
      <Text>Amount: {item.amount}</Text>
      <Text>Frequency: {item.frequency}</Text>
      <Text>Next Reminder: {item.startDate.toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={{padding: 20, backgroundColor: COLORS.bgPrimary, flex: 1}}>
      <Button
        title="Add Planned Payment"
        onPress={() => navigation.navigate('AddPlannedPayment')}
      />
      <FlatList
        data={scheduledPayments}
        renderItem={renderScheduledPayment}
        keyExtractor={item => item.id.toString()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1d2027',
    paddingBottom: 20,
  },
  title: {
    color: 'white',
    fontSize: 20,
    marginBottom: 16,
    fontFamily: 'Poppins-Bold',
  },
  transactionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  sheetContent: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    color: 'white',
    fontSize: 18,
    marginBottom: 10,
    fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 50,
  },

  sms: {
    fontSize: 11,
    marginBottom: 16,
    color: 'white',
    fontFamily: 'Poppins-Light',
    textAlign: 'justify',
    borderRadius: 10,
    borderColor: 'gray',
    borderWidth: 1,
    padding: 5,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    padding: 8,
    color: 'white',
  },
  sheetHandle: {
    color: 'white',
    backgroundColor: 'white',
  },
  splitDetailContainer: {
    marginBottom: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#bdb7b7',
    borderRadius: 10,
    marginVertical: 8,
    fontFamily: 'Poppins-Regular',
    paddingHorizontal: 10,
  },

  picker: {
    color: '#ffffff',
    fontFamily: 'Poppins-Regular',
  },
});

export default ScheduledPaymentsScreen;
