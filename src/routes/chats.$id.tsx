import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { Protected } from "@/components/Protected";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  decryptSingleMessage,
  getConversation,
  loadMessages,
  markConversationRead,
  removeMemberAndRotate,
  sendMessage,
  type DecryptedMessage,
  type PublicProfile,
} from "@/lib/messaging";

export const Route = createFileRoute("/chats/$id")({
  head: () => ({
    meta: [
      { title: "Conversation — Secure Messenger" },
      {
        name: "description",
        content: "An end-to-end encrypted conversation, decrypted locally in your browser.",
      },
      { property: "og:title", content: "Conversation — Secure Messenger" },
      {
        property: "og:description",
        content: "An end-to-end encrypted conversation, decrypted locally in your browser.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <Protected>
      <ConversationScreen />
    </Protected>
  ),
});

type Conversation = Awaited<ReturnType<typeof getConversation>>;

function ConversationScreen() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      const [meta, history] = await Promise.all([getConversation(id, profile.id), loadMessages(id)]);
      setConversation(meta);
      setMessages(history);
      markConversationRead(id, history.at(-1)?.createdAt ?? null);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }, [id, profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            sender_id: string;
            ciphertext: string;
            iv: string;
            key_version: number;
            created_at: string;
          };
          void decryptSingleMessage(id, row).then((message) => {
            setMessages((current) =>
              current.some((existing) => existing.id === message.id)
                ? current
                : [...current, message],
            );
            markConversationRead(id, message.createdAt);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || !draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    try {
      await sendMessage(id, profile.id, text);
    } catch (sendError) {
      setError((sendError as Error).message);
      setDraft(text);
    }
  }

  async function handleRemove(member: PublicProfile) {
    if (!profile) return;
    try {
      await removeMemberAndRotate({
        conversationId: id,
        removeUserId: member.id,
        me: {
          id: profile.id,
          username: profile.username,
          display_name: profile.displayName,
          public_key: profile.publicKey,
        },
      });
      await refresh();
    } catch (removeError) {
      setError((removeError as Error).message);
    }
  }

  const others = conversation?.others ?? [];

  return (
    <AppShell>
      <div className="flex h-[70vh] flex-col overflow-hidden rounded-3xl edge glass">
        <div className="flex items-center gap-3 border-b px-4 py-4 sm:px-5">
          <Link
            to="/chats"
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-mist edge glass transition-colors hover:text-foreground"
          >
            <span>←</span>
            <span>Chats</span>
          </Link>
          <Avatar label={conversation?.title ?? "?"} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-foreground">
              {conversation?.title ?? "Loading…"}
            </p>
            <p className="truncate text-xs text-mist/70">
              {conversation?.isGroup
                ? `${others.length + 1} members · key v${conversation?.keyVersion ?? 1}`
                : others[0]
                  ? `@${others[0].username} · E2E encrypted`
                  : "E2E encrypted"}
            </p>
          </div>
          {conversation?.isGroup ? (
            <button
              type="button"
              onClick={() => setShowMembers((value) => !value)}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-mist edge glass-plain hover:text-foreground"
            >
              Members
            </button>
          ) : null}
        </div>

        {showMembers && conversation?.isGroup ? (
          <div className="border-b px-4 py-3 sm:px-5">
            <p className="text-xs tracking-wide text-mist/70 uppercase">Members</p>
            <ul className="mt-2 space-y-1.5">
              {others.map((member) => (
                <li key={member.id} className="flex items-center gap-3 rounded-xl p-2 glass-plain">
                  <Avatar label={member.display_name || member.username} size="sm" tone="muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {member.display_name || member.username}
                    </p>
                    <p className="truncate text-xs text-mist/60">@{member.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(member)}
                    className="text-xs text-mist hover:text-destructive"
                  >
                    Remove & rotate key
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-mist/60">
              Removing someone creates a new conversation key for everyone who stays. Earlier
              messages keep their old key version, which the removed member already had.
            </p>
          </div>
        ) : null}

        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-6 sm:px-5">
          <div className="flex justify-center">
            <span className="rounded-full px-3 py-1 text-[10px] font-medium tracking-[0.15em] text-mist/60 uppercase edge glass-plain">
              Encrypted end-to-end
            </span>
          </div>

          {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}

          {messages.map((message) => {
            const mine = message.senderId === profile?.id;
            const sender = others.find((person) => person.id === message.senderId);
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%]">
                  {conversation?.isGroup && !mine ? (
                    <p className="mb-1 px-1 text-[10px] text-mist/60">
                      {sender?.display_name || sender?.username || "Unknown"}
                    </p>
                  ) : null}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      mine
                        ? "rounded-tr-md text-foreground bubble-mine"
                        : "rounded-tl-md text-mist edge glass-strong"
                    }`}
                  >
                    {message.body}
                  </div>
                  <p
                    className={`mt-1 px-1 text-[10px] text-mist/50 ${mine ? "text-right" : "text-left"}`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form className="border-t px-4 py-3" onSubmit={handleSend}>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 edge glass-plain">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent-soft">
              ✳
            </span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Message ${conversation?.title ?? ""}…`}
              className="flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-mist/50"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              ↑
            </button>
          </div>
        </form>
      </div>

      {!conversation && !error ? (
        <button
          type="button"
          onClick={() => navigate({ to: "/chats" })}
          className="mt-4 text-xs text-mist hover:text-foreground"
        >
          Back to chats
        </button>
      ) : null}
    </AppShell>
  );
}
