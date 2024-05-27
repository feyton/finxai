export class Budget extends Realm.Object {
  id!: Realm.BSON.ObjectID;
  title?: string;
  description?: string;
}
