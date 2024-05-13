import React, {useState} from 'react';

import {styled} from 'nativewind';
import {Text, View} from 'react-native';

const StyledText = styled(Text);

const StyledView = styled(View);

function SMSRetriever(): React.JSX.Element {
  const [sms, setSMS] = useState([]);

  return (
    <StyledView>
      <StyledText className="text-white">Loading sms</StyledText>
    </StyledView>
  );
}

export default SMSRetriever;
