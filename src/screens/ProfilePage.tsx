import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Avatar, Card, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {APP_VERSION} from '../appVersion';
import {FONTS, R, T} from '../theme';
import categoriesData from '../tools/data.json';
import {clearMyData, hasSeededData, seedDemoData} from '../tools/seed';
import {supabase} from '../tools/supabase';
import {checkForUpdate} from '../tools/updateChecker';

function Row({
  icon,
  tint,
  title,
  sub,
  onPress,
  danger,
  right,
}: {
  icon: string;
  tint?: string;
  title: string;
  sub?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  const color = tint ?? T.text2;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({pressed}) => [styles.row, {opacity: pressed && onPress ? 0.7 : 1}]}>
      <View style={[styles.rowIcon, {backgroundColor: color + '22'}]}>
        <Icon name={icon} size={17} color={danger ? T.expense : color} strokeWidth={2} />
      </View>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={[styles.rowTitle, danger && {color: T.expense}]}>{title}</Text>
        {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <Icon name="ChevronRight" size={18} color={T.text3} /> : null)}
    </Pressable>
  );
}

export default function ProfilePage({navigation}: any) {
  const {name, email, picture, firstName, userId} = useCurrentUser();
  const db = usePowerSync();
  const uid = userId ?? '';
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateReady, setUpdateReady] = useState<string | null>(null);

  const {data: accounts} = useQuery(
    'SELECT name, auto FROM accounts WHERE owner_id = ?',
    [uid],
  );
  const {data: people} = useQuery(
    'SELECT id FROM shared_people WHERE owner_id = ?',
    [uid],
  );
  const {data: debts} = useQuery('SELECT id FROM debts WHERE owner_id = ?', [uid]);
  const {data: scheduled} = useQuery(
    'SELECT id FROM scheduled_payments WHERE owner_id = ?',
    [uid],
  );
  const {data: subs} = useQuery(
    'SELECT id FROM subscriptions WHERE owner_id = ? AND active = 1',
    [uid],
  );

  const autoCount = useMemo(
    () => (accounts as any[]).filter(a => a.auto).length,
    [accounts],
  );
  const categoryCount = useMemo(
    () => categoriesData.categories.filter(c => c.type === 'expense').length,
    [],
  );
  const upcoming = (scheduled as any[]).length + (subs as any[]).length;

  // Quiet background update check on open.
  useEffect(() => {
    checkForUpdate()
      .then(info => {
        if (info.available) {
          setUpdateReady(info.latest);
        }
      })
      .catch(() => {});
  }, []);

  const performLogout = () => {
    Alert.alert('Log out?', 'You can sign back in anytime.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await GoogleSignin.signOut();
          } catch {}
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  const runUpdateCheck = async () => {
    if (checking) {
      return;
    }
    setChecking(true);
    try {
      const info = await checkForUpdate();
      if (info.available) {
        Alert.alert(
          'Update available',
          `Version ${info.latest} is ready (you have ${info.current}).`,
          [
            {text: 'Later', style: 'cancel'},
            {text: 'Download', onPress: () => info.url && Linking.openURL(info.url)},
          ],
        );
      } else {
        Alert.alert("You're up to date", `FinXAI ${info.current} is the latest.`);
      }
    } catch (e: any) {
      Alert.alert('Check failed', e?.message ?? 'Could not reach GitHub.');
    } finally {
      setChecking(false);
    }
  };

  const startOver = () => {
    if (!uid || busy) {
      return;
    }
    Alert.alert(
      'Clear data & start over?',
      'This permanently deletes every account, transaction, budget, debt, list and setting you own — on this device and in the cloud. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () =>
            // second confirm — this is destructive
            Alert.alert('Are you absolutely sure?', 'There is no way to recover this data.', [
              {text: 'Keep my data', style: 'cancel'},
              {
                text: 'Yes, wipe it all',
                style: 'destructive',
                onPress: async () => {
                  setBusy(true);
                  try {
                    await clearMyData(db, uid);
                    Alert.alert('Fresh start', 'All your data has been cleared.');
                    navigation.navigate('Home');
                  } catch (e: any) {
                    Alert.alert('Clear failed', e?.message ?? 'Unknown error');
                  } finally {
                    setBusy(false);
                  }
                },
              },
            ]),
        },
      ],
    );
  };

  const runSeed = async () => {
    if (!uid || busy) {
      return;
    }
    const go = async () => {
      setBusy(true);
      try {
        await seedDemoData(db, uid);
        Alert.alert('Done', 'Demo data seeded.');
      } catch (e: any) {
        Alert.alert('Seed failed', e?.message ?? 'Unknown error');
      } finally {
        setBusy(false);
      }
    };
    if (await hasSeededData(db, uid)) {
      Alert.alert('Data already exists', 'Seed anyway (adds duplicates)?', [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Seed anyway', onPress: go},
      ]);
    } else {
      await go();
    }
  };

  const infoAlert = (title: string, body: string) => () => Alert.alert(title, body);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{padding: 16, gap: 16, paddingBottom: 40}}>
        {/* Identity */}
        <View style={styles.identity}>
          <Avatar
            initials={(firstName ?? name ?? 'U')[0]?.toUpperCase()}
            tint={T.accent}
            size={64}
            img={picture ?? undefined}
          />
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={styles.name} numberOfLines={1}>{name ?? 'You'}</Text>
            <Text style={styles.email} numberOfLines={1}>{email ?? ''}</Text>
          </View>
        </View>

        {/* Settings */}
        <Card pad={0}>
          <Row
            icon="MessageSquare"
            tint={T.accent}
            title="SMS auto-import"
            sub={autoCount > 0 ? `${autoCount} account${autoCount !== 1 ? 's' : ''} connected` : 'Not set up'}
            onPress={() => navigation.navigate('SMSReview')}
          />
          <View style={styles.divider} />
          <Row
            icon="Tag"
            tint={T.info}
            title="Categories"
            sub={`${categoryCount} active`}
            onPress={() => navigation.navigate('ManageCategories')}
          />
          <View style={styles.divider} />
          <Row
            icon="Users"
            tint="#F472B6"
            title="Shared & family"
            sub={`${(people as any[]).length} ${(people as any[]).length === 1 ? 'person' : 'people'}`}
            onPress={() => navigation.navigate('Shared')}
          />
          <View style={styles.divider} />
          <Row
            icon="Calendar"
            tint={T.warn}
            title="Schedule & recurring"
            sub={`${upcoming} upcoming`}
            onPress={() => navigation.navigate('Schedule')}
          />
          <View style={styles.divider} />
          <Row
            icon="Coins"
            tint="#34D399"
            title="Debts & loans"
            sub={`${(debts as any[]).length} active`}
            onPress={() => navigation.navigate('Debt')}
          />
        </Card>

        <Card pad={0}>
          <Row
            icon="Shield"
            tint={T.info}
            title="Privacy & security"
            sub="On-device SMS parsing · encrypted sync"
            onPress={infoAlert(
              'Privacy & security',
              'Your SMS are parsed on your device. Data syncs to your private cloud over an encrypted connection and is scoped to your account only.',
            )}
          />
          <View style={styles.divider} />
          <Row
            icon="Globe"
            tint="#A78BFA"
            title="Currency & region"
            sub="RWF · Rwanda"
            onPress={infoAlert('Currency & region', 'FinXAI is set to Rwandan Francs (RWF). Multi-currency support is coming soon.')}
          />
          <View style={styles.divider} />
          <Row
            icon="RefreshCcw"
            tint={T.accent}
            title="Check for updates"
            sub={updateReady ? `Version ${updateReady} available` : `Version ${APP_VERSION}`}
            onPress={runUpdateCheck}
            right={
              checking ? (
                <ActivityIndicator size="small" color={T.text3} />
              ) : updateReady ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>New</Text>
                </View>
              ) : undefined
            }
          />
        </Card>

        {/* Danger zone */}
        <Card pad={0}>
          <Row
            icon="Trash2"
            title="Clear data & start over"
            sub="Delete everything and begin fresh"
            danger
            onPress={startOver}
          />
          <View style={styles.divider} />
          <Row icon="Lock" title="Log out" onPress={performLogout} />
        </Card>

        {__DEV__ && (
          <Card pad={12} style={{gap: 8}}>
            <Text style={styles.devLabel}>Developer</Text>
            <Pressable
              onPress={runSeed}
              disabled={busy}
              style={({pressed}) => [styles.devBtn, {backgroundColor: T.accent, opacity: busy ? 0.5 : pressed ? 0.85 : 1}]}>
              <Text style={[styles.devBtnText, {color: T.accentInk}]}>
                {busy ? 'Working…' : 'Seed demo data'}
              </Text>
            </Pressable>
          </Card>
        )}

        <Text style={styles.version}>FinXAI v{APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  iconBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center'},
  title: {fontFamily: FONTS.bold, fontSize: 18, color: T.text},
  identity: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4},
  name: {fontFamily: FONTS.bold, fontSize: 19, color: T.text},
  email: {fontFamily: FONTS.regular, fontSize: 13, color: T.text2, marginTop: 2},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13},
  rowIcon: {width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center'},
  rowTitle: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text},
  rowSub: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2, marginTop: 1},
  divider: {height: 1, backgroundColor: T.border, marginLeft: 62},
  badge: {paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: T.accent},
  badgeText: {fontFamily: FONTS.bold, fontSize: 10, color: T.accentInk},
  devLabel: {fontFamily: FONTS.semibold, fontSize: 12, color: T.text3, marginLeft: 2},
  devBtn: {alignItems: 'center', paddingVertical: 11, borderRadius: R.card},
  devBtnText: {fontFamily: FONTS.bold, fontSize: 13.5},
  version: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text3, textAlign: 'center', marginTop: 4},
});
