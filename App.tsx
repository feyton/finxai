import React from 'react';
import {SafeAreaView, Text, View} from 'react-native';

import {styled} from 'nativewind';

const StyledText = styled(Text);

const StyledView = styled(View);

function App(): React.JSX.Element {
  return (
    <SafeAreaView style={{backgroundColor: 'white'}}>
      <StyledView className="bg-white ">
        <StyledText className="font-bold text-center text-black">Hello</StyledText>
      </StyledView>
    </SafeAreaView>
  );
}

export default App;
