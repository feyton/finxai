import {useQuery} from '@realm/react';
import React from 'react';
import {Button, Text, View} from 'react-native';
import {Budget} from '../tools/Schema';

export default function BudgetScreen({navigation}) {
  const budgets = useQuery(Budget);
  return (
    <View>
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
