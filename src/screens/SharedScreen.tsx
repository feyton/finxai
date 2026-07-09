import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useMemo, useState} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Avatar, Card, Icon, Pill} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {FONTS, R, T} from '../theme';
import {sendInviteEmail} from '../tools/invites';

const APP_LINK = 'https://github.com/feyton/finxai/releases/latest';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const TINTS = ['#F472B6', '#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#FB7185'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export default function SharedScreen({navigation}: any) {
  const db = usePowerSync();
  const {userId, firstName} = useCurrentUser();

  const {data: people} = useQuery(
    'SELECT * FROM shared_people WHERE owner_id = ? ORDER BY created_at DESC',
    [userId ?? ''],
  );
  const {data: accounts} = useQuery(
    'SELECT id, name FROM accounts WHERE owner_id = ?',
    [userId ?? ''],
  );

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [sending, setSending] = useState(false);

  // Open the OS share sheet so the invite actually reaches the person via
  // WhatsApp/SMS/etc. Used as the fallback when no email is given or email fails.
  const shareInvite = (who: string) =>
    Share.share({
      message: `Hi ${who}! I'm using FinXAI to track our shared budget together. Install it here: ${APP_LINK} and I'll add you. — ${firstName ?? 'A FinXAI user'}`,
    }).catch(() => {});

  const accountName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts as any[]) {
      map[a.id] = a.name;
    }
    return map;
  }, [accounts]);

  const invite = async () => {
    const n = name.trim();
    if (!n) {
      return;
    }
    const e = email.trim();
    setSending(true);
    const tint = TINTS[(people as any[]).length % TINTS.length];
    try {
      await db.execute(
        'INSERT INTO shared_people (id, name, role, initials, tint, access, accounts, status, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), n, role.trim() || 'Family', initialsOf(n), tint, 'View only', '[]', 'pending', userId ?? '', new Date().toISOString()],
      );
      setName('');
      setEmail('');
      setRole('');
      setOpen(false);

      if (e) {
        try {
          await sendInviteEmail(e, firstName ?? 'A FinXAI user', n);
          Alert.alert('Invitation sent', `We emailed ${e} an invite to join.`);
          return;
        } catch {
          // email failed (function not deployed yet, offline…) → share sheet
        }
      }
      await shareInvite(n);
    } finally {
      setSending(false);
    }
  };

  const list = people as any[];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={18} color={T.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={styles.title}>Shared & family</Text>
          <Text style={styles.subtitle}>Track money together, safely</Text>
        </View>
        <Pressable
          onPress={() => setOpen(true)}
          style={({pressed}) => [styles.addBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="UserPlus" size={17} color={T.accent} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{padding: 16, paddingTop: 4, gap: 14, paddingBottom: 40}}>
        <View style={styles.banner}>
          <Icon name="Shield" size={18} color={T.info} strokeWidth={2} />
          <Text style={styles.bannerText}>
            Invite your spouse or family to{' '}
            <Text style={{color: T.text, fontFamily: FONTS.semibold}}>view or co-manage</Text>
            {' '}a single account — for shared planning, not full access to everything.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>People</Text>
        {list.map(p => {
          let acctIds: string[] = [];
          try {
            acctIds = JSON.parse(p.accounts || '[]');
          } catch {}
          const acctLabel = acctIds.map(id => accountName[id]).filter(Boolean)[0];
          const pending = p.status === 'pending';
          return (
            <Card key={p.id} pad={14} onPress={pending ? () => shareInvite(p.name) : undefined}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                <Avatar initials={p.initials || initialsOf(p.name)} tint={p.tint || T.accent} size={44} />
                <View style={{flex: 1, minWidth: 0}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 7}}>
                    <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                    {pending && <Pill size={9} color={T.warn} bg={T.warn + '22'}>Pending</Pill>}
                  </View>
                  <Text style={styles.role}>{p.role} · {p.access}</Text>
                  {acctLabel ? (
                    <View style={styles.acctChip}>
                      <Icon name="Landmark" size={11} color={T.text3} strokeWidth={2} />
                      <Text style={styles.acctText}>{acctLabel}</Text>
                    </View>
                  ) : null}
                </View>
                {pending ? (
                  <View style={styles.resend}>
                    <Icon name="Share2" size={13} color={T.accent} strokeWidth={2.2} />
                    <Text style={styles.resendText}>Resend</Text>
                  </View>
                ) : (
                  <Icon name="ChevronRight" size={18} color={T.text3} />
                )}
              </View>
            </Card>
          );
        })}

        {list.length === 0 && (
          <Card style={{alignItems: 'center', gap: 6}} pad={24}>
            <Icon name="Users" size={36} color={T.text3} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No one shared with yet</Text>
          </Card>
        )}

        <Pressable
          onPress={() => setOpen(true)}
          style={({pressed}) => [styles.inviteBtn, {opacity: pressed ? 0.85 : 1}]}>
          <Icon name="UserPlus" size={16} color={T.accent} strokeWidth={2.2} />
          <Text style={styles.inviteText}>Invite someone</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Invite someone</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={T.text3}
            style={styles.modalInput}
            autoFocus
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email (we'll send an invitation)"
            placeholderTextColor={T.text3}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.modalInput}
          />
          <TextInput
            value={role}
            onChangeText={setRole}
            placeholder="Relationship (e.g. Spouse)"
            placeholderTextColor={T.text3}
            style={styles.modalInput}
          />
          <Pressable
            onPress={invite}
            disabled={sending}
            style={({pressed}) => [styles.modalBtn, {opacity: sending ? 0.5 : pressed ? 0.85 : 1}]}>
            <Text style={styles.modalBtnText}>
              {sending ? 'Sending…' : email.trim() ? 'Email invitation' : 'Share invite'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: T.bg},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  iconBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center'},
  title: {fontFamily: FONTS.bold, fontSize: 17, color: T.text},
  subtitle: {fontFamily: FONTS.regular, fontSize: 11.5, color: T.text2},
  addBtn: {width: 38, height: 38, borderRadius: R.iconBtn, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center'},
  banner: {flexDirection: 'row', gap: 11, alignItems: 'flex-start', padding: 13, borderRadius: R.card, backgroundColor: 'rgba(96,165,250,0.10)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.22)'},
  bannerText: {flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: T.text2, lineHeight: 18},
  sectionLabel: {fontFamily: FONTS.bold, fontSize: 15, color: T.text, marginTop: 2},
  name: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text, flexShrink: 1},
  role: {fontFamily: FONTS.regular, fontSize: 12, color: T.text2, marginTop: 1},
  acctChip: {flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: T.surface2},
  acctText: {fontFamily: FONTS.medium, fontSize: 10.5, color: T.text2},
  resend: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: T.accentSoft},
  resendText: {fontFamily: FONTS.semibold, fontSize: 10.5, color: T.accent},
  emptyText: {fontFamily: FONTS.semibold, fontSize: 14, color: T.text2},
  inviteBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: R.card, backgroundColor: T.accentSoft, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)'},
  inviteText: {fontFamily: FONTS.bold, fontSize: 14, color: T.accent},
  overlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)'},
  modalCard: {position: 'absolute', top: '34%', left: 24, right: 24, backgroundColor: T.surface, borderRadius: R.large, borderWidth: 1, borderColor: T.border, padding: 18, gap: 12},
  modalTitle: {fontFamily: FONTS.bold, fontSize: 15, color: T.text},
  modalInput: {paddingHorizontal: 14, paddingVertical: 11, borderRadius: R.small, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border, fontFamily: FONTS.medium, fontSize: 14, color: T.text},
  modalBtn: {alignItems: 'center', paddingVertical: 12, borderRadius: R.card, backgroundColor: T.accent},
  modalBtnText: {fontFamily: FONTS.bold, fontSize: 14, color: T.accentInk},
});
