/* eslint-disable react-native/no-inline-styles */
import {useQuery} from '@powersync/react-native';
import React from 'react';
import {Button, FlatList, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {COLORS, FONTS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';

const ScheduledPaymentsScreen = ({navigation}: any) => {
  const {userId} = useCurrentUser();
  const {data: scheduledPayments} = useQuery(
    'SELECT * FROM scheduled_payments WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );

  const renderScheduledPayment = ({item}: any) => (
    <View
      style={{
        padding: 10,
        borderColor: 'gray',
        borderWidth: 1,
        marginVertical: 10,
        borderRadius: 10,
      }}>
      <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
        Name: {item.name}
      </Text>
      <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
        Amount: {Number(item.amount).toLocaleString()} Rwf
      </Text>
      <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
        Frequency: {item.frequency}
      </Text>
      <Text style={{fontFamily: FONTS.regular, color: 'white'}}>
        Next Reminder: {item.next_reminder_date}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{padding: 20, backgroundColor: COLORS.bgPrimary, flex: 1}}>
      <Button
        title="Add Planned Payment"
        onPress={() => navigation.navigate('AddPlannedPayment')}
      />
      <FlatList
        data={scheduledPayments}
        renderItem={renderScheduledPayment}
        keyExtractor={item => item.id}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1d2027',
    paddingBottom: 20,
  },
});

export default ScheduledPaymentsScreen;
