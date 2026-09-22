import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Aura } from "@/components/Aura";
import { useAuth } from "@/lib/auth";
import { checkPassword } from "@/lib/password-policy";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Secure Messenger — encrypted chat, username only" },
      {
        name: "description",
        content:
          "Sign in with a username and password. Messages are encrypted in your browser; keys never leave your device unencrypted.",
      },
      { property: "og:title", content: "Secure Messenger — encrypted chat, username only" },
      {
        property: "og:description",
        content:
          "End-to-end encrypted messaging with username-only sign-in and no email collection.",
      },
    ],
  }),
  component: WelcomeScreen,
});

function WelcomeScreen() {
  const { session, unlocked, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && unlocked) navigate({ to: "/chats", replace: true });
  }, [session, unlocked, navigate]);

  const strength = checkPassword(password);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signUp(username, password, displayName);
      } else {
        await signIn(username, password);
      }
      setPassword("");
      navigate({ to: "/chats", replace: true });
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <Aura />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-12 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-accent/15 outline-1 outline-accent/30">
            <span className="size-3.5 rounded-full bg-accent shadow-[0_0_14px] shadow-accent" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold leading-none text-foreground">
              Secure Messenger
            </p>
            <p className="mt-1 text-[11px] font-medium tracking-[0.2em] text-mist/70 uppercase">
              End-to-end · E2E
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="rounded-3xl p-6 edge glass sm:p-8">
            <h1 className="font-display text-3xl font-semibold text-balance text-foreground sm:text-4xl">
              Messages nobody else can read.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">
              Your keys are generated and unlocked inside your browser. The server only ever stores
              ciphertext, your public key, and your private key encrypted with your password.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-mist">
              {[
                "Username and password only — no email or phone.",
                "ECDH P-256 identity, AES-GCM 256 message keys.",
                "Private key wrapped with PBKDF2, 250,000 iterations.",
                "Signing out wipes every key from memory.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl p-6 edge glass">
            <div className="flex gap-1 rounded-xl p-1 edge glass-plain">
              {(["signin", "signup"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                    mode === value
                      ? "bg-accent text-accent-foreground"
                      : "text-mist hover:text-foreground"
                  }`}
                >
                  {value === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
              <Field
                label="Username"
                value={username}
                onChange={setUsername}
                placeholder="maya.voss"
                autoComplete="username"
              />
              {mode === "signup" ? (
                <Field
                  label="Display name"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Maya Voss"
                  autoComplete="nickname"
                />
              ) : null}
              <Field
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="At least 10 characters"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />

              {mode === "signup" && password ? (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <span
                        key={index}
                        className={`h-1 flex-1 rounded-full ${
                          index < strength.score ? "bg-accent" : "bg-mist/20"
                        }`}
                      />
                    ))}
                  </div>
                  {strength.problems.map((problem) => (
                    <p key={problem} className="text-xs text-warning">
                      {problem}
                    </p>
                  ))}
                </div>
              ) : null}

              {mode === "signup" ? (
                <div className="rounded-xl border-2 border-warning/40 bg-warning/10 p-3.5">
                  <p className="text-[13px] leading-relaxed font-medium text-warning">
                    There is no password recovery. If you forget your password, your account and
                    message history cannot be recovered.
                  </p>
                </div>
              ) : null}

              {error ? <p className="text-xs text-destructive">{error}</p> : null}

              <button
                type="submit"
                disabled={busy || !username || !password}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-opacity disabled:opacity-40"
              >
                {busy
                  ? mode === "signup"
                    ? "Generating your keys…"
                    : "Unlocking…"
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-mist uppercase">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl px-4 py-3 text-sm text-foreground edge glass-plain outline-none placeholder:text-mist/50 focus:outline-accent/40"
      />
    </label>
  );
}
