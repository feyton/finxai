import AsyncStorage from '@react-native-async-storage/async-storage';
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../Components/ui';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {appAlert} from '../Components/AppDialog';
import {T, FONTS, R, fmtAmount} from '../theme';
import {
  DEFAULT_ANTHROPIC_MODEL,
  getAnthropicKey,
  getAnthropicModel,
} from '../tools/aiConfig';
import {ToolMessage, askClaudeTools} from '../tools/anthropicClient';
import {AiAction, anthropicToolSchemas, findAction} from '../tools/aiActions';

interface Message {
  id: string;
  who: 'ai' | 'me';
  text: string;
  kind?: 'action';
}

const SEED: Message[] = [
  {
    id: 'seed0',
    who: 'ai',
    text: "Muraho! 👋 I'm your Finance Coach. I can help you understand your spending, plan savings, manage debts, and more. What would you like to know?",
  },
];

const SUGGESTIONS = [
  'Where did my money go this month?',
  'How much on transport this month?',
  'Can I afford 200k for savings?',
  'What debts do I have?',
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
  if (msg.kind === 'action') {
    return (
      <View style={styles.actionCard}>
        <Icon name="CheckCircle2" size={16} color={T.accent} strokeWidth={2.2} />
        <Text style={styles.actionText}>{msg.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.bubbleAi}>
      <Text style={styles.bubbleAiText}>{richText(msg.text)}</Text>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={[styles.bubbleAi, {flexDirection: 'row', gap: 5, paddingVertical: 14}]}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.dot, {opacity: 0.4 + i * 0.2}]} />
      ))}
    </View>
  );
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function AIChatScreen({navigation}: any) {
  const {firstName, userId} = useCurrentUser();
  const uid = userId ?? '';
  const db = usePowerSync();

  const ms = useMemo(() => monthStartISO(), []);

  // ── Financial context queries ──────────────────────────────────
  const {data: accounts} = useQuery(
    'SELECT id, name, type, available_balance FROM accounts WHERE owner_id = ? ORDER BY available_balance DESC',
    [uid],
  );

  const {data: monthTxns} = useQuery(
    "SELECT amount, category, transaction_type FROM transactions WHERE owner_id = ? AND date_time >= ? AND confirmed = 1",
    [uid, ms],
  );

  const {data: recentTxns} = useQuery(
    'SELECT amount, category, merchant, payee, date_time, transaction_type FROM transactions WHERE owner_id = ? AND confirmed = 1 ORDER BY date_time DESC LIMIT 8',
    [uid],
  );

  const {data: budgets} = useQuery(
    'SELECT name, amount, period FROM budgets WHERE owner_id = ? LIMIT 5',
    [uid],
  );

  const {data: debts} = useQuery(
    'SELECT dir, party, outstanding, frequency, next_due FROM debts WHERE owner_id = ?',
    [uid],
  );

  // ── Derived financial numbers ──────────────────────────────────
  const {totalBalance, monthlyIncome, monthlyExpenses, topCats} = useMemo(() => {
    const bal = accounts.reduce((s: number, a: any) => s + (a.available_balance ?? 0), 0);
    let income = 0;
    let expenses = 0;
    const catMap: Record<string, number> = {};
    for (const t of monthTxns as any[]) {
      if (t.transaction_type === 'income') {
        income += t.amount ?? 0;
      } else if (t.transaction_type === 'expense') {
        expenses += t.amount ?? 0;
        if (t.category) {
          catMap[t.category] = (catMap[t.category] ?? 0) + (t.amount ?? 0);
        }
      }
      // transfers are net-zero movements between own accounts — ignored
    }
    const cats = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amt]) => `  • ${cat}: RWF ${fmtAmount(amt)}`);
    return {totalBalance: bal, monthlyIncome: income, monthlyExpenses: expenses, topCats: cats};
  }, [accounts, monthTxns]);

  // ── System prompt (rebuilt when financial data changes) ────────
  const systemPrompt = useMemo(() => {
    const now = new Date();
    const monthLabel = now.toLocaleString('en-US', {month: 'long', year: 'numeric'});

    const accountLines = (accounts as any[])
      .map(a => `  • ${a.name} (${a.type}): RWF ${fmtAmount(a.available_balance ?? 0)}`)
      .join('\n') || '  None yet';

    const recentLines = (recentTxns as any[])
      .map(t => {
        const sign = t.transaction_type === 'income' ? '+' : '-';
        const label = t.merchant || t.payee || t.category || '—';
        const date = t.date_time ? String(t.date_time).slice(0, 10) : '';
        return `  • ${date} ${sign}RWF ${fmtAmount(t.amount ?? 0)} — ${label} [${t.category ?? '?'}]`;
      })
      .join('\n') || '  None yet';

    const budgetLines = (budgets as any[])
      .map(b => `  • ${b.name}: RWF ${fmtAmount(b.amount ?? 0)} (${b.period})`)
      .join('\n') || '  None set';

    const debtLines = (debts as any[])
      .map(d => {
        const dir = d.dir === 'borrowed' ? 'Owed to' : 'Owed by';
        const due = d.next_due ? `, next ${d.next_due}` : '';
        return `  • ${dir} ${d.party}: RWF ${fmtAmount(d.outstanding ?? 0)} — ${d.frequency}${due}`;
      })
      .join('\n') || '  None recorded';

    return `You are Finance Coach, a personal financial advisor for ${firstName || 'the user'} in Rwanda. Be concise, specific, and use their real numbers. All amounts are in RWF (Rwandan Francs).

TODAY: ${now.toDateString()}

## Accounts (${(accounts as any[]).length})
${accountLines}
Total balance: RWF ${fmtAmount(totalBalance)}

## ${monthLabel} Summary
Income:   RWF ${fmtAmount(monthlyIncome)}
Expenses: RWF ${fmtAmount(monthlyExpenses)}
Net:      RWF ${fmtAmount(monthlyIncome - monthlyExpenses)}${topCats.length ? `\n\nTop spend categories:\n${topCats.join('\n')}` : ''}

## Recent Transactions (last 8)
${recentLines}

## Active Budgets
${budgetLines}

## Debts
${debtLines}

You can TAKE ACTIONS with the provided tools — add a transaction, recategorize one, create a budget, schedule a recurring payment, and look up exact spending. Prefer doing the action with a tool over telling the user to do it by hand. The app automatically asks the user to confirm any action that changes their data, so you don't need to ask permission first — just call the tool with your best interpretation. Use the read tools when you need exact figures beyond the summary above.

Guidelines:
- Respond in English or Kinyarwanda matching the user's language
- Keep answers to 2-4 sentences unless the user asks for detail
- Bold key figures with **asterisks**
- Do NOT use markdown tables or "#" headers — the chat renders plain text. Use short lines and "•" bullets instead.
- Give actionable, specific advice
- After taking an action, briefly confirm what you did
- If asked about data you don't have, say so honestly`;
  }, [firstName, accounts, totalBalance, monthlyIncome, monthlyExpenses, topCats, recentTxns, budgets, debts]);

  // ── Chat state ─────────────────────────────────────────────────
  const [msgs, setMsgs] = useState<Message[]>(SEED);
  const [apiHistory, setApiHistory] = useState<ToolMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [apiKey, setApiKeyState] = useState('');
  const [model, setModelState] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<FlatList>(null);

  const chatKey = `finxai.chat.${uid || 'anon'}`;

  useEffect(() => {
    (async () => {
      const k = await getAnthropicKey();
      const m = await getAnthropicModel();
      if (k) {setApiKeyState(k);}
      setModelState(m);
    })();
  }, []);

  // Restore the saved conversation once the user id is known.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(chatKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved.msgs) && saved.msgs.length) {
            setMsgs(saved.msgs);
          }
          if (Array.isArray(saved.apiHistory)) {
            setApiHistory(saved.apiHistory);
          }
        }
      } catch {}
      setLoaded(true);
    })();
  }, [chatKey]);

  // Persist the conversation on every change (after the initial restore).
  useEffect(() => {
    if (!loaded) {
      return;
    }
    AsyncStorage.setItem(chatKey, JSON.stringify({msgs, apiHistory})).catch(() => {});
  }, [msgs, apiHistory, loaded, chatKey]);

  const clearChat = () => {
    appAlert(
      'Clear conversation?',
      'This erases the chat history with your Finance Coach.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setMsgs(SEED);
            setApiHistory([]);
            await AsyncStorage.removeItem(chatKey);
          },
        },
      ],
    );
  };

  useEffect(() => {
    listRef.current?.scrollToEnd({animated: true});
  }, [msgs, typing]);

  // Ask the user to confirm a data-changing action before it runs.
  const confirmWrite = (action: AiAction, actionInput: any) =>
    new Promise<boolean>(resolve => {
      appAlert(
        'Confirm action',
        action.summary ? action.summary(actionInput) : `Run ${action.name}?`,
        [
          // dismissing the dialog runs the cancel handler → resolves false
          {text: 'Cancel', style: 'cancel', onPress: () => resolve(false)},
          {text: 'Do it', onPress: () => resolve(true)},
        ],
      );
    });

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) {return;}

    if (!apiKey) {
      navigation.navigate('AISettings');
      return;
    }

    setInput('');
    setMsgs(m => [...m, {id: 'u' + Date.now(), who: 'me', text: q}]);

    let history: ToolMessage[] = [...apiHistory, {role: 'user', content: q}];
    setTyping(true);

    const tools = anthropicToolSchemas();
    const ctx = {db, userId: uid};

    try {
      // Agentic loop: model may call tools; execute and feed results back.
      for (let step = 0; step < 6; step++) {
        const turn = await askClaudeTools(
          history.slice(-24),
          systemPrompt,
          apiKey,
          model,
          tools,
        );
        history = [...history, {role: 'assistant', content: turn.content}];

        const textParts = turn.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n')
          .trim();
        if (textParts) {
          setMsgs(m => [...m, {id: `a${Date.now()}_${step}`, who: 'ai', text: textParts}]);
        }

        const toolUses = turn.content.filter((b: any) => b.type === 'tool_use');
        if (turn.stopReason !== 'tool_use' || toolUses.length === 0) {
          break;
        }

        const results: any[] = [];
        for (const tu of toolUses) {
          const action = findAction(tu.name);
          let content = '';
          let isError = false;
          if (!action) {
            content = `Unknown action "${tu.name}".`;
            isError = true;
          } else if (action.kind === 'write') {
            const ok = await confirmWrite(action, tu.input);
            if (!ok) {
              content = 'The user declined this action. Acknowledge and continue.';
            } else {
              try {
                content = await action.run(ctx, tu.input);
                setMsgs(m => [
                  ...m,
                  {id: `act${Date.now()}`, who: 'ai', kind: 'action', text: content},
                ]);
              } catch (e: any) {
                content = `Action failed: ${e?.message ?? 'unknown error'}`;
                isError = true;
              }
            }
          } else {
            try {
              content = await action.run(ctx, tu.input);
            } catch (e: any) {
              content = `Lookup failed: ${e?.message ?? 'unknown error'}`;
              isError = true;
            }
          }
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content,
            is_error: isError,
          });
        }
        history = [...history, {role: 'user', content: results}];
      }
      setApiHistory(history);
    } catch (e: any) {
      const errText = e?.message?.includes('Invalid') || e?.message?.includes('key')
        ? 'API key rejected. Go to AI Settings to update it.'
        : `Something went wrong: ${e?.message ?? 'unknown error'}`;
      setMsgs(m => [...m, {id: 'err' + Date.now(), who: 'ai', text: errText}]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.headerBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="ArrowLeft" size={19} color={T.text} />
        </Pressable>
        <View style={styles.aiAvatar}>
          <Icon name="Sparkles" size={20} color={T.accentInk} strokeWidth={2.2} />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.headerTitle}>Finance Coach</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
            <View style={[styles.statusDot, {backgroundColor: apiKey ? T.accent : T.text3}]} />
            <Text style={{fontFamily: FONTS.medium, fontSize: 11, color: apiKey ? T.accent : T.text3}}>
              {apiKey ? 'Knows your accounts' : 'Not configured'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={clearChat}
          style={({pressed}) => [styles.headerBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Trash2" size={16} color={T.text2} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('AISettings')}
          style={({pressed}) => [styles.headerBtn, {opacity: pressed ? 0.7 : 1}]}>
          <Icon name="Settings2" size={17} color={T.text2} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Thread */}
        <FlatList
          ref={listRef}
          style={styles.threadList}
          data={msgs}
          keyExtractor={m => m.id}
          renderItem={({item}) => <Bubble msg={item} />}
          ListFooterComponent={typing ? <TypingIndicator /> : null}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}
        />

        {/* No-key banner */}
        {!apiKey && (
          <Pressable
            onPress={() => navigation.navigate('AISettings')}
            style={({pressed}) => [styles.noKeyBanner, {opacity: pressed ? 0.85 : 1}]}>
            <Icon name="Key" size={14} color={T.warn} strokeWidth={2.2} />
            <Text style={styles.noKeyText}>Add your Anthropic key in AI Settings to start chatting</Text>
            <Icon name="ChevronRight" size={14} color={T.warn} />
          </Pressable>
        )}

        {/* Suggestion chips */}
        <FlatList
          horizontal
          data={SUGGESTIONS}
          keyExtractor={s => s}
          style={styles.chipsList}
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
              editable={!!apiKey}
            />
          </View>
          <Pressable
            onPress={() => send()}
            disabled={typing}
            style={({pressed}) => [
              styles.sendBtn,
              {opacity: pressed || typing || !apiKey ? 0.5 : 1},
            ]}>
            {typing ? (
              <ActivityIndicator size="small" color={T.accentInk} />
            ) : (
              <Icon name="Send" size={19} color={T.accentInk} strokeWidth={2.2} />
            )}
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerBtn: {
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
  statusDot: {width: 6, height: 6, borderRadius: 6},
  threadList: {flex: 1},
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
  bubbleAi: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderTopLeftRadius: 5,
  },
  bubbleAiText: {fontFamily: FONTS.regular, fontSize: 13.5, color: T.text, lineHeight: 22},
  actionCard: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  actionText: {flex: 1, fontFamily: FONTS.medium, fontSize: 12.5, color: T.text, lineHeight: 18},
  dot: {width: 7, height: 7, borderRadius: 7, backgroundColor: T.text3},
  noKeyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 12,
    borderRadius: R.card,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  noKeyText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: T.warn,
    lineHeight: 17,
  },
  chipsList: {flexGrow: 0},
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
    paddingHorizontal: 14,
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
