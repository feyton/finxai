import React, {useEffect, useState} from 'react';
import {Control, Controller, useWatch} from 'react-hook-form';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import {COLORS, FONTS} from '../assets/images';

interface FloatingLabelInputProps extends TextInputProps {
  control: Control<any>;
  name: string;
  label: string;
  rules?: any;
}

const FloatingLabelInput: React.FC<FloatingLabelInputProps> = ({
  control,
  name,
  label,
  rules,
  ...inputProps
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [labelPosition] = useState(new Animated.Value(0));

  const fieldValue = useWatch({
    control,
    name,
  });

  useEffect(() => {
    const shouldFloatLabel = !!fieldValue || isFocused;
    Animated.timing(labelPosition, {
      toValue: shouldFloatLabel ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused, labelPosition, fieldValue]);

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
      outputRange: ['white', '#999'],
    }),
    zIndex: labelPosition.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  };

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({field: {onChange, onBlur, value}, fieldState: {error}}) => (
        <View style={styles.inputContainer}>
          <Animated.Text style={[styles.label, labelStyle]}>
            {label}
          </Animated.Text>
          <TextInput
            style={[styles.input, error && styles.errorInput]}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              onBlur();
            }}
            onChangeText={onChange}
            value={value}
            {...inputProps}
          />
          {error && <Text style={styles.errorText}>{error.message}</Text>}
        </View>
      )}
    />
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
    paddingHorizontal: 20,
    borderRadius: 5,
    fontFamily: FONTS.regular,
    fontSize: 12,
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
    fontFamily: 'Poppins-Regular',
  },
});

export default FloatingLabelInput;
