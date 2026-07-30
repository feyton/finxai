/**
 * @format
 */
import 'react-native-url-polyfill/auto';
import {AppRegistry} from 'react-native';
import {registerWidgetTaskHandler} from 'react-native-android-widget';
import App from './App';
import {name as appName} from './app.json';
import {widgetTaskHandler} from './src/widgets/widgetTaskHandler';
import {smsTaskHandler} from './src/tools/smsTaskHandler';

AppRegistry.registerComponent(appName, () => App);
registerWidgetTaskHandler(widgetTaskHandler);

// Live SMS capture. Started by android/.../sms/SmsHeadlessTaskService.kt when a
// financial SMS arrives, so a transaction is recorded within seconds instead of
// waiting for the app to next be opened. The task name must match the one in
// that service.
AppRegistry.registerHeadlessTask('FinxaiSmsTask', () => smsTaskHandler);
