import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { Aura } from "@/components/Aura";
import { useAuth } from "@/lib/auth";

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    const confirmed = window.confirm(
      "Sign out? Your encryption keys are wiped from this browser's memory, so you'll need your password to unlock your messages again.",
    );
    if (!confirmed) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <Aura />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-background/80 backdrop-blur">
          <Link to="/chats" className="flex items-center gap-3">
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
          </Link>
          <nav className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full px-3 py-1.5 edge glass sm:flex">
              <span className="size-2 rounded-full bg-success" />
              <span className="text-xs font-medium text-mist">Encrypted session active</span>
            </div>
            <Link
              to="/chats"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-mist edge glass transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              Chats
            </Link>
            <Link
              to="/profile"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-mist edge glass transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-mist edge glass transition-colors hover:text-foreground disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </nav>
        </header>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
