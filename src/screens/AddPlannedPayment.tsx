/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/no-inline-styles */
import {Picker} from '@react-native-picker/picker';
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useState} from 'react';
import {Button, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DatePicker from 'react-native-date-picker';
import {ScrollView} from 'react-native-gesture-handler';
import FloatingLabelInputRegular from '../Components/FloatingInputRegular';
import {COLORS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const AddPlannedPaymentScreen = ({navigation}: any) => {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState('expense');
  const [frequency, setFrequency] = useState('monthly');
  const [date, setDate] = useState(new Date());
  const [open, setOpen] = useState(false);

  const addScheduledPayment = async () => {
    try {
      const now = new Date().toISOString();
      await db.execute(
        'INSERT INTO scheduled_payments (id, name, amount, account_id, payee, frequency, transaction_type, start_date, next_reminder_date, is_recurring, note, labels, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          generateUUID(),
          name,
          parseFloat(amount) || 0,
          accountId || null,
          payee,
          frequency,
          type,
          date.toISOString(),
          date.toISOString(),
          1,
          note,
          '[]',
          userId ?? '',
          now,
        ],
      );
      navigation.goBack();
    } catch (err: any) {
      console.error('Error adding scheduled payment:', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
      <View style={{padding: 20, backgroundColor: COLORS.bgPrimary, flex: 1}}>
        <FloatingLabelInputRegular
          value={name}
          onChangeText={setName}
          label="Name"
          name="name"
        />
        <FloatingLabelInputRegular
          value={amount}
          onChangeText={setAmount}
          label="Amount"
          name="amount"
        />
        <View style={styles.pickerContainer}>
          <Picker
            style={styles.picker}
            selectedValue={accountId}
            onValueChange={setAccountId}>
            <Picker.Item label={'Select account'} value={''} />
            {accounts.map((acc: any) => (
              <Picker.Item key={acc.id} label={acc.name} value={acc.id} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={type} onValueChange={setType}>
            <Picker.Item label={'Income'} value={'income'} />
            <Picker.Item label={'Expense'} value={'expense'} />
          </Picker>
        </View>
        <FloatingLabelInputRegular
          label="Payee"
          value={payee}
          onChangeText={setPayee}
          name="payee"
        />
        <Picker selectedValue={frequency} onValueChange={setFrequency}>
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
          onConfirm={d => {
            setOpen(false);
            setDate(d);
          }}
          onCancel={() => setOpen(false)}
        />
        <FloatingLabelInputRegular
          label="Note"
          value={note}
          onChangeText={setNote}
          name="note"
        />
        <Button title="Add Scheduled Payment" onPress={addScheduledPayment} />
      </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d2027',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#bdb7b7',
    borderRadius: 10,
    marginVertical: 8,
    paddingHorizontal: 10,
  },
  picker: {
    color: '#ffffff',
    fontFamily: 'Poppins-Regular',
  },
});

export default AddPlannedPaymentScreen;
