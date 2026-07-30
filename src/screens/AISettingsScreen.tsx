import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {FONTS, R, T} from '../theme';
import {Icon} from '../Components/ui';
import {AiTestResult, testAiConnection} from '../tools/aiProxyClient';
import {supabase} from '../tools/supabase';
import {AiProvider, useAiProvider} from '../hooks/useAiProvider';
import {
  LocationState,
  getLocationState,
  requestLocationAlways,
} from '../tools/locationPermission';

type TestState = 'idle' | 'testing' | 'done' | 'error';

function SectionTitle({children}: {children: string}) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function ProviderCard({
  icon,
  title,
  desc,
  result,
}: {
  icon: string;
  title: string;
  desc: string;
  result?: {ok: boolean; error?: string};
}) {
  const ok = result?.ok ?? true; // no test run yet → assume healthy, server-managed
  const color = ok ? T.income : T.expense;
  const label = !result
    ? 'Managed by FinXAI — no setup needed'
    : ok
    ? 'Connected'
    : result.error ?? 'Connection failed';

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, {backgroundColor: color + '22'}]}>
          <Icon name={icon} size={16} color={color} strokeWidth={2.2} />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{desc}</Text>
        </View>
      </View>
      <View style={styles.statusRow}>
        <Icon name={ok ? 'CheckCircle' : 'XCircle'} size={13} color={color} strokeWidth={2.2} />
        <Text style={[styles.statusText, {color}]}>{label}</Text>
      </View>
    </View>
  );
}

