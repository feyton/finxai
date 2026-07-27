import React from 'react';
import type {WidgetTaskHandlerProps} from 'react-native-android-widget';
import {BalanceWidget} from './BalanceWidget';
import {getWidgetAccountsData} from './widgetData';

const nameToWidget = {
  BalanceWidget,
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const Widget = nameToWidget[props.widgetInfo.widgetName as keyof typeof nameToWidget];
  if (!Widget) {
    return;
  }

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK': {
      const data = await getWidgetAccountsData();
      props.renderWidget(<Widget {...data} />);
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
}
