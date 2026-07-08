import {usePowerSync} from '@powersync/react-native';
import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T} from '../theme';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const PROVIDERS = [
  {
    id: 'mtn',
    name: 'MTN MoMo',
    kind: 'Auto-reads M-Money SMS',
    icon: 'Phone',
    tint: '#FFCC00',
    address: 'M-Money',
    type: 'Mobile Money',
    auto: true,
  },
  {
    id: 'airtel',
    name: 'Airtel Money',
    kind: 'Auto-reads Airtel SMS',
    icon: 'Phone',
    tint: '#E40000',
    address: 'Airtel-Money',
    type: 'Mobile Money',
    auto: true,
  },
  {
    id: 'bk',
    name: 'Bank of Kigali',
    kind: 'Reads BK SMS alerts',
    icon: 'Landmark',
    tint: '#1E73BE',
    address: 'BKeBANK',
    type: 'Bank',
    auto: true,
  },
  {
    id: 'equity',
    name: 'Equity Bank',
    kind: 'Reads Equity SMS alerts',
    icon: 'CreditCard',
    tint: '#E2231A',
    address: 'EQUITYBANK',
    type: 'Bank',
    auto: true,
  },
  {
    id: 'cash',
    name: 'Cash wallet',
    kind: 'Track spending manually',
    icon: 'Coins',
    tint: '#22C55E',
    address: '',
    type: 'Cash',
    auto: false,
  },
];

type Provider = (typeof PROVIDERS)[number];

