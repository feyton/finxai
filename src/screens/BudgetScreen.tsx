import {useQuery} from '@realm/react';
import React from 'react';
import {Button, Text, View} from 'react-native';
import {Budget} from '../tools/Schema';

export default function BudgetScreen({navigation}: any) {
  const budgets = useQuery(Budget);
  return (
    <View style={{flex: 1, backgroundColor: '#1d2027'}}>
      <Text>Budget</Text>
      <Button
        onPress={() => navigation.navigate('CreateBudget')}
        title="Create Budget"
      />
      {budgets.map((budget, index) => (
        <View key={index}>
          <Text>{budget.name}</Text>
        </View>
      ))}
    </View>
  );
}
