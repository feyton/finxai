import {useEffect, useState} from 'react';
import {Keyboard, LayoutAnimation} from 'react-native';

/**
 * Height of the on-screen keyboard, or 0 while it is hidden.
 *
 * For bottom sheets inside a <Modal>. KeyboardAvoidingView is the wrong tool
 * there on Android: it derives its adjustment from its OWN measured frame, and
 * in a statusBarTranslucent Modal under edge-to-edge that frame shifts every
 * time the adjustment is applied — so it re-measures, re-adjusts, and the sheet
 * visibly flickers for as long as the keyboard keeps reporting (every
 * suggestion-strip change restarts it). Seen on the SMS Fix sheet's note field.
 *
 * The window itself does not resize for the keyboard under edge-to-edge
 * (adjustResize is ignored), which is why a sheet with no adjustment at all had
 * its lower fields hidden behind the keyboard. Padding by the keyboard's own
 * reported height is a value that does not depend on our layout, so there is
 * nothing to feed back into.
 *
 * Android only emits the Did* events, which is why those are used.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ease = () =>
      LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    const show = Keyboard.addListener('keyboardDidShow', e => {
      ease();
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      ease();
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
