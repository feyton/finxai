import {useEffect, useState} from 'react';
import {supabase} from '../tools/supabase';

interface CurrentUser {
  userId: string | null;
  name: string | null;
  email: string | null;
  picture: string | null;
  firstName: string | null;
}

export function useCurrentUser(): CurrentUser {
  const [user, setUser] = useState<CurrentUser>({
    userId: null,
    name: null,
    email: null,
    picture: null,
    firstName: null,
  });

  useEffect(() => {
    const updateUser = (session: any) => {
      if (session?.user) {
        const u = session.user;
        const meta = u.user_metadata ?? {};
        const fullName: string = meta.full_name ?? meta.name ?? '';
        setUser({
          userId: u.id,
          name: fullName || null,
          email: u.email ?? null,
          picture: meta.avatar_url ?? meta.picture ?? null,
          firstName: meta.given_name ?? fullName.split(' ')[0] ?? null,
        });
      } else {
        setUser({userId: null, name: null, email: null, picture: null, firstName: null});
      }
    };

    supabase.auth.getSession().then(({data: {session}}) => updateUser(session));

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, session) => updateUser(session));

    return () => subscription.unsubscribe();
  }, []);

  return user;
}
