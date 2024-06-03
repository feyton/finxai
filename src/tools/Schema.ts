import {Realm} from '@realm/react';
import {ObjectId} from 'bson';
import {Double} from 'react-native/Libraries/Types/CodegenTypes';
import {BSON, ObjectSchema} from 'realm';

export class Account extends Realm.Object<Account> {
  _id!: BSON.ObjectId;
  name!: string;
  type!: string;
  amount!: number;
  category!: string;
  address?: string;
  logDate?: number;
  initial_amount?: number;

  static schema: ObjectSchema = {
    name: 'Account',
    properties: {
      _id: {type: 'objectId', default: new BSON.ObjectID()},
      name: {type: 'string', indexed: 'full-text'},
      amount: {type: 'double'},
      initial_amount: {type: 'double', default: 0},
      auto: {type: 'bool'},
      address: {type: 'string', default: ''},
      logDate: 'int?',
      number: 'string?',
      logo: 'string?',
      providerName: 'string?',
    },
    primaryKey: '_id',
  };
}

export class Transaction extends Realm.Object<Transaction> {
  _id!: BSON.ObjectId;
  amount?: Double;
  account!: Account;
  category?: string;
  subcategory?: string;
  date_time!: string;
  sms?: string;
  confirmed!: boolean;
  currency?: string;
  payee?: string;
  transaction_type?: string;
  note?: string;
  fees?: Double;

  static schema: ObjectSchema = {
    name: 'Transaction',
    properties: {
      _id: {type: 'objectId', default: new BSON.ObjectID()},
      amount: 'float?',
      category: 'string?',
      confirmed: {type: 'bool', default: false},
      date_time: {type: 'date'},
      sms: {type: 'string', indexed: true},
      account: 'Account',
      payee: 'string?',
      transaction_type: 'string',
      currency: 'string',
      subcategory: 'string?',
      budget: 'Budget?', // Link to the parent Budget object
      budgetItemId: 'string?',
      note: 'string?',
      splitDetails: 'SplitDetail[]',
      toAccount: 'string?',
      fees: 'double?', // Only for transfer transactions
    },
    primaryKey: '_id',
  };
  total() {
    return this.amount + this.fees;
  }
}

export class Budget extends Realm.Object<Budget> {
  _id!: BSON.ObjectID;
  period!: string;
  startDate?: Date;
  endDate?: Date;
  items?: any;

  static schema: ObjectSchema = {
    name: 'Budget',
    primaryKey: '_id',
    properties: {
      _id: {type: 'objectId', default: new BSON.ObjectID()},
      name: 'string', // Overall budget name (e.g., "Monthly Expenses", "Vacation")
      period: 'string?', // 'monthly', 'weekly', 'custom' (for events)
      startDate: 'date?', // Start date (for custom/event budgets)
      endDate: 'date?',
      items: 'BudgetItem[]',
      shared_with: 'string[]',
      recurring: 'bool',
      event: 'string?',
      amount: 'double',
    },
  };
  name: ReactNode;
  getTotalAmount() {
    return this.items.reduce(
      (total: any, item: {amount: any}) => total + item.amount,
      0,
    );
  }
  getCurrentSpending(transactions: any[]) {
    let totalSpending = 0;
    transactions.forEach(
      (transaction: {
        budget: {_id: {equals: (arg0: ObjectId) => any}};
        amount: number;
      }) => {
        if (transaction.budget && transaction.budget._id.equals(this._id)) {
          totalSpending += transaction.amount;
        }
      },
    );
    return totalSpending;
  }
  getSpendingPercentage(transactions: any) {
    const currentSpending = this.getCurrentSpending(transactions);
    return (currentSpending / this.getTotalAmount()) * 100;
  }
}

export class BudgetItem extends Realm.Object<BudgetItem> {
  static schema: ObjectSchema = {
    name: 'BudgetItem',
    embedded: true, // Mark BudgetItem as embedded
    properties: {
      _id: {type: 'objectId', default: new BSON.ObjectID()},
      category: 'string',
      subcategory: 'string?',
      amount: 'double',
    },
  };
}

export class SplitDetail extends Realm.Object<SplitDetail> {
  static schema: ObjectSchema = {
    name: 'SplitDetail',
    embedded: true,
    properties: {
      amount: 'double',
      category: 'string',
      subcategory: 'string?',
      note: 'string?',
    },
  };
}

export class Category extends Realm.Object<Category> {
  name!: 'string';
  subcategories?: 'string[]';
  static schema: ObjectSchema = {
    name: 'Category',
    properties: {
      _id: {type: 'objectId', default: new BSON.ObjectID()},
      name: 'string',
      subcategories: 'string[]',
    },
    primaryKey: '_id',
  };
}
