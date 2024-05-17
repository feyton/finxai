import {Realm} from '@realm/react';
import {BSON, ObjectSchema} from 'realm';

// export class Account extends Realm.Object {
//   name!: string;
//   amount!: number;
//   color!: string;
//   currency!: string;
//   type!: string;
//   initial_amount!: number;
//   icon!: string;
//   constructor(
//     realm: Realm,
//     name: string,
//     amount: number,
//     color: string,
//     currency: string,
//     type: string,
//     initial_amount: string,
//     icon: string,
//   ) {
//     super(realm, {amount, name, color, currency, type, initial_amount, icon});
//   }
// }
// Define your object model
export class Account extends Realm.Object<Account> {
  _id!: BSON.ObjectId;
  name!: string;
  type!: string;
  amount!: number;
  category!: string;

  static schema: ObjectSchema = {
    name: 'Account',
    properties: {
      _id: 'objectId',
      name: {type: 'string', indexed: 'full-text'},
      type: {type: 'string', indexed: 'full-text'},
      amount: {type: 'float'},
      initial_amount: {type: 'float'},
      category: {type: 'string'},
      auto: {type: 'bool'},
    },
    primaryKey: '_id',
  };
}

export class Transaction extends Realm.Object<Transaction> {
  _id!: BSON.ObjectId;
  name!: string;
  type!: string;
  account?: Account;
  category!: string;
  date_time!: string;
  sms?: string;
  confirmed!: string;

  static schema: ObjectSchema = {
    name: 'Transaction',
    properties: {
      _id: 'objectId',
      name: {type: 'string', indexed: 'full-text'},
      type: {type: 'string', indexed: 'full-text'},
      amount: 'float',
      category: 'string',
      confirmed: {type: 'bool'},
      date_time: {type: 'date'},
      sms: {type: 'string'},
      account: 'Account?',
    },
    primaryKey: '_id',
  };
}

export class SMSLog extends Realm.Object<SMSLog> {
  _id!: BSON.ObjectId;
  name!: string;
  static schema: ObjectSchema = {
    name: 'SMSLog',
    properties: {
      _id: 'objectId',
      date: {type: 'int'},
      count: {type: 'int'},
    },
    primaryKey: '_id',
  };
}
