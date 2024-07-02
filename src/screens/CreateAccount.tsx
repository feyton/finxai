/* eslint-disable react-native/no-inline-styles */
import {Picker} from '@react-native-picker/picker';
import {useRealm, useUser} from '@realm/react';
import React, {useEffect, useState} from 'react';
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
// import {ScrollView} from 'react-native-gesture-handler';
import FloatingLabelInput from '../Components/FloatingInput';
import {COLORS} from '../assets/images';
import {Account} from '../tools/Schema';

interface CreateAccountScreenProps {
  navigation: any;
}

const CreateAccountScreen: React.FC<CreateAccountScreenProps> = ({
  navigation,
}) => {
  const providers = [
    {
      name: 'Bank of Kigali',
      logo: 'https://res.cloudinary.com/feyton/image/upload/v1717159585/bank_of_kigali_n0mezg.webp',
      address: 'BKeBANK',
      _id: 'bk',
    },
    {
      name: 'MTN Mobile Money',
      logo: 'https://res.cloudinary.com/feyton/image/upload/v1717159585/mtn_momo_l1nzpn.png',
      address: 'M-Money',
      _id: 'momo',
    },
    {
      name: 'Equity Bank',
      logo: 'https://res.cloudinary.com/feyton/image/upload/v1718221618/images_vkxrs9.png',
      address: 'EQUITYBANK',
      _id: 'equity',
    },
    {
      name: 'Custom',
      logo: 'https://res.cloudinary.com/feyton/image/upload/v1717159585/custom_pncud4.png',
      address: '',
      _id: 'custom',
    },
  ];

  const realm = useRealm();
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState('');
  const {control, handleSubmit} = useForm();
  const [provider, setProvider] = useState<string>('');

  useEffect(() => {
    realm.subscriptions.update(mutableSubs => {
      mutableSubs.add(realm.objects(Account));
    });
  }, []);
  const user = useUser();

  const handleCreateAccount = (data: any) => {
    if (!provider) {
      setError('Provider is required');
      return;
    }
    const prov: any = providers.find(provi => provi._id === provider);
    try {
      realm.write(() => {
        realm.create(Account, {
          ...data,
          opening_balance: parseFloat(data.opening_balance),
          auto,
          address: prov.address,
          providerName: prov.name,
          logo: prov.logo,
          owner_id: user.id,
        });
      });
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
                key={prov._id}
                style={{
                  fontFamily: 'Poppins-Regular',
                  fontSize: 14,
                  paddingHorizontal: 15,
                }}
                label={prov.name}
                value={prov._id}
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
  errorText: {
    color: 'red',
    marginBottom: 10,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    marginVertical: 8,
    fontFamily: 'Poppins-Regular',
    paddingHorizontal: 10,
  },
  picker: {
    color: '#a19e9e',
    fontFamily: 'Poppins-Regular',
  },
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
