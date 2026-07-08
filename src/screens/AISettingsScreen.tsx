import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import {FONTS, R, T} from '../theme';
import {Icon} from '../Components/ui';
import {
  clearAnthropicKey,
  clearGeminiKey,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_MODEL,
  getAnthropicKey,
  getAnthropicModel,
  getGeminiKey,
  getGeminiModel,
  setAnthropicKey,
  setAnthropicModel,
  setGeminiKey,
  setGeminiModel,
  validateGeminiKey,
} from '../tools/aiConfig';
import {validateAnthropicKey} from '../tools/anthropicClient';

type TestState = 'idle' | 'testing' | 'ok' | 'error';

function Row({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

function SectionTitle({children}: {children: string}) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export default function AISettingsScreen({navigation}: any) {
  // ── Gemini state ────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ── Anthropic state ─────────────────────────────────────────────
  const [anthKey, setAnthKey] = useState('');
  const [anthModel, setAnthModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [anthShowKey, setAnthShowKey] = useState(false);
  const [anthTestState, setAnthTestState] = useState<TestState>('idle');
  const [anthTestMsg, setAnthTestMsg] = useState('');
  const [anthSaving, setAnthSaving] = useState(false);
  const [anthHasKey, setAnthHasKey] = useState(false);

  useEffect(() => {
    (async () => {
      const k = await getGeminiKey();
      const m = await getGeminiModel();
      if (k) {
        setApiKey(k);
        setHasKey(true);
      }
      setModel(m);

      const ak = await getAnthropicKey();
      const am = await getAnthropicModel();
      if (ak) {
        setAnthKey(ak);
        setAnthHasKey(true);
      }
      setAnthModel(am);
    })();
  }, []);

  const handleTest = async () => {
    if (!apiKey.trim() || apiKey.trim().length < 10) {
      setTestState('error');
      setTestMsg('Enter a valid API key first');
      return;
    }
    Keyboard.dismiss();
    setTestState('testing');
    setTestMsg('');
    const result = await validateGeminiKey(apiKey.trim(), model.trim() || DEFAULT_MODEL);
    if (result.ok) {
      setTestState('ok');
      setTestMsg('Connected successfully');
    } else {
      setTestState('error');
      setTestMsg(result.error ?? 'Validation failed');
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {return;}
    setSaving(true);
    Keyboard.dismiss();
    await setGeminiKey(apiKey.trim());
    await setGeminiModel(model.trim() || DEFAULT_MODEL);
    setHasKey(true);
    setSaving(false);
    setTestState('idle');
    setTestMsg('');
  };

  const handleClear = async () => {
    await clearGeminiKey();
    await AsyncStorage.removeItem('finxai:gemini_model');
    setApiKey('');
    setModel(DEFAULT_MODEL);
    setHasKey(false);
    setTestState('idle');
    setTestMsg('');
  };

  // ── Anthropic handlers ──────────────────────────────────────────
  const handleAnthTest = async () => {
    if (!anthKey.trim() || anthKey.trim().length < 10) {
      setAnthTestState('error');
      setAnthTestMsg('Enter a valid API key first');
      return;
    }
    Keyboard.dismiss();
    setAnthTestState('testing');
    setAnthTestMsg('');
    const result = await validateAnthropicKey(anthKey.trim());
    if (result.ok) {
      setAnthTestState('ok');
      setAnthTestMsg('Connected successfully');
    } else {
      setAnthTestState('error');
      setAnthTestMsg(result.error ?? 'Validation failed');
    }
  };

  const handleAnthSave = async () => {
    if (!anthKey.trim()) {return;}
    setAnthSaving(true);
    Keyboard.dismiss();
    await setAnthropicKey(anthKey.trim());
    await setAnthropicModel(anthModel.trim() || DEFAULT_ANTHROPIC_MODEL);
    setAnthHasKey(true);
    setAnthSaving(false);
    setAnthTestState('idle');
    setAnthTestMsg('');
  };

  const handleAnthClear = async () => {
    await clearAnthropicKey();
    setAnthKey('');
    setAnthModel(DEFAULT_ANTHROPIC_MODEL);
    setAnthHasKey(false);
    setAnthTestState('idle');
    setAnthTestMsg('');
  };

  const testColor =
    testState === 'ok'
      ? T.income
      : testState === 'error'
      ? T.expense
      : T.text3;

  const anthTestColor =
    anthTestState === 'ok'
      ? T.income
      : anthTestState === 'error'
      ? T.expense
      : T.text3;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
            <Icon name="ArrowLeft" size={20} color={T.text} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.headerTitle}>AI Settings</Text>
          <View style={{width: 38}} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>

          {/* Status chip */}
          <View style={[styles.statusChip, hasKey ? styles.statusActive : styles.statusInactive]}>
            <Icon
              name={hasKey ? 'CheckCircle' : 'AlertCircle'}
              size={15}
              color={hasKey ? T.income : T.warn}
              strokeWidth={2.2}
            />
            <Text style={[styles.statusText, {color: hasKey ? T.income : T.warn}]}>
              {hasKey ? 'Gemini AI is active — parsing your SMS' : 'No API key — using regex fallback'}
            </Text>
          </View>

          {/* API key section */}
          <SectionTitle>Gemini API Key</SectionTitle>
          <View style={styles.card}>
            <View style={styles.inputWrap}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={apiKey}
                onChangeText={t => {
                  setApiKey(t);
                  setTestState('idle');
                  setTestMsg('');
                }}
                placeholder="AIza..."
                placeholderTextColor={T.text3}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <Pressable
                onPress={() => setShowKey(v => !v)}
                style={styles.eyeBtn}>
                <Icon
                  name={showKey ? 'EyeOff' : 'Eye'}
                  size={17}
                  color={T.text3}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {/* Test result */}
            {testMsg !== '' && (
              <View style={styles.testResult}>
                <Icon
                  name={testState === 'ok' ? 'CheckCircle' : 'XCircle'}
                  size={14}
                  color={testColor}
                  strokeWidth={2.2}
                />
                <Text style={[styles.testMsg, {color: testColor}]}>
                  {testMsg}
                </Text>
              </View>
            )}

            {/* Test + Save buttons */}
            <View style={styles.btnRow}>
              <Pressable
                onPress={handleTest}
                disabled={testState === 'testing'}
                style={({pressed}) => [
                  styles.btnTest,
                  {opacity: pressed || testState === 'testing' ? 0.7 : 1},
                ]}>
                {testState === 'testing' ? (
                  <ActivityIndicator size="small" color={T.text2} />
                ) : (
                  <Text style={styles.btnTestText}>Test key</Text>
                )}
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving || !apiKey.trim()}
                style={({pressed}) => [
                  styles.btnSave,
                  {opacity: pressed || saving || !apiKey.trim() ? 0.6 : 1},
                ]}>
                {saving ? (
                  <ActivityIndicator size="small" color={T.accentInk} />
                ) : (
                  <Text style={styles.btnSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Model section */}
          <SectionTitle>Model</SectionTitle>
          <View style={styles.card}>
            <Row
              label="Active model"
              value={
                <TextInput
                  style={[styles.input, styles.modelInput]}
                  value={model}
                  onChangeText={setModel}
                  placeholder={DEFAULT_MODEL}
                  placeholderTextColor={T.text3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              }
            />
            <Text style={styles.hint}>
              Default: {DEFAULT_MODEL}. Change only if you have access to a newer model.
            </Text>
          </View>

          {/* Privacy note */}
          <SectionTitle>Privacy</SectionTitle>
          <View style={styles.card}>
            <View style={styles.privacyRow}>
              <Icon name="Lock" size={16} color={T.text3} strokeWidth={2} />
              <Text style={styles.privacyText}>
                Your API key is stored only on this device using encrypted
                AsyncStorage — it is never sent to FinXAI servers.
              </Text>
            </View>
            <View style={[styles.privacyRow, {marginTop: 8}]}>
              <Icon name="Sparkles" size={16} color={T.text3} strokeWidth={2} />
              <Text style={styles.privacyText}>
                SMS text is sent directly from your device to Google's Gemini
                API. No SMS content passes through FinXAI.
              </Text>
            </View>
          </View>

          {/* How it works */}
          <SectionTitle>How It Works</SectionTitle>
          <View style={styles.card}>
            {[
              {icon: 'Sparkles', text: 'Gemini reads each SMS and extracts amount, merchant, category, and fees'},
              {icon: 'Brain', text: 'High-confidence results (≥92%) are saved automatically'},
              {icon: 'CheckCircle', text: 'Lower-confidence ones appear in SMS Review for a quick confirm or fix'},
              {icon: 'TrendingUp', text: 'Every fix you make trains the AI — it learns your spending patterns over time'},
            ].map((item, i) => (
              <View key={i} style={[styles.howRow, i > 0 && {marginTop: 10}]}>
                <View style={styles.howIcon}>
                  <Icon name={item.icon} size={14} color={T.accent} strokeWidth={2.2} />
                </View>
                <Text style={styles.howText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* Get key link hint */}
          <View style={styles.getKeyBox}>
            <Icon name="ExternalLink" size={14} color={T.text3} strokeWidth={2} />
            <Text style={styles.getKeyText}>
              Get a free API key at{' '}
              <Text style={{color: T.accent}}>aistudio.google.com</Text>
              {' '}→ Get API key
            </Text>
          </View>

          {/* Clear key */}
          {hasKey && (
            <Pressable
              onPress={handleClear}
              style={({pressed}) => [
                styles.clearBtn,
                {opacity: pressed ? 0.7 : 1},
              ]}>
              <Icon name="Trash2" size={15} color={T.expense} strokeWidth={2.2} />
              <Text style={styles.clearText}>Remove Gemini key</Text>
            </Pressable>
          )}

          {/* ── Divider ─────────────────────────────────────────── */}
          <View style={styles.divider} />

          {/* ── Finance Coach (Claude) section ──────────────────── */}
          <View style={[styles.statusChip, anthHasKey ? styles.statusActive : styles.statusInactive]}>
            <Icon
              name={anthHasKey ? 'CheckCircle' : 'AlertCircle'}
              size={15}
              color={anthHasKey ? T.income : T.warn}
              strokeWidth={2.2}
            />
            <Text style={[styles.statusText, {color: anthHasKey ? T.income : T.warn}]}>
              {anthHasKey ? 'Finance Coach is active — ready to chat' : 'No key — Finance Coach unavailable'}
            </Text>
          </View>

          <SectionTitle>Finance Coach (Claude) API Key</SectionTitle>
          <View style={styles.card}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={anthKey}
                onChangeText={t => {
                  setAnthKey(t);
                  setAnthTestState('idle');
                  setAnthTestMsg('');
                }}
                placeholder="sk-ant-..."
                placeholderTextColor={T.text3}
                secureTextEntry={!anthShowKey}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <Pressable onPress={() => setAnthShowKey(v => !v)} style={styles.eyeBtn}>
                <Icon
                  name={anthShowKey ? 'EyeOff' : 'Eye'}
                  size={17}
                  color={T.text3}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {anthTestMsg !== '' && (
              <View style={styles.testResult}>
                <Icon
                  name={anthTestState === 'ok' ? 'CheckCircle' : 'XCircle'}
                  size={14}
                  color={anthTestColor}
                  strokeWidth={2.2}
                />
                <Text style={[styles.testMsg, {color: anthTestColor}]}>{anthTestMsg}</Text>
              </View>
            )}

            <View style={styles.btnRow}>
              <Pressable
                onPress={handleAnthTest}
                disabled={anthTestState === 'testing'}
                style={({pressed}) => [
                  styles.btnTest,
                  {opacity: pressed || anthTestState === 'testing' ? 0.7 : 1},
                ]}>
                {anthTestState === 'testing' ? (
                  <ActivityIndicator size="small" color={T.text2} />
                ) : (
                  <Text style={styles.btnTestText}>Test key</Text>
                )}
              </Pressable>
              <Pressable
                onPress={handleAnthSave}
                disabled={anthSaving || !anthKey.trim()}
                style={({pressed}) => [
                  styles.btnSave,
                  {opacity: pressed || anthSaving || !anthKey.trim() ? 0.6 : 1},
                ]}>
                {anthSaving ? (
                  <ActivityIndicator size="small" color={T.accentInk} />
                ) : (
                  <Text style={styles.btnSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>

          <SectionTitle>Model</SectionTitle>
          <View style={styles.card}>
            <Row
              label="Active model"
              value={
                <TextInput
                  style={[styles.input, styles.modelInput]}
                  value={anthModel}
                  onChangeText={setAnthModel}
                  placeholder={DEFAULT_ANTHROPIC_MODEL}
                  placeholderTextColor={T.text3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              }
            />
            <Text style={styles.hint}>
              Default: {DEFAULT_ANTHROPIC_MODEL}. Change only if you have access to a different Claude model.
            </Text>
          </View>

          <View style={styles.getKeyBox}>
            <Icon name="ExternalLink" size={14} color={T.text3} strokeWidth={2} />
            <Text style={styles.getKeyText}>
              Get an API key at{' '}
              <Text style={{color: T.accent}}>console.anthropic.com</Text>
              {' '}→ API Keys
            </Text>
          </View>

          {anthHasKey && (
            <Pressable
              onPress={handleAnthClear}
              style={({pressed}) => [styles.clearBtn, {opacity: pressed ? 0.7 : 1}]}>
              <Icon name="Trash2" size={15} color={T.expense} strokeWidth={2.2} />
              <Text style={styles.clearText}>Remove Finance Coach key</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: R.iconBtn,
    backgroundColor: T.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 17,
    color: T.text,
    textAlign: 'center',
  },
  scroll: {paddingHorizontal: 16, paddingBottom: 40},
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: R.small,
    marginBottom: 20,
  },
  statusActive: {backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)'},
  statusInactive: {backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)'},
  statusText: {flex: 1, fontFamily: FONTS.medium, fontSize: 13, lineHeight: 18},
  sectionTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: T.text3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: T.surface,
    borderRadius: R.card,
    padding: 14,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 20,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surface2,
    borderRadius: R.small,
    borderWidth: 1,
    borderColor: T.border2,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: T.text,
  },
  modelInput: {
    paddingVertical: 8,
    fontSize: 13,
  },
  eyeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  testMsg: {fontFamily: FONTS.regular, fontSize: 12},
  btnRow: {flexDirection: 'row', gap: 8, marginTop: 12},
  btnTest: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTestText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text2},
  btnSave: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: R.small,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSaveText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.accentInk},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  rowLabel: {fontFamily: FONTS.medium, fontSize: 13, color: T.text2, width: 90},
  rowValue: {flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: T.text},
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: T.text3,
    marginTop: 8,
    lineHeight: 17,
  },
  privacyRow: {flexDirection: 'row', gap: 10, alignItems: 'flex-start'},
  privacyText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text2,
    lineHeight: 18,
  },
  howRow: {flexDirection: 'row', gap: 10, alignItems: 'flex-start'},
  howIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: T.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  howText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text2,
    lineHeight: 18,
  },
  getKeyBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  getKeyText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text3,
    lineHeight: 18,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: R.card,
    backgroundColor: 'rgba(251,113,133,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.2)',
    marginBottom: 8,
  },
  clearText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.expense},
  divider: {
    height: 1,
    backgroundColor: T.border,
    marginVertical: 24,
  },
});
