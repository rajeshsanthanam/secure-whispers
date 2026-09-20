import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/lib/auth";
import { listConversations, type ConversationSummary } from "@/lib/messaging";

export const Route = createFileRoute("/chats/")({
  head: () => ({
    meta: [
      { title: "Your chats — Secure Messenger" },
      { name: "description", content: "Your encrypted conversations, decrypted in this browser." },
      { property: "og:title", content: "Your chats — Secure Messenger" },
      {
        property: "og:description",
        content: "Your encrypted conversations, decrypted in this browser.",
      },
    ],
  }),
  component: () => (
    <Protected>
      <ChatsScreen />
    </Protected>
  ),
});

function ChatsScreen() {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setConversations(await listConversations(profile.id));
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = (conversations ?? []).filter((conversation) => {
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return (
      conversation.title.toLowerCase().includes(needle) ||
      conversation.members.some((member) => member.username.toLowerCase().includes(needle))
    );
  });

  return (
    <AppShell>
      <div className="rounded-3xl p-4 edge glass sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-4">
          <h1 className="font-display text-lg font-semibold text-foreground">Chats</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/new"
              search={{ group: false }}
              className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
            >
              New chat
            </Link>
            <Link
              to="/new"
              search={{ group: true }}
              className="rounded-xl px-3 py-2 text-xs font-medium text-mist edge glass-plain hover:text-foreground"
            >
              New group
            </Link>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5 edge glass-plain">
          <span className="text-mist/60">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your chats…"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-mist/50"
          />
        </div>

        {error ? <p className="px-1 pb-3 text-xs text-destructive">{error}</p> : null}

        {conversations === null ? (
          <p className="px-1 py-6 text-sm text-mist">Decrypting your chats…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl p-6 text-sm text-mist edge glass-plain">
            No conversations yet. Start one with an exact username.
          </div>
        ) : (
          <nav className="space-y-1.5">
            {filtered.map((conversation) => (
              <Link
                key={conversation.id}
                to="/chats/$id"
                params={{ id: conversation.id }}
                className="block rounded-2xl p-3 transition-colors glass-hover hover:glass-strong"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    label={conversation.title}
                    tone={conversation.unread ? "accent" : "muted"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {conversation.title}
                        {conversation.isGroup ? (
                          <span className="ml-2 text-[10px] font-medium tracking-wide text-mist/70 uppercase">
                            group · {conversation.members.length + 1}
                          </span>
                        ) : null}
                      </p>
                      <span className="shrink-0 text-[10px] text-mist/60">
                        {formatWhen(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-mist/70">
                      {conversation.lastMessagePreview ?? "No messages yet"}
                    </p>
                  </div>
                  {conversation.unread ? (
                    <span className="size-2.5 shrink-0 rounded-full bg-accent" />
                  ) : null}
                </div>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </AppShell>
  );
}

export function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const withinWeek = now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000;
  if (withinWeek) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