// A selectable provider, with its server-side health when a test has been run.
function ProviderChoice({
  value,
  selected,
  onSelect,
  saving,
  icon,
  title,
  desc,
  health,
}: {
  value: AiProvider;
  selected: boolean;
  onSelect: (v: AiProvider) => void;
  saving: boolean;
  icon: string;
  title: string;
  desc: string;
  health?: {ok: boolean; error?: string};
}) {
  const unhealthy = health && !health.ok;
  return (
    <Pressable
      onPress={() => onSelect(value)}
      disabled={saving}
      style={({pressed}) => [
        styles.card,
        styles.choiceCard,
        selected && styles.cardSelected,
        {opacity: pressed || saving ? 0.75 : 1},
      ]}>
      <View style={styles.cardHead}>
        <View
          style={[
            styles.cardIcon,
            {backgroundColor: (selected ? T.accent : T.text3) + '22'},
          ]}>
          <Icon
            name={icon}
            size={16}
            color={selected ? T.accent : T.text3}
            strokeWidth={2.2}
          />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{desc}</Text>
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={T.accent} />
        ) : (
          <Icon
            name={selected ? 'CheckCircle2' : 'Circle'}
            size={20}
            color={selected ? T.accent : T.border2}
            strokeWidth={2.2}
          />
        )}
      </View>
      {unhealthy && (
        <View style={styles.statusRow}>
          <Icon name="XCircle" size={13} color={T.expense} strokeWidth={2.2} />
          <Text style={[styles.statusText, {color: T.expense}]}>
            {health?.error ?? 'Connection failed'}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function AISettingsScreen({navigation}: any) {
  const [testState, setTestState] = useState<TestState>('idle');
  const [result, setResult] = useState<AiTestResult | null>(null);
  const [testError, setTestError] = useState('');
  const {provider, setProvider} = useAiProvider();
  const [saving, setSaving] = useState<AiProvider | null>(null);
  const [locState, setLocState] = useState<LocationState>('denied');

  useEffect(() => {
    getLocationState().then(setLocState);
  }, []);

  const handleLocationPress = async () => {
    const next = await requestLocationAlways();
    setLocState(next);
    if (next === 'foreground') {
      // Android 11+ shows no dialog for background location — it sends the user
      // to app settings — so re-check rather than reporting failure.
      Linking.openSettings().catch(() => {});
    }
  };

  const choose = async (next: AiProvider) => {
    if (next === provider) {
      return;
    }
    setSaving(next);
    try {
      await setProvider(next);
    } finally {
      setSaving(null);
    }
  };

  const runTest = async () => {
    setTestState('testing');
    setTestError('');
    try {
      const {
        data: {session},
      } = await supabase.auth.getSession();
      const r = await testAiConnection(session?.access_token ?? '');
      setResult(r);
      setTestState('done');
    } catch (e: any) {
      setTestState('error');
      setTestError(e?.message ?? 'Could not reach FinXAI');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={20} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>AI Status</Text>
        <View style={{width: 38}} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          FinXAI's AI features are managed for you — there's nothing to set up or pay for
          separately.
        </Text>

        <SectionTitle>AI Provider</SectionTitle>
        <Text style={styles.pickerHint}>
          One provider handles both SMS parsing and the Finance Coach. Switching takes
          effect on the next SMS or chat message — nothing already saved changes.
        </Text>
        <ProviderChoice
          value="anthropic"
          selected={provider === 'anthropic'}
          onSelect={choose}
          saving={saving === 'anthropic'}
          icon="Sparkles"
          title="Claude"
          desc="Haiku 4.5 tags your SMS; Sonnet 4.6 answers coach questions."
          health={result?.anthropic}
        />
        <View style={{height: 10}} />
        <ProviderChoice
          value="gemini"
          selected={provider === 'gemini'}
          onSelect={choose}
          saving={saving === 'gemini'}
          icon="Zap"
          title="Gemini"
          desc="Gemini 3.5 Flash handles both SMS tagging and coach questions."
          health={result?.gemini}
        />
        {provider === null && (
          <Text style={styles.pickerHint}>
            Using FinXAI's default until you pick one.
          </Text>
        )}

        <Pressable
          onPress={runTest}
          disabled={testState === 'testing'}
          style={({pressed}) => [
            styles.testBtn,
            {opacity: pressed || testState === 'testing' ? 0.7 : 1},
          ]}>
          {testState === 'testing' ? (
            <ActivityIndicator size="small" color={T.text2} />
          ) : (
            <>
              <Icon name="Zap" size={15} color={T.text2} strokeWidth={2.2} />
              <Text style={styles.testBtnText}>Test connection</Text>
            </>
          )}
        </Pressable>
        {testState === 'error' && (
          <Text style={styles.testErrorText}>{testError}</Text>
        )}

        {/* Transaction location — money-out only, opt-in */}
        <SectionTitle>Transaction Location</SectionTitle>
        <Text style={styles.pickerHint}>
          Tag spending with where it happened, so you can see where your money actually
          goes. Only on money out — income and transfers between your own accounts are
          never tagged. FinXAI reads the location Android has already cached and never
          switches on GPS, so this costs no extra battery.
        </Text>
        <Pressable
          onPress={handleLocationPress}
          disabled={locState === 'always'}
          style={({pressed}) => [
            styles.card,
            styles.choiceCard,
            locState === 'always' && styles.cardSelected,
            {opacity: pressed ? 0.75 : 1},
          ]}>
          <View style={styles.cardHead}>
            <View
              style={[
                styles.cardIcon,
                {backgroundColor: (locState === 'always' ? T.accent : T.text3) + '22'},
              ]}>
              <Icon
                name="Globe"
                size={16}
                color={locState === 'always' ? T.accent : T.text3}
                strokeWidth={2.2}
              />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.cardTitle}>
                {locState === 'always' ? 'Location tagging on' : 'Tag spending with location'}
              </Text>
              <Text style={styles.cardDesc}>
                {locState === 'always'
                  ? 'Money-out transactions captured live will record where you were.'
                  : locState === 'foreground'
                  ? 'Needs "Allow all the time" — transaction alerts arrive while FinXAI is closed. Tap to open settings.'
                  : 'Tap to allow. You can turn this off in system settings at any time.'}
              </Text>
            </View>
            <Icon
              name={locState === 'always' ? 'CheckCircle2' : 'Circle'}
              size={20}
              color={locState === 'always' ? T.accent : T.border2}
              strokeWidth={2.2}
            />
          </View>
        </Pressable>

        {/* Privacy note */}
        <SectionTitle>Privacy</SectionTitle>
        <View style={styles.card}>
          <View style={styles.privacyRow}>
            <Icon name="Lock" size={16} color={T.text3} strokeWidth={2} />
            <Text style={styles.privacyText}>
              SMS text and chat messages are sent to FinXAI's own server, which relays them to
              the provider you picked above. They're never sent from your device directly to
              Google or Anthropic, and the API keys live only on FinXAI's server — never on your
              phone.
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
      </ScrollView>
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
  intro: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: T.text2,
    lineHeight: 18,
    marginBottom: 20,
  },
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
  // Spacing between the choices is an explicit spacer, so the shared card
  // style's bottom margin has to be dropped here.
  choiceCard: {marginBottom: 0},
  cardSelected: {
    borderColor: T.accent,
    backgroundColor: T.accentSoft,
  },
  pickerHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 18,
    color: T.text3,
    marginBottom: 12,
  },
  cardHead: {flexDirection: 'row', gap: 10, alignItems: 'flex-start'},
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  cardDesc: {fontFamily: FONTS.regular, fontSize: 12, color: T.text2, marginTop: 2, lineHeight: 16},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10},
  statusText: {fontFamily: FONTS.medium, fontSize: 12},
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: R.small,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border2,
    marginBottom: 8,
  },
  testBtnText: {fontFamily: FONTS.semibold, fontSize: 13, color: T.text2},
  testErrorText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: T.expense,
    textAlign: 'center',
    marginBottom: 12,
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
});
