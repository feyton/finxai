/* eslint-disable react-native/no-inline-styles */
import {Picker} from '@react-native-picker/picker';
import {usePowerSync} from '@powersync/react-native';
import React, {useState} from 'react';
import {useForm} from 'react-hook-form';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import FloatingLabelInput from '../Components/FloatingInput';
import {COLORS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface CreateAccountScreenProps {
  navigation: any;
}

const providers = [
  {
    name: 'Bank of Kigali',
    logo: 'https://res.cloudinary.com/feyton/image/upload/v1717159585/bank_of_kigali_n0mezg.webp',
    address: 'BKeBANK',
    id: 'bk',
  },
  {
    name: 'MTN Mobile Money',
    logo: 'https://res.cloudinary.com/feyton/image/upload/v1717159585/mtn_momo_l1nzpn.png',
    address: 'M-Money',
    id: 'momo',
  },
  {
    name: 'Equity Bank',
    logo: 'https://res.cloudinary.com/feyton/image/upload/v1718221618/images_vkxrs9.png',
    address: 'EQUITYBANK',
    id: 'equity',
  },
  {
    name: 'Custom',
    logo: 'https://res.cloudinary.com/feyton/image/upload/v1717159585/custom_pncud4.png',
    address: '',
    id: 'custom',
  },
];

const CreateAccountScreen: React.FC<CreateAccountScreenProps> = ({
  navigation,
}) => {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState('');
  const {control, handleSubmit} = useForm();
  const [provider, setProvider] = useState<string>('');

  const handleCreateAccount = async (data: any) => {
    if (!provider) {
      setError('Provider is required');
      return;
    }
    const prov = providers.find(p => p.id === provider);
    if (!prov) {return;}
    try {
      const openingBalance = parseFloat(data.opening_balance) || 0;
      await db.execute(
        'INSERT INTO accounts (id, name, number, opening_balance, available_balance, auto, address, logo, provider_name, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          generateUUID(),
          data.name,
          data.number,
          openingBalance,
          openingBalance,
          auto ? 1 : 0,
          prov.address,
          prov.logo,
          prov.name,
          userId ?? '',
          new Date().toISOString(),
        ],
      );
      navigation.goBack();
    } catch (err: any) {
      setError('Error creating account: ' + err.message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text
          style={{
            textAlign: 'center',
            fontFamily: 'Poppins-Bold',
            color: 'white',
            fontSize: 16,
          }}>
          Create Account
        </Text>

        <Text style={styles.errorText}>{error}</Text>

        <FloatingLabelInput
          control={control}
          name="name"
          label="Account Name"
          rules={{required: 'Account Name is required'}}
        />
        <FloatingLabelInput
          control={control}
          name="number"
          label="Account Number"
          rules={{required: 'Account Number is required'}}
        />
        <FloatingLabelInput
          control={control}
          name="opening_balance"
          label="Opening Balance"
          rules={{required: 'Initial Amount is required'}}
        />

        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={provider}
            onValueChange={itemValue => setProvider(itemValue)}
            style={styles.picker}>
            <Picker.Item label="Select Provider" value={''} />
            {providers.map(prov => (
              <Picker.Item
                key={prov.id}
                style={{
                  fontFamily: 'Poppins-Regular',
                  fontSize: 14,
                  paddingHorizontal: 15,
                }}
                label={prov.name}
                value={prov.id}
              />
            ))}
          </Picker>
        </View>

        <View style={styles.switchContainer}>
          <Text style={styles.switchText}>Automatic Tracking:</Text>
          <Switch value={auto} onValueChange={setAuto} />
        </View>
        <TouchableOpacity
          style={{
            backgroundColor: '#1E90FF',
            padding: 12,
            borderRadius: 10,
            alignItems: 'center',
            marginVertical: 8,
          }}
          onPress={handleSubmit(handleCreateAccount)}>
          <Text style={{fontFamily: 'Poppins-Regular', color: 'white'}}>
            Create Account
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    paddingBottom: 50,
  },
  errorText: {color: 'red', marginBottom: 10},
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    marginVertical: 8,
    fontFamily: 'Poppins-Regular',
    paddingHorizontal: 10,
  },
  picker: {color: '#a19e9e', fontFamily: 'Poppins-Regular'},
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginHorizontal: 10,
    marginTop: 10,
  },
  switchText: {
    color: 'white',
    marginRight: 10,
    fontFamily: 'Poppins-Regular',
  },
});

export default CreateAccountScreen;
