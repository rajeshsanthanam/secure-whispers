import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/lib/auth";
import { keyFingerprint } from "@/lib/crypto";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — Secure Messenger" },
      {
        name: "description",
        content:
          "Your display name, username, key fingerprint, and the current limitations of this app's encryption.",
      },
      { property: "og:title", content: "Your profile — Secure Messenger" },
      {
        property: "og:description",
        content: "Your display name, username, key fingerprint, and current encryption limitations.",
      },
    ],
  }),
  component: () => (
    <Protected>
      <ProfileScreen />
    </Protected>
  ),
});

function ProfileScreen() {
  const { profile, signOut, setDisplayName } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [fingerprint, setFingerprint] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.displayName ?? "");
    if (profile?.publicKey) void keyFingerprint(profile.publicKey).then(setFingerprint);
  }, [profile]);

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-3xl p-6 edge glass">
          <div className="flex items-center gap-3">
            <Avatar label={profile?.displayName || profile?.username || "?"} />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-foreground">
                {profile?.displayName || profile?.username}
              </p>
              <p className="truncate text-xs text-mist/70">@{profile?.username}</p>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-mist uppercase">
              Display name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm text-foreground edge glass-plain outline-none placeholder:text-mist/50 focus:outline-accent/40"
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              setStatus(null);
              try {
                await setDisplayName(name);
                setStatus("Saved.");
              } catch (saveError) {
                setStatus((saveError as Error).message);
              }
            }}
            className="mt-3 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground"
          >
            Save
          </button>
          {status ? <p className="mt-2 text-xs text-mist">{status}</p> : null}

          <div className="mt-6 rounded-2xl p-4 edge glass-plain">
            <p className="text-[10px] font-medium tracking-[0.15em] text-mist/60 uppercase">
              Key fingerprint
            </p>
            <p className="mt-2 font-mono text-[12px] leading-relaxed break-all text-foreground/90">
              {fingerprint || "…"}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-mist/60">
              A future release will let you compare this with a contact in person to verify their
              keys. Today it is shown for reference only.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
            className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-medium text-mist edge glass-plain hover:text-destructive"
          >
            Sign out and wipe keys from memory
          </button>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl p-6 edge glass">
            <h2 className="font-display text-lg font-semibold text-foreground">How it works</h2>
            <ul className="mt-4 space-y-3 text-sm text-mist">
              {[
                "Your identity is an ECDH P-256 key pair created in your browser.",
                "Your private key is encrypted with a key derived from your password (PBKDF2, 250,000 iterations) before anything is uploaded.",
                "Each conversation has a random AES-GCM 256 key, wrapped separately for every member.",
                "Every message uses a fresh random IV; only ciphertext reaches the server.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
