import {useObject, useRealm, useUser} from '@realm/react';
import React, {useEffect} from 'react';
import {Text, View} from 'react-native';
import {TouchableOpacity} from 'react-native-gesture-handler';
import {BSON} from 'realm';
import {COLORS, FONTS} from '../assets/images';
import {Budget} from '../tools/Schema';

const BudgetDetails = ({route}: any) => {
  const {budgetId} = route.params;
  const realm = useRealm();
  const budget = useObject<Budget>(Budget, new BSON.ObjectID(budgetId));
  console.log(budget);

  const user = useUser();
  const handleShare = async () => {
    const userFound = await user.callFunction(
      'findUser',
      'tumbafabruce@gmail.com',
    );
    console.log(userFound);
  };

  useEffect(() => {
    realm.subscriptions.update(mutableSubs => {
      mutableSubs.add(realm.objects(Budget));
    });
  }, []);
  if (!budget) {
    return (
      <View>
        <Text>Budget not found</Text>
      </View>
    );
  }
  return (
    <View style={{backgroundColor: COLORS.bgPrimary, flex: 1, padding: 20}}>
      <Text>BudgetDetails</Text>
      <Text>{budget.name}</Text>
      {budget.items.map(item => (
        <View key={item?._id.toString()}>
          <Text>
            {item.category.name} - {item.subcategory?.name || 'No Subcategory'}:
            ${item.amount}
          </Text>
        </View>
      ))}

      <TouchableOpacity
        style={{fontFamily: FONTS.primary}}
        onPress={handleShare}>
        <Text>Share</Text>
      </TouchableOpacity>
    </View>
  );
};

export default BudgetDetails;
