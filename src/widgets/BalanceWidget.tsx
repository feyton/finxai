import React from 'react';
import {FlexWidget, ListWidget, TextWidget} from 'react-native-android-widget';
import {T, accountTint, fmtAmount} from '../theme';
import type {WidgetAccountsData} from './widgetData';

// Special clickAction (not a library reserved word) — widgetTaskHandler.tsx
// re-renders on this instead of treating it as WIDGET_CLICK-opens-app.
export const REFRESH_CLICK_ACTION = 'REFRESH';

// theme.ts types color tokens as plain `string`; the widget library requires
// the stricter `#RRGGBB` template literal type. Values are always hex here.
const hex = (s: string) => s as `#${string}`;

export function BalanceWidget({totalBalance, accounts}: WidgetAccountsData) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hex(T.bg),
        borderRadius: 16,
        padding: 12,
      }}>
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        <FlexWidget style={{flexDirection: 'column'}}>
          <TextWidget text="Total balance" style={{fontSize: 12, color: hex(T.text2)}} />
          <TextWidget
            text={`RWF ${fmtAmount(totalBalance)}`}
            style={{fontSize: 20, fontWeight: 'bold', color: hex(T.text)}}
          />
        </FlexWidget>
        <FlexWidget
          clickAction={REFRESH_CLICK_ACTION}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: hex(T.surface2),
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TextWidget text="⟳" style={{fontSize: 16, color: hex(T.accent)}} />
        </FlexWidget>
      </FlexWidget>

      <ListWidget style={{width: 'match_parent', height: 'match_parent', marginTop: 8}}>
        {accounts.map(account => (
          <FlexWidget
            key={account.id}
            clickAction="OPEN_APP"
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
            }}>
            <FlexWidget
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: hex(`${accountTint(account.name)}33`),
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 10,
              }}>
              <TextWidget
                text={(account.name?.[0] ?? '?').toUpperCase()}
                style={{fontSize: 13, fontWeight: 'bold', color: hex(accountTint(account.name))}}
              />
            </FlexWidget>
            <FlexWidget style={{flex: 1, flexDirection: 'column'}}>
              <TextWidget
                text={account.name}
                style={{fontSize: 13, color: hex(T.text)}}
                maxLines={1}
                truncate="END"
              />
            </FlexWidget>
            <TextWidget
              text={fmtAmount(account.available_balance ?? 0)}
              style={{fontSize: 13, color: hex(T.text), fontWeight: '600'}}
            />
          </FlexWidget>
        ))}
      </ListWidget>
    </FlexWidget>
  );
}
