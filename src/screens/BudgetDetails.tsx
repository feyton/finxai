import {useQuery} from '@powersync/react-native';
import React from 'react';
import {Text, View} from 'react-native';
import {COLORS, FONTS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';

const BudgetDetails = ({route}: any) => {
  const {budgetId} = route.params;
  const {userId} = useCurrentUser();

  const {data: budgets} = useQuery(
    'SELECT * FROM budgets WHERE id = ? AND owner_id = ?',
    [budgetId, userId ?? ''],
  );
  const {data: items} = useQuery(
    'SELECT * FROM budget_items WHERE budget_id = ? AND owner_id = ?',
    [budgetId, userId ?? ''],
  );

  const budget = budgets?.[0];

  if (!budget) {
    return (
      <View style={{flex: 1, backgroundColor: COLORS.bgPrimary, padding: 20}}>
        <Text style={{color: 'white'}}>Budget not found</Text>
      </View>
    );
  }

  return (
    <View style={{backgroundColor: COLORS.bgPrimary, flex: 1, padding: 20}}>
      <Text style={{color: 'white', fontFamily: FONTS.bold, fontSize: 20}}>
        {budget.name}
      </Text>
      <Text style={{color: 'white', fontFamily: FONTS.regular}}>
        Period: {budget.period}
      </Text>
      <Text style={{color: 'white', fontFamily: FONTS.regular}}>
        Total: RWF {Number(budget.amount || 0).toLocaleString()}
      </Text>
      <Text
        style={{
          color: 'white',
          fontFamily: FONTS.bold,
          marginTop: 16,
          marginBottom: 8,
        }}>
        Budget Items
      </Text>
      {items.map((item: any) => (
        <View
          key={item.id}
          style={{
            backgroundColor: COLORS.bgSecondary,
            padding: 10,
            borderRadius: 8,
            marginBottom: 6,
          }}>
          <Text style={{color: 'white', fontFamily: FONTS.regular}}>
            {item.category}
            {item.subcategory ? ` — ${item.subcategory}` : ''}: RWF{' '}
            {Number(item.amount).toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
};

export default BudgetDetails;
