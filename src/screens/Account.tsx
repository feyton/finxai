import {useRealm} from '@realm/react';
import React, {useState} from 'react';
import {Button, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {BSON} from 'realm';
import {Account} from '../tools/Schema';
// Assuming your schema is in this file

const CreateAccountScreen = () => {
  const realm: any = useRealm();

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');

  const handleCreateAccount = () => {
    try {
      realm.write(() => {
        realm.create(Account, {
          _id: new BSON.ObjectId(),
          name,
          type,
          amount: parseFloat(amount),
          initial_amount: parseFloat(amount),
          category,
          auto,
          address,
        });
      });
      // Optional: Navigate to another screen or reset form fields
    } catch (err: any) {
      setError('Error creating account: ' + err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.errorText}>{error}</Text>

      <TextInput
        style={styles.input}
        placeholder="Account Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Account Type (e.g., Savings, Checking)"
        value={type}
        onChangeText={setType}
      />
      <TextInput
        style={styles.input}
        placeholder="Initial Amount"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <TextInput
        style={styles.input}
        placeholder="Category (e.g., Personal, Work)"
        value={category}
        onChangeText={setCategory}
      />
      <TextInput
        style={styles.input}
        placeholder="Address (e.g., M-Money, BKeBANK)"
        value={address}
        onChangeText={setAddress}
      />

      <View style={styles.switchContainer}>
        <Text>Automatic Tracking:</Text>
        <Switch value={auto} onValueChange={setAuto} />
      </View>

      <Button title="Create Account" onPress={handleCreateAccount} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {padding: 20, backgroundColor: '#001'},
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  errorText: {color: 'red', marginBottom: 10},
});

export default CreateAccountScreen;
