import {Realm} from '@realm/react';
import {BSON, ObjectSchema} from 'realm';

export class Account extends Realm.Object<Account> {
  _id!: BSON.ObjectId;
  name!: string;
  type!: string;
  amount!: number;
  category!: string;
  address?: string;

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
      address: {type: 'string', default: ''},
    },
    primaryKey: '_id',
  };
}

export class Transaction extends Realm.Object<Transaction> {
  _id!: BSON.ObjectId;
  amount!: string;
  account?: Account;
  category!: string;
  subcategory!: string;
  date_time!: string;
  sms?: string;
  confirmed!: boolean;
  currency?: string;
  payee?: string;
  transaction_type?: string;

  static schema: ObjectSchema = {
    name: 'Transaction',
    properties: {
      _id: 'objectId',
      amount: 'float',
      category: 'string',
      confirmed: {type: 'bool'},
      date_time: {type: 'date'},
      sms: {type: 'string'},
      account: 'Account?',
      payee: 'string',
      transaction_type: 'string',
      currency: 'string',
      subcategory: 'string',
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
