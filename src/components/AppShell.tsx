import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Aura } from "@/components/Aura";

export function AppShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <Aura />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
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
          </nav>
        </header>

        <div className="mt-8">{children}</div>

        {footer ?? <LimitationsPanel />}
      </div>
    </div>
  );
}

export function LimitationsPanel() {
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-3xl p-4 edge glass sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning outline-1 outline-warning/25">
          !
        </span>
        <p className="max-w-md text-sm leading-relaxed text-mist">
          <span className="font-semibold text-foreground">Current limitations:</span> this protects
          message content from the server operator, but has no forward secrecy and no out-of-band
          key verification.{" "}
          <Link to="/profile" className="text-accent-soft underline-offset-2 hover:underline">
            Read the details
          </Link>
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-accent/8 px-3 py-1.5 text-xs font-medium text-accent-soft outline-1 outline-accent/25">
        No password recovery
      </span>
    </div>
  );
}
