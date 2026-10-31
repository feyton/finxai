/**
 * Subcategories per category = built-ins from the shared taxonomy (each
 * category owns its list — shared/categories.ts) ∪ the user's custom
 * ones (synced `subcategories` table). Every picker (CreateRecord, Fix sheet,
 * EditTransaction, CreateBudget, Manage Categories) goes through this hook so
 * a subcategory created anywhere shows up everywhere.
 */
import {useQuery} from '@powersync/react-native';
import {useMemo} from 'react';
import {CATEGORY_IDS, CategoryId, resolveCat, subcategoriesOf} from '../theme';
import {useCurrentUser} from './useCurrentUser';

export interface SubcatOption {
  name: string;
  icon: string;
  custom: boolean;
  id?: string; // subcategories.id when custom (for deletion)
}

export function useSubcategories() {
  const {userId} = useCurrentUser();
  const {data: customRows} = useQuery(
    'SELECT * FROM subcategories WHERE owner_id = ? ORDER BY name',
    [userId ?? ''],
  );

  const byCat = useMemo(() => {
    const map = new Map<CategoryId, SubcatOption[]>();
    const push = (cat: CategoryId, opt: SubcatOption) => {
      const list = map.get(cat) ?? [];
      if (!list.some(x => x.name.toLowerCase() === opt.name.toLowerCase())) {
        list.push(opt);
      }
      map.set(cat, list);
    };
    for (const cat of CATEGORY_IDS) {
      for (const s of subcategoriesOf(cat)) {
        push(cat, {name: s.name, icon: s.emoji, custom: false});
      }
    }
    for (const s of (customRows as any[]) ?? []) {
      push(resolveCat(s.category ?? ''), {
        name: s.name ?? '',
        icon: s.icon || '🏷️',
        custom: true,
        id: s.id,
      });
    }
    return map;
  }, [customRows]);

  const subcatsFor = (cat: CategoryId | null): SubcatOption[] =>
    cat ? byCat.get(cat) ?? [] : [];

  return {subcatsFor};
}
