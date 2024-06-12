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
  initial_amount!: number;

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
      transactions: {type: 'list', objectType: 'Transaction'},
      transfers: 'Transaction[]',
    },
    primaryKey: '_id',
  };
  updateAvailableBalance(realm: Realm) {
    realm.write(() => {
      const linkedTransactions = realm
        .objects('Transaction')
        .filtered('account._id == $0', this._id);
      const totalIncome = linkedTransactions
        .filtered("transaction_type == 'income'")
        .sum('amount');
      const totalExpense = linkedTransactions
        .filtered("transaction_type == 'expense'")
        .sum('amount');
      const totalFees = linkedTransactions
        .filtered("transaction_type == 'expense'")
        .sum('fees');
      const incomingTransfers = realm
        .objects('Transaction')
        .filtered(
          "toAccount._id == $0 AND transaction_type == 'transfer'",
          this._id,
        );
      const outgoingTransfers = realm
        .objects('Transaction')
        .filtered(
          "account._id == $0 AND transaction_type == 'transfer'",
          this._id,
        );
      const totalIncoming = incomingTransfers.sum('amount');
      const totalOutgoing = outgoingTransfers.sum('amount');

      this.amount =
        this.initial_amount +
        totalIncome -
        totalExpense -
        totalFees +
        totalIncoming -
        totalOutgoing;
    });
  }
}

export class Transaction extends Realm.Object<Transaction> {
  _id!: BSON.ObjectId;
  amount!: any;
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
      amount: 'double',
      confirmed: {type: 'bool', default: false},
      date_time: {type: 'date'},
      sms: {type: 'string', indexed: true},
      account: 'Account',
      payee: 'string?',
      transaction_type: 'string',
      currency: {type: 'string', default: 'RWF'},
      category: 'Category?',
      subcategory: 'Subcategory?',
      budget: 'Budget?', // Link to the parent Budget object
      budgetItemId: 'string?',
      note: 'string?',
      splitDetails: 'SplitDetail[]',
      toAccount: {
        type: 'linkingObjects',
        objectType: 'Account',
        property: 'transfers',
      },
      fees: {type: 'double', default: 0}, // Only for transfer transactions
    },
    primaryKey: '_id',
  };
  get total() {
    if (this.transaction_type === 'income') {
      return this.amount;
    }
    if (this.transaction_type === 'expense') {
      return -this.amount - this.fees;
    }
    if (this.transaction_type === 'transfer') {
      return -this.amount - this.fees;
    }
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
  name!: string;
  getTotalAmount() {
    return this.items.reduce(
      (total: any, item: {amount: any}) => total + item.amount,
      0,
    );
  }
  getCurrentSpending() {
    let totalSpending = 0;

    return totalSpending;
  }
  getSpendingPercentage() {
    const currentSpending = this.getCurrentSpending();
    return (currentSpending / this.getTotalAmount()) * 100;
  }
}

export class BudgetItem extends Realm.Object<BudgetItem> {
  static schema: ObjectSchema = {
    name: 'BudgetItem',
    embedded: true, // Mark BudgetItem as embedded
    properties: {
      _id: {type: 'objectId', default: new BSON.ObjectID()},
      category: 'Category?',
      subcategory: 'Subcategory?',
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
  _id!: BSON.ObjectId;
  name!: string;
  icon!: string;
  type!: 'income' | 'expense'; // Add a type field
  subcategories: Realm.List<Subcategory> | undefined;

  static schema: ObjectSchema = {
    name: 'Category',
    properties: {
      _id: {type: 'objectId', default: () => new ObjectId()},
      name: 'string',
      icon: 'string',
      type: {type: 'string', default: 'expense'}, // Default to 'expense'
      subcategories: {type: 'list', objectType: 'Subcategory'},
      transactions: {
        objectType: 'Transaction',
        type: 'list',
      },
    },
    primaryKey: '_id',
  };
  category: Subcategory[];
}

export class Subcategory extends Realm.Object {
  _id!: BSON.ObjectId;
  name!: string;
  icon!: string;

  static schema: ObjectSchema = {
    name: 'Subcategory',
    embedded: true, // Make Subcategory embedded in Category
    properties: {
      _id: {type: 'objectId', default: () => new ObjectId()},
      name: 'string',
      icon: 'string',
    },
  };
}
