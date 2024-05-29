import {Picker} from '@react-native-picker/picker';
import {useRealm} from '@realm/react';
import React, {useState} from 'react';
import {Button, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {BSON} from 'realm';
import IMAGES from '../assets/images';
import {Account} from '../tools/Schema';
// Assuming your schema is in this file

/*

BK : BKeBank
MTN: M-Money 
*/

const CreateAccountScreen = ({navigation}: any) => {
  const providers: any = [
    {name: 'Bank of Kigali', logo: IMAGES.BK, address: 'BKeBANK', id: 'bk'},
    {
      name: 'MTN Mobile Money',
      logo: IMAGES.MTN,
      address: 'M-Money',
      id: 'momo',
    },
    {
      name: 'Equity Bank',
      logo: IMAGES.MTN,
      address: 'EQUITYBANK',
      id: 'equity',
    },
    {name: 'Custom', logo: IMAGES.CUSTOM, address: '', id: 'custom'},
  ];
  const realm: any = useRealm();

  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<any>('');

  const handleCreateAccount = () => {
    if (!provider || !name || !number) {
      setError('All fields are required ');
      return;
    }
    const prov = providers.find((provi: {id: any}) => provi.id === provider);
    try {
      realm.write(() => {
        realm.create(Account, {
          _id: new BSON.ObjectId(),
          name,
          amount: parseFloat(amount),
          initial_amount: parseFloat(amount),
          auto,
          address: prov.address,
          number,
          providerName: prov.name,
        });
      });
      navigation.back();
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
        placeholder="Account Number"
        value={number}
        onChangeText={setNumber}
      />
      <TextInput
        style={styles.input}
        placeholder="Initial Amount"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={provider}
          onValueChange={itemValue => setProvider(itemValue)}
          style={styles.picker}>
          {providers.map((prov: {name: string; id: any}) => (
            <Picker.Item key={prov.id} label={prov.name} value={prov.id} />
          ))}
        </Picker>
      </View>

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
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    marginVertical: 8,
  },
  picker: {
    color: '#fff',
  },
});

export default CreateAccountScreen;
