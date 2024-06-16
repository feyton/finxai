import React, {useEffect, useState} from 'react';
import {
  Animated,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import {COLORS} from '../assets/images';

interface FloatingLabelInputProps extends TextInputProps {
  name: string;
  label: string;
}

const FloatingLabelInputRegular: React.FC<FloatingLabelInputProps> = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  name,
  label,
  ...inputProps
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [labelPosition] = useState(new Animated.Value(0));

  useEffect(() => {
    const shouldFloatLabel = !!inputProps.value || isFocused;
    Animated.timing(labelPosition, {
      toValue: shouldFloatLabel ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused, labelPosition, inputProps.value]);

  const labelStyle = {
    top: labelPosition.interpolate({
      inputRange: [0, 1],
      outputRange: [14, -10],
    }),
    fontSize: labelPosition.interpolate({
      inputRange: [0, 1],
      outputRange: [14, 12],
    }),
    color: labelPosition.interpolate({
      inputRange: [0, 1],
      outputRange: ['#999', 'white'],
    }),
  };

  return (
    <View style={styles.inputContainer}>
      <TextInput
        style={[styles.input]}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
        }}
        {...inputProps}
      />
      <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    marginVertical: 10,
    position: 'relative',
  },
  input: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 1,
    paddingHorizontal: 10,
    borderRadius: 5,
    fontFamily: 'Poppins-Bold',
  },
  errorInput: {
    borderColor: 'red',
  },
  label: {
    position: 'absolute',
    left: 15,
    backgroundColor: COLORS.bgPrimary,
    paddingHorizontal: 5,
    fontFamily: 'Poppins-Regular',
    color: 'white',
    fontSize: 10,
  },
  errorText: {
    color: 'red',
    fontSize: 12,
    marginTop: 5,
    fontFamily: 'Arial',
  },
});

export default FloatingLabelInputRegular;
