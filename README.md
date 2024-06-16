### FinXAi
> Expense Tracking meet the power of Artificial Intelligence

### About
This android app allow you to track your expenses in style

### Getting Started

```bash
yarn install
yarn start
yarn run android
```

### Building APK

```bash 
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/

cd android && ./gradlew assembleRelease


```

### Tech Stack

To learn more about React Native, take a look at the following resources:

- [React Native](https://reactnative.dev)
