import {useRealm} from '@realm/react';
import React, {useState} from 'react';
import {Button, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import SelectDropdown from 'react-native-select-dropdown';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {BSON} from 'realm';
import {Account} from '../tools/Schema';
// Assuming your schema is in this file

/*

BK : BKeBank
MTN: M-Money 
*/

const CreateAccountScreen = ({navigation}) => {
  const realm: any = useRealm();

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');

  const accountTypes: any[] = [{title: 'General'}, {title: 'Cash'}];

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
      navigation.navigate('Home');
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
      <SelectDropdown
        data={accountTypes}
        onSelect={selectedItem => {
          setCategory(selectedItem.title);
        }}
        renderButton={(selectedItem, isOpened) => {
          return (
            <View style={styles.dropdownButtonStyle}>
              <Text style={styles.dropdownButtonTxtStyle}>
                {(selectedItem && selectedItem.title) || 'Select your mood'}
              </Text>
              <Icon
                name={isOpened ? 'chevron-up' : 'chevron-down'}
                style={styles.dropdownButtonArrowStyle}
              />
            </View>
          );
        }}
        renderItem={(item, index, isSelected) => {
          return (
            <View
              style={{
                ...styles.dropdownItemStyle,
                ...(isSelected && {backgroundColor: '#5182ad'}),
              }}>
              <Text style={styles.dropdownItemTxtStyle}>{item.title}</Text>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        dropdownStyle={styles.dropdownMenuStyle}
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
  dropdownButtonStyle: {
    width: 200,
    height: 50,
    backgroundColor: '#E9ECEF',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  dropdownButtonTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#151E26',
  },
  dropdownButtonArrowStyle: {
    fontSize: 28,
  },
  dropdownButtonIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
  dropdownMenuStyle: {
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
  },
  dropdownItemStyle: {
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dropdownItemTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#151E26',
  },
  dropdownItemIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
});

export default CreateAccountScreen;
