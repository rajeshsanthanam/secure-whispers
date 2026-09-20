import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

/**
 * Gates a screen on both a session AND in-memory key material. Keys never
 * persist, so after a reload the password is needed again to unwrap them.
 */
export function Protected({ children }: { children: ReactNode }) {
  const { loading, session, unlocked, unlock, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <AppShell footer={<span />}>
        <div className="rounded-3xl p-8 text-sm text-mist edge glass">Loading…</div>
      </AppShell>
    );
  }

  if (!unlocked) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-3xl p-6 edge glass">
          <h1 className="font-display text-xl font-semibold text-foreground">Unlock your keys</h1>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            Your private key is only ever held in memory, so it is gone after a reload. Enter your
            password to decrypt it again.
          </p>
          <form
            className="mt-5 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await unlock(password);
                setPassword("");
              } catch (unlockError) {
                setError((unlockError as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-xl px-4 py-3 text-sm text-foreground edge glass-plain outline-none placeholder:text-mist/50 focus:outline-accent/40"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !password}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-opacity disabled:opacity-40"
            >
              {busy ? "Decrypting…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate({ to: "/", replace: true });
              }}
              className="w-full rounded-xl px-4 py-2 text-xs font-medium text-mist edge glass-plain"
            >
              Sign out instead
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}
