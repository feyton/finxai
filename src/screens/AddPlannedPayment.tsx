/* eslint-disable react-native/no-inline-styles */

import {Picker} from '@react-native-picker/picker';
import {useQuery, useRealm} from '@realm/react';
import React, {useState} from 'react';
import {Button, StyleSheet, View} from 'react-native';
import DatePicker from 'react-native-date-picker';
import {ScrollView} from 'react-native-gesture-handler';
import {BSON} from 'realm';
import FloatingLabelInputRegular from '../Components/FloatingInputRegular';
import {COLORS} from '../assets/images';
import {Account} from '../tools/Schema';
const AddPlannedPaymentScreen = ({navigation}) => {
  const realm = useRealm();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [account, setAccount] = useState();
  const [note, setNote] = useState('');
  const [type, setType] = useState('expense');
  const [frequency, setFrequency] = useState('monthly');
  const [date, setDate] = useState(new Date());
  const [open, setOpen] = useState(false);
  const accounts = useQuery(Account);

  const addScheduledPayment = () => {
    if (account !== '') {
      const accountToAdd: any = realm.objectForPrimaryKey(
        'Account',
        new BSON.ObjectID(account),
      );
      setAccount(accountToAdd);
    }
    console.log(note, frequency);

    realm.write(() => {
      realm.create('ScheduledPayment', {
        name,
        amount: parseFloat(amount),
        frequency: frequency,
        startDate: new Date(date),
        nextReminderDate: new Date(date),
        payee: payee,
        note: note,
        account: account,
        _id: new BSON.ObjectID(),
        transaction_type: type,
      });
    });
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={{padding: 20, backgroundColor: COLORS.bgPrimary, flex: 1}}>
        <FloatingLabelInputRegular
          value={name}
          onChangeText={value => setName(value)}
          label="Name"
          name="name"
        />
        <FloatingLabelInputRegular
          value={amount}
          onChangeText={value => setAmount(value)}
          label="Amount"
          name="amount"
        />
        <View style={styles.pickerContainer}>
          <Picker
            style={styles.picker}
            selectedValue={account}
            onValueChange={value => setAccount(value)}>
            <Picker.Item label={'Select account'} value={''} />
            {accounts.map((account: any) => (
              <Picker.Item
                key={account._id.toString()}
                label={account.name}
                value={account._id.toString()}
              />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={type} onValueChange={value => setType(value)}>
            <Picker.Item label={'Income'} value={'income'} />
            <Picker.Item label={'Expense'} value={'expense'} />
          </Picker>
        </View>
        <FloatingLabelInputRegular
          label="Payee"
          value={payee}
          onChangeText={value => setPayee(value)}
          name="payee"
        />
        <Picker
          selectedValue={frequency}
          onValueChange={value => setFrequency(value)}>
          <Picker.Item label="Daily" value="daily" />
          <Picker.Item label="Weekly" value="weekly" />
          <Picker.Item label="Monthly" value="monthly" />
          <Picker.Item label="Yearly" value="yearly" />
        </Picker>
        <Button title="Select date" onPress={() => setOpen(true)} />
        <DatePicker
          modal
          mode="date"
          open={open}
          date={date}
          onConfirm={date => {
            setOpen(false);
            setDate(date);
          }}
          onCancel={() => {
            setOpen(false);
          }}
        />
        <FloatingLabelInputRegular
          label="Note"
          value={note}
          onChangeText={value => setNote(value)}
          name="note"
        />
        <Button title="Add Scheduled Payment" onPress={addScheduledPayment} />
      </View>
    </ScrollView>
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

export default AddPlannedPaymentScreen;
