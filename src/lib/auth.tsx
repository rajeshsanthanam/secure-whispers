import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { createIdentity, unlockIdentity } from "@/lib/crypto";
import * as vault from "@/lib/key-vault";
import {
  checkPassword,
  checkUsername,
  clearLoginFailures,
  formatCooldown,
  loginCooldown,
  normalizeUsername,
  recordLoginFailure,
  syntheticEmail,
} from "@/lib/password-policy";

export type MyProfile = {
  id: string;
  username: string;
  displayName: string;
  publicKey: string;
};

type AuthValue = {
  loading: boolean;
  session: Session | null;
  profile: MyProfile | null;
  /** true when the private key is decrypted and held in memory */
  unlocked: boolean;
  signUp: (username: string, password: string, displayName: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (displayName: string) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

type KeyMaterial = {
  public_key: string;
  encrypted_private_key_blob: string;
  salt: string;
  username: string;
  display_name: string;
};

async function fetchKeyMaterial(): Promise<KeyMaterial> {
  const { data, error } = await supabase.rpc("get_my_key_material");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as KeyMaterial | undefined;
  if (!row) throw new Error("No key material found for this account.");
  return row;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        vault.wipeKeys();
        setUnlocked(false);
        setProfile(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchKeyMaterial()
      .then((row) => {
        if (cancelled) return;
        setProfile({
          id: session.user.id,
          username: row.username,
          displayName: row.display_name,
          publicKey: row.public_key,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signUp = useCallback(
    async (username: string, password: string, displayName: string) => {
      const usernameProblem = checkUsername(username);
      if (usernameProblem) throw new Error(usernameProblem);
      const strength = checkPassword(password);
      if (!strength.ok) throw new Error(strength.problems.join(" "));

      const normalized = normalizeUsername(username);
      const identity = await createIdentity(password);

      const { data, error } = await supabase.auth.signUp({
        email: syntheticEmail(normalized),
        password,
      });
      if (error) {
        throw new Error(
          error.message.toLowerCase().includes("already")
            ? "That username is taken."
            : error.message,
        );
      }
      const userId = data.user?.id;
      if (!userId) throw new Error("Could not create the account. Try again.");

      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        username: normalized,
        display_name: displayName.trim() || normalized,
        public_key: identity.publicKey,
        encrypted_private_key_blob: identity.encryptedPrivateKeyBlob,
        salt: identity.salt,
      });
      if (profileError) {
        await supabase.auth.signOut();
        throw new Error(
          profileError.code === "23505"
            ? "That username is taken."
            : "Could not finish creating your account.",
        );
      }

      vault.setIdentity(identity.privateKey, identity.publicKey);
      setUnlocked(true);
      setProfile({
        id: userId,
        username: normalized,
        displayName: displayName.trim() || normalized,
        publicKey: identity.publicKey,
      });
      clearLoginFailures(normalized);
    },
    [],
  );

  const loadKeys = useCallback(async (password: string) => {
    const row = await fetchKeyMaterial();
    const privateKey = await unlockIdentity(password, row.salt, row.encrypted_private_key_blob);
    vault.setIdentity(privateKey, row.public_key);
    setUnlocked(true);
    return row;
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const normalized = normalizeUsername(username);
      const cooldown = loginCooldown(normalized);
      if (cooldown > 0) {
        throw new Error(`Too many failed attempts. Try again in ${formatCooldown(cooldown)}.`);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: syntheticEmail(normalized),
        password,
      });
      if (error || !data.user) {
        recordLoginFailure(normalized);
        throw new Error("Incorrect username or password.");
      }

      const row = await loadKeys(password);
      clearLoginFailures(normalized);
      setProfile({
        id: data.user.id,
        username: row.username,
        displayName: row.display_name,
        publicKey: row.public_key,
      });
    },
    [loadKeys],
  );

  const unlock = useCallback(
    async (password: string) => {
      try {
        await loadKeys(password);
      } catch {
        throw new Error("That password could not unlock your keys.");
      }
    },
    [loadKeys],
  );

  const signOut = useCallback(async () => {
    vault.wipeKeys();
    setUnlocked(false);
    setProfile(null);
    await supabase.auth.signOut();
  }, []);

  const setDisplayName = useCallback(
    async (displayName: string) => {
      if (!profile) return;
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", profile.id);
      if (error) throw new Error("Could not save your display name.");
      setProfile({ ...profile, displayName: displayName.trim() });
    },
    [profile],
  );

  const value = useMemo<AuthValue>(
    () => ({ loading, session, profile, unlocked, signUp, signIn, unlock, signOut, setDisplayName }),
    [loading, session, profile, unlocked, signUp, signIn, unlock, signOut, setDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
