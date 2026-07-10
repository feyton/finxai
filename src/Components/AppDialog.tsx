// Themed replacement for the OS Alert.alert dialogs — same call signature,
// but rendered in the app's own dark style (surface card, rounded, accent
// buttons) instead of the grey system popup. Mount <AppDialogHost/> once in
// App.tsx and call appAlert(...) anywhere.
import React, {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {FONTS, R, T} from '../theme';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface DialogSpec {
  title: string;
  message?: string;
  buttons: DialogButton[];
}

let present: ((spec: DialogSpec) => void) | null = null;

export function appAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
): void {
  const btns = buttons?.length ? buttons : [{text: 'OK'}];
  present?.({title, message, buttons: btns});
}

export function AppDialogHost() {
  const [spec, setSpec] = useState<DialogSpec | null>(null);

  useEffect(() => {
    present = s => setSpec(s);
    return () => {
      present = null;
    };
  }, []);

  if (!spec) {
    return null;
  }

  const cancel = spec.buttons.find(b => b.style === 'cancel');
  const dismiss = () => {
    setSpec(null);
    cancel?.onPress?.();
  };
  const stacked = spec.buttons.length > 2;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable style={styles.overlay} onPress={dismiss} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{spec.title}</Text>
          {!!spec.message && <Text style={styles.message}>{spec.message}</Text>}
          <View style={[styles.btnWrap, stacked ? styles.btnCol : styles.btnRow]}>
            {spec.buttons.map((b, i) => {
              const destructive = b.style === 'destructive';
              const isCancel = b.style === 'cancel';
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    setSpec(null);
                    b.onPress?.();
                  }}
                  style={({pressed}) => [
                    styles.btn,
                    !stacked && {flex: 1},
                    destructive
                      ? styles.btnDestructive
                      : isCancel
                      ? styles.btnCancel
                      : styles.btnPrimary,
                    {opacity: pressed ? 0.8 : 1},
                  ]}>
                  <Text
                    style={[
                      styles.btnText,
                      destructive
                        ? {color: T.expense}
                        : isCancel
                        ? {color: T.text2}
                        : {color: T.accentInk},
                    ]}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: T.surface,
    borderRadius: R.large,
    borderWidth: 1,
    borderColor: T.border2,
    padding: 20,
  },
  title: {fontFamily: FONTS.bold, fontSize: 16, color: T.text},
  message: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: T.text2,
    lineHeight: 19,
    marginTop: 8,
  },
  btnWrap: {marginTop: 18},
  btnRow: {flexDirection: 'row', gap: 9},
  btnCol: {gap: 9},
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: R.small + 2,
  },
  btnPrimary: {backgroundColor: T.accent},
  btnCancel: {backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border},
  btnDestructive: {
    backgroundColor: 'rgba(251,113,133,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.3)',
  },
  btnText: {fontFamily: FONTS.semibold, fontSize: 13.5},
});
