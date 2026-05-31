import React, {useEffect, useRef, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {T, FONTS, R} from '../theme';
import {Avatar, Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';

interface Message {
  id: string;
  who: 'ai' | 'me';
  text: string;
  bars?: {cat: string; value: number; color: string}[];
  list?: string[];
  foot?: string;
  action?: string;
}

const SEED: Message[] = [
  {
    id: 'seed0',
    who: 'ai',
    text: "Muraho! 👋 I'm your Finance Coach. I can help you understand your spending, plan savings, manage debts, and more. What would you like to know?",
  },
];

const SUGGESTIONS = [
  'Where did my money go this week?',
  'How much on transport this month?',
  'Can I afford 200k for savings?',
  'Find subscriptions I forgot',
];

function richText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text>
      {parts.map((seg, i) => {
        if (seg.startsWith('**') && seg.endsWith('**')) {
          return (
            <Text key={i} style={{fontFamily: FONTS.bold}}>
              {seg.slice(2, -2)}
            </Text>
          );
        }
        return <Text key={i}>{seg}</Text>;
      })}
    </Text>
  );
}

function Bubble({msg}: {msg: Message}) {
  if (msg.who === 'me') {
    return (
      <View style={styles.bubbleMe}>
        <Text style={styles.bubbleMeText}>{msg.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.bubbleAiWrap}>
      <View style={styles.bubbleAi}>
        <Text style={styles.bubbleAiText}>{richText(msg.text)}</Text>
        {msg.list && (
          <View style={{marginTop: 9, gap: 7}}>
            {msg.list.map((x, i) => (
              <View key={i} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Icon name="Repeat" size={15} color={T.accent} strokeWidth={2} />
                <Text style={{fontFamily: FONTS.regular, fontSize: 12.5, color: T.text, flex: 1}}>{x}</Text>
              </View>
            ))}
          </View>
        )}
        {msg.foot && (
          <Text style={[styles.bubbleAiText, {marginTop: 9, color: T.text2}]}>
            {richText(msg.foot)}
          </Text>
        )}
      </View>
      {msg.action && (
        <Pressable style={styles.actionBtn}>
          <Icon name="Check" size={15} color={T.accent} strokeWidth={2.4} />
          <Text style={{fontFamily: FONTS.semibold, fontSize: 12.5, color: T.accent}}>
            {msg.action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={[styles.bubbleAi, {flexDirection: 'row', gap: 5, alignSelf: 'flex-start', paddingVertical: 14}]}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.dot, {opacity: 0.4 + i * 0.2}]} />
      ))}
    </View>
  );
}

export default function AIChatScreen({navigation}: any) {
  const {firstName, picture} = useCurrentUser();
  const [msgs, setMsgs] = useState<Message[]>(SEED);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    listRef.current?.scrollToEnd({animated: true});
  }, [msgs, typing]);

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) {return;}
    setInput('');
    setMsgs(m => [...m, {id: 'u' + Date.now(), who: 'me', text: q}]);
    setTyping(true);
    // Placeholder — will be replaced with real Anthropic API call
    setTimeout(() => {
      setTyping(false);
      setMsgs(m => [
        ...m,
        {
          id: 'a' + Date.now(),
          who: 'ai',
          text: "I'm connecting to your financial data. Full AI coaching will be available soon — your accounts, budgets, and transaction history will be analyzed to give you personalized insights.",
        },
      ]);
    }, 1200);
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={19} color={T.text} />
        </Pressable>
        <View style={styles.aiAvatar}>
          <Icon name="Sparkles" size={21} color={T.accentInk} strokeWidth={2.2} />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.headerTitle}>Finance Coach</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
            <View style={styles.greenDot} />
            <Text style={{fontFamily: FONTS.medium, fontSize: 11, color: T.accent}}>
              Knows your accounts
            </Text>
          </View>
        </View>
        <Pressable style={styles.backBtn}>
          <Icon name="Clock" size={18} color={T.text2} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Thread */}
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={m => m.id}
          renderItem={({item}) => <Bubble msg={item} />}
          ListFooterComponent={typing ? <TypingIndicator /> : null}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}
        />

        {/* Suggestion chips */}
        <FlatList
          horizontal
          data={SUGGESTIONS}
          keyExtractor={s => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          renderItem={({item}) => (
            <Pressable
              onPress={() => send(item)}
              style={({pressed}) => [styles.chip, {opacity: pressed ? 0.7 : 1}]}>
              <Text style={styles.chipText}>{item}</Text>
            </Pressable>
          )}
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your money…"
              placeholderTextColor={T.text3}
              style={styles.input}
              onSubmitEditing={() => send()}
              returnKeyType="send"
            />
            <Pressable style={{padding: 4}}>
              <Icon name="Mic" size={19} color={T.text3} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => send()}
            style={({pressed}) => [styles.sendBtn, {opacity: pressed ? 0.8 : 1}]}>
            <Icon name="Send" size={20} color={T.accentInk} strokeWidth={2.2} />
          </Pressable>
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
    gap: 11,
    padding: 12,
    paddingHorizontal: 14,
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
  },
  aiAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: T.accent600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {fontFamily: FONTS.semibold, fontSize: 14.5, color: T.text},
  greenDot: {width: 6, height: 6, borderRadius: 6, backgroundColor: T.accent},
  thread: {padding: 14, gap: 12, paddingBottom: 8},
  bubbleMe: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomRightRadius: 5,
  },
  bubbleMeText: {fontFamily: FONTS.medium, fontSize: 13.5, color: T.accentInk, lineHeight: 20},
  bubbleAiWrap: {alignSelf: 'flex-start', maxWidth: '88%', gap: 8},
  bubbleAi: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderTopLeftRadius: 5,
  },
  bubbleAiText: {fontFamily: FONTS.regular, fontSize: 13.5, color: T.text, lineHeight: 22},
  actionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  dot: {width: 7, height: 7, borderRadius: 7, backgroundColor: T.text3},
  chips: {gap: 8, paddingHorizontal: 14, paddingBottom: 10},
  chip: {
    flexShrink: 0,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: R.pill,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipText: {fontFamily: FONTS.regular, fontSize: 12, color: T.text2},
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 4,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 22,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: T.text,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 44,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
