import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './api';
import { authError } from '../../shared/auth-errors';
import type { AppError } from '../../shared/domain';

// Read an existing session without creating an anonymous account on public pages.
export function useSessionState() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState<AppError | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let changed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      changed = true;
      if (active) {
        setSession(next);
        setError(null);
      }
    });
    const restore = () => {
      void supabase!.auth.getSession().then(({ data, error }) => {
        if (!active || changed) return;
        if (error) failed(error);
        else {
          setSession(data.session);
          setError(null);
        }
      }, failed);
    };
    const failed = (cause: unknown) => {
      if (!active || changed) return;
      const failure = authError(cause);
      setError(failure);
      if (failure.code === 'UNAUTHORIZED') setSession(null);
      else timer = setTimeout(restore, 3000);
    };
    restore();
    return () => {
      active = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);
  return { session: supabase ? session : null, error };
}

export function useSession() {
  return useSessionState().session;
}