export default function CreateAccount({navigation}: any) {
  const db = usePowerSync();
  const {userId} = useCurrentUser();

  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<Provider | null>(null);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const nameRef = useRef<TextInput>(null);
  const balanceRef = useRef<TextInput>(null);
  const numberRef = useRef<TextInput>(null);

  const handlePickProvider = (p: Provider) => {
    setPicked(p);
  };

  const handleContinue = () => {
    if (!picked) {return;}
    setName(picked.name);
    setBalance('');
    setNumber('');
    setError('');
    setStep(2);
  };

  const handleCreate = async () => {
    if (!picked) {return;}
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Account name is required');
      nameRef.current?.focus();
      return;
    }
    const openingBalance = parseFloat(balance.replace(/,/g, '')) || 0;
    setError('');
    setSaving(true);
    try {
      await db.execute(
        'INSERT INTO accounts (id, name, number, opening_balance, available_balance, auto, address, logo, provider_name, type, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          uuid(),
          trimmedName,
          number.trim(),
          openingBalance,
          openingBalance,
          picked.auto ? 1 : 0,
          picked.address,
          '',
          picked.name,
          picked.type,
          userId ?? '',
          new Date().toISOString(),
        ],
      );
      navigation.goBack();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => (step === 2 ? setStep(1) : navigation.goBack())}
            style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
            <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
          </Pressable>
          <View style={{flex: 1}}>
            <Text style={styles.headerTitle}>
              {step === 1 ? 'Add an account' : 'Account details'}
            </Text>
            <Text style={styles.headerSub}>
              {step === 1
                ? 'Connect once — AI reads the rest'
                : `Setting up ${picked?.name}`}
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>

          {step === 1 ? (
            <>
              {/* SMS info banner */}
              <View style={styles.infoBanner}>
                <View style={styles.infoIcon}>
                  <Icon name="MessageSquare" size={18} color={T.accent} strokeWidth={2} />
                </View>
                <Text style={styles.infoText}>
                  Grant SMS read access and FinXAI quietly turns your{' '}
                  <Text style={{color: T.text, fontFamily: FONTS.semibold}}>
                    MoMo & bank notifications
                  </Text>
                  {' '}into clean records. Nothing leaves your phone unencrypted.
                </Text>
              </View>

              {/* Provider cards */}
              <View style={styles.providerList}>
                {PROVIDERS.map(p => {
                  const isSelected = picked?.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => handlePickProvider(p)}
                      style={({pressed}) => [
                        styles.providerCard,
                        isSelected && styles.providerCardSelected,
                        {opacity: pressed ? 0.85 : 1},
                      ]}>
                      {/* Icon */}
                      <View
                        style={[
                          styles.providerIcon,
                          {backgroundColor: p.tint + '22'},
                        ]}>
                        <Icon
                          name={p.icon}
                          size={22}
                          color={p.tint}
                          strokeWidth={2}
                        />
                      </View>

                      {/* Label */}
                      <View style={{flex: 1}}>
                        <Text style={styles.providerName}>{p.name}</Text>
                        <Text style={styles.providerKind}>{p.kind}</Text>
                      </View>

                      {/* Radio indicator */}
                      <View
                        style={[
                          styles.radio,
                          isSelected && styles.radioSelected,
                        ]}>
                        {isSelected && (
                          <Icon
                            name="Check"
                            size={12}
                            color={T.accentInk}
                            strokeWidth={3}
                          />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              {/* Step 2 — Account details */}
              {error !== '' && (
                <View style={styles.errorBanner}>
                  <Icon name="AlertCircle" size={14} color={T.expense} strokeWidth={2} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.form}>
                {/* Account name */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Account name</Text>
                  <TextInput
                    ref={nameRef}
                    style={styles.fieldInput}
                    value={name}
                    onChangeText={setName}
                    placeholder={picked?.name ?? 'e.g. My MoMo'}
                    placeholderTextColor={T.text3}
                    returnKeyType="next"
                    onSubmitEditing={() => balanceRef.current?.focus()}
                  />
                </View>

                {/* Opening balance */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Opening balance (RWF)</Text>
                  <TextInput
                    ref={balanceRef}
                    style={styles.fieldInput}
                    value={balance}
                    onChangeText={setBalance}
                    placeholder="0"
                    placeholderTextColor={T.text3}
                    keyboardType="decimal-pad"
                    returnKeyType={picked?.type === 'Cash' ? 'done' : 'next'}
                    onSubmitEditing={() =>
                      picked?.type !== 'Cash'
                        ? numberRef.current?.focus()
                        : undefined
                    }
                  />
                  <Text style={styles.fieldHint}>
                    Enter current balance to start tracking from today
                  </Text>
                </View>

                {/* Account number — only for bank / mobile money */}
                {picked?.type !== 'Cash' && (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>
                      Account / phone number{' '}
                      <Text style={styles.optional}>(optional)</Text>
                    </Text>
                    <TextInput
                      ref={numberRef}
                      style={styles.fieldInput}
                      value={number}
                      onChangeText={setNumber}
                      placeholder={
                        picked?.type === 'Mobile Money'
                          ? '07XXXXXXXX'
                          : 'XXXXX-XXXXXXXX'
                      }
                      placeholderTextColor={T.text3}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                    />
                  </View>
                )}

                {/* Auto-tracking info */}
                {picked?.auto && (
                  <View style={styles.autoNote}>
                    <Icon
                      name="Sparkles"
                      size={14}
                      color={T.accent}
                      strokeWidth={2}
                    />
                    <Text style={styles.autoNoteText}>
                      AI will automatically read{' '}
                      <Text style={{color: T.text, fontFamily: FONTS.semibold}}>
                        {picked.address}
                      </Text>{' '}
                      SMS messages and create records for you.
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Bottom action */}
        <View style={styles.footer}>
          {step === 1 ? (
            <Pressable
              onPress={handleContinue}
              disabled={!picked}
              style={({pressed}) => [
                styles.primaryBtn,
                !picked && styles.primaryBtnDisabled,
                {opacity: pressed ? 0.85 : 1},
              ]}>
              <Icon
                name="Lock"
                size={16}
                color={picked ? T.accentInk : T.text3}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.primaryBtnText,
                  !picked && styles.primaryBtnTextDisabled,
                ]}>
                {picked ? `Continue with ${picked.name}` : 'Choose an account type'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleCreate}
              disabled={saving}
              style={({pressed}) => [
                styles.primaryBtn,
                {opacity: pressed || saving ? 0.8 : 1},
              ]}>
              {saving ? (
                <ActivityIndicator size="small" color={T.accentInk} />
              ) : (
                <Icon
                  name="Check"
                  size={16}
                  color={T.accentInk}
                  strokeWidth={2.5}
                />
              )}
              <Text style={styles.primaryBtnText}>
                {saving ? 'Creating…' : 'Create account'}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {fontFamily: FONTS.semibold, fontSize: 15, color: T.text},
  headerSub: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 1},
  scroll: {padding: 16, paddingBottom: 24},
  // Step 1
  infoBanner: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: T.accentSoft,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    padding: 14,
    marginBottom: 20,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text2,
    lineHeight: 19,
  },
  providerList: {gap: 10},
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: T.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
  },
  providerCardSelected: {
    borderColor: T.accent,
    backgroundColor: T.accentSoft,
  },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  providerName: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  providerKind: {fontFamily: FONTS.regular, fontSize: 12, color: T.text3, marginTop: 2},
  radio: {
    width: 22,
    height: 22,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: T.border2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: T.accent,
    backgroundColor: T.accent,
  },
  // Step 2
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(251,113,133,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.25)',
    borderRadius: R.small,
    padding: 11,
    marginBottom: 16,
  },
  errorText: {fontFamily: FONTS.medium, fontSize: 13, color: T.expense, flex: 1},
  form: {gap: 4},
  field: {marginBottom: 16},
  fieldLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: T.text2,
    marginBottom: 8,
  },
  optional: {fontFamily: FONTS.regular, color: T.text3},
  fieldInput: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border2,
    borderRadius: R.small,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: T.text,
  },
  fieldHint: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: T.text3,
    marginTop: 6,
  },
  autoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: T.accentSoft,
    borderRadius: R.small,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.18)',
    padding: 12,
    marginTop: 8,
  },
  autoNoteText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text2,
    lineHeight: 18,
  },
  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: T.accent,
    borderRadius: R.card,
    paddingVertical: 15,
  },
  primaryBtnDisabled: {
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  primaryBtnText: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: T.accentInk,
  },
  primaryBtnTextDisabled: {color: T.text3},
});
