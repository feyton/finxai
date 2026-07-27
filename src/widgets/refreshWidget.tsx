import React from 'react';
import {requestWidgetUpdate} from 'react-native-android-widget';
import {BalanceWidget} from './BalanceWidget';
import {getWidgetAccountsData} from './widgetData';

// Pushes a fresh render to any BalanceWidget instance on the home screen.
// Never allowed to throw — a widget refresh failure must not break the
// balance-sync/account-mutation flow that triggered it.
export function refreshBalanceWidget() {
  requestWidgetUpdate({
    widgetName: 'BalanceWidget',
    renderWidget: async () => {
      const data = await getWidgetAccountsData();
      return <BalanceWidget {...data} />;
    },
  }).catch(() => {});
}
