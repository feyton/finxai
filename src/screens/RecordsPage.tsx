/* eslint-disable react-native/no-inline-styles */
import BottomSheet, {BottomSheetView} from '@gorhom/bottom-sheet';
import {useQuery, usePowerSync} from '@powersync/react-native';
import {format} from 'date-fns/format';
import React, {useCallback, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {ScrollView} from 'react-native-gesture-handler';
import {Path, Svg} from 'react-native-svg';
import TransactionItem from '../Components/Transaction';
import {COLORS, FONTS} from '../assets/images';
import {useCurrentUser} from '../hooks/useCurrentUser';

const RecordsPage = ({navigation}: any) => {
  const {userId} = useCurrentUser();
  const db = usePowerSync();
  const {data: transactionsQuery} = useQuery(
    'SELECT t.*, a.name as account_name, a.logo as account_logo FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.owner_id = ? ORDER BY t.date_time DESC',
    [userId ?? ''],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = React.useMemo(() => ['25%', '50%', '90%'], []);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setSelectedTransaction(null);
    }
  }, []);

  const handleTransactionClick = (transaction: any) => {
    setSelectedTransaction(transaction);
    bottomSheetRef.current?.snapToIndex(1);
  };

  const deleteTransaction = useCallback(async () => {
    if (selectedTransaction) {
      await db.execute('DELETE FROM transactions WHERE id = ?', [
        selectedTransaction.id,
      ]);
      setSelectedTransaction(null);
      bottomSheetRef.current?.close();
    }
  }, [db, selectedTransaction]);

  const renderBottomSheetContent = () => {
    if (!selectedTransaction) {
      return null;
    }
    return (
      <KeyboardAvoidingView
        style={styles.sheetContent}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          <Text style={styles.sheetTitle}>Transaction Details</Text>
          <View style={styles.transactionDetails}>
            <Text style={styles.transactionText}>
              Date:{' '}
              {selectedTransaction.date_time
                ? format(
                    new Date(selectedTransaction.date_time),
                    'dd-MM-yy HH:mm',
                  )
                : ''}
            </Text>
            <Text style={styles.transactionText}>
              Amount: {selectedTransaction.amount}
            </Text>
            <Text style={styles.transactionText}>
              Category: {selectedTransaction.category}
            </Text>
            <Text style={styles.transactionText}>
              Note: {selectedTransaction.note}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={deleteTransaction}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  const groupTransactionsByDate = (transactions: any[]) => {
    const grouped: any = {};
    transactions.forEach((transaction: any) => {
      const date = new Date(transaction.date_time);
      const today = new Date();
      let dateLabel: string;
      if (date.toDateString() === today.toDateString()) {
        dateLabel = 'Today';
      } else if (
        date.toDateString() ===
        new Date(today.setDate(today.getDate() - 1)).toDateString()
      ) {
        dateLabel = 'Yesterday';
      } else {
        dateLabel = date.toDateString();
      }
      if (!grouped[dateLabel]) {
        grouped[dateLabel] = [];
      }
      grouped[dateLabel].push(transaction);
    });
    return grouped;
  };

  const filtered = searchQuery
    ? transactionsQuery.filter(
        (t: any) =>
          t.payee?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : transactionsQuery;

  const grouped = groupTransactionsByDate(filtered);
  const sections = Object.keys(grouped).map(date => ({
    title: date,
    data: grouped[date],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.headerView}>
        <TouchableOpacity
          style={styles.categoryButton}
          onPress={() => navigation.navigate('ManageCategories')}>
          <Text style={styles.catStyle}>Categories</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            backgroundColor: COLORS.buttonPrimary,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 5,
            alignItems: 'center',
            marginHorizontal: 10,
          }}
          onPress={() => navigation.navigate('Confirm')}>
          <Text style={{color: 'white', fontFamily: FONTS.bold}}>Confirm</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchView}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transaction"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={sections}
        keyExtractor={item => item.title}
        renderItem={({item: section}) => (
          <View key={section.title} style={styles.sectionView}>
            <Text style={styles.dateHeader}>{section.title}</Text>
            <FlatList
              data={section.data}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <TouchableOpacity onPress={() => handleTransactionClick(item)}>
                  <TransactionItem transaction={item} />
                </TouchableOpacity>
              )}
              ListHeaderComponentStyle={styles.listHeader}
            />
          </View>
        )}
      />
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        enablePanDownToClose={true}
        backgroundStyle={styles.sheetContent}
        handleIndicatorStyle={styles.sheetHandle}>
        <BottomSheetView>{renderBottomSheetContent()}</BottomSheetView>
      </BottomSheet>

      <TouchableOpacity
        style={{position: 'absolute', bottom: 90, right: 30}}
        onPress={() => navigation.navigate('CreateRecord')}>
        <Svg width="50px" height="50px" viewBox="0 0 24 24" fill="white">
          <Path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M13 9C13 8.44772 12.5523 8 12 8C11.4477 8 11 8.44772 11 9V11H9C8.44772 11 8 11.4477 8 12C8 12.5523 8.44772 13 9 13H11V15C11 15.5523 11.4477 16 12 16C12.5523 16 13 15.5523 13 15V13H15C15.5523 13 16 12.5523 16 12C16 11.4477 15.5523 11 15 11H13V9ZM7.25007 2.38782C8.54878 2.0992 10.1243 2 12 2C13.8757 2 15.4512 2.0992 16.7499 2.38782C18.06 2.67897 19.1488 3.176 19.9864 4.01358C20.824 4.85116 21.321 5.94002 21.6122 7.25007C21.9008 8.54878 22 10.1243 22 12C22 13.8757 21.9008 15.4512 21.6122 16.7499C21.321 18.06 20.824 19.1488 19.9864 19.9864C19.1488 20.824 18.06 21.321 16.7499 21.6122C15.4512 21.9008 13.8757 22 12 22C10.1243 22 8.54878 21.9008 7.25007 21.6122C5.94002 21.321 4.85116 20.824 4.01358 19.9864C3.176 19.1488 2.67897 18.06 2.38782 16.7499C2.0992 15.4512 2 13.8757 2 12C2 10.1243 2.0992 8.54878 2.38782 7.25007C2.67897 5.94002 3.176 4.85116 4.01358 4.01358C4.85116 3.176 5.94002 2.67897 7.25007 2.38782Z"
            fill="#0ce97bfa"
          />
        </Svg>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d2027',
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 60,
  },
  catStyle: {fontFamily: 'Poppins-Bold', color: 'white'},
  headerView: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  categoryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  searchView: {marginBottom: 5},
  searchInput: {
    backgroundColor: '#2e2e2e',
    color: 'white',
    padding: 10,
    borderRadius: 8,
  },
  sectionView: {marginBottom: 16},
  listHeader: {paddingBottom: 8},
  dateHeader: {
    fontSize: 14,
    marginBottom: 4,
    fontFamily: 'Poppins-Bold',
    color: 'white',
  },
  transactionDetails: {marginLeft: 16},
  transactionText: {
    color: 'white',
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  sheetContent: {
    backgroundColor: '#1d2027',
    paddingHorizontal: 16,
  },
  sheetTitle: {
    color: 'white',
    fontSize: 18,
    marginBottom: 10,
    fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  scrollViewContent: {flexGrow: 1},
  sheetHandle: {color: 'white', backgroundColor: 'white'},
  deleteButton: {
    padding: 5,
    backgroundColor: '#678',
    width: 100,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginHorizontal: 10,
    marginTop: 10,
  },
  deleteButtonText: {textAlign: 'center', fontFamily: 'Poppins-Bold'},
});

export default RecordsPage;
