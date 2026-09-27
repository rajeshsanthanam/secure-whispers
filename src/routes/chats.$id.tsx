import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { Protected } from "@/components/Protected";
import { PhotoAttachment } from "@/components/PhotoAttachment";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { clearAttachmentCache } from "@/lib/attachment-cache";
import {
  decryptSingleMessage,
  getConversation,
  loadReactions,
  listReadMarkers,
  loadMessages,
  markConversationRead,
  removeMemberAndRotate,
  sendMessage,
  sendImageMessage,
  toggleReaction,
  type DecryptedMessage,
  type PublicProfile,
  type ReadMarker,
  type MessageReactions,
} from "@/lib/messaging";

const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "👏", "😍", "🤔", "👎"];

export const Route = createFileRoute("/chats/$id")({
  head: () => ({
    meta: [
      { title: "Conversation — Secure Messenger" },
      {
        name: "description",
        content: "An end-to-end encrypted conversation, decrypted locally in your browser.",
      },
      { property: "og:title", content: "Conversation — Secure Messenger" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [readMarkers, setReadMarkers] = useState<ReadMarker[]>([]);
  const [reactions, setReactions] = useState<MessageReactions>({});
  const [reactionPicker, setReactionPicker] = useState<string | null>(null);
  const [reactionPending, setReactionPending] = useState<string | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState<string | null>(null);
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const messageIdsRef = useRef<string[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const myId = profile?.id ?? null;

  useEffect(() => () => clearAttachmentCache(id), [id]);

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      const [meta, history, markers] = await Promise.all([
        getConversation(id, profile.id),
        loadMessages(id),
        listReadMarkers(id),
      ]);
      setConversation(meta);
      setMessages(history);
      setReadMarkers(markers);
      setReactions(await loadReactions(id, history.map((message) => message.id)));
      await markConversationRead(id, profile.id, history.at(-1)?.id ?? null);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }, [id, profile]);

  messageIdsRef.current = messages.map((message) => message.id);

  const refreshReactions = useCallback(async () => {
    try {
      const ids = messageIdsRef.current;
      setReactions(await loadReactions(id, ids));
    } catch (reactionError) {
      setError((reactionError as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refreshReactions();
  }, [messages.length, refreshReactions]);

  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as { message_id?: string };
          if (row?.message_id && messageIdsRef.current.includes(row.message_id)) void refreshReactions();
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, refreshReactions]);

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
            kind: string;
            attachment_path: string | null;
            attachment_iv: string | null;
          };
          void decryptSingleMessage(id, row).then((message) => {
            setMessages((current) =>
              current.some((existing) => existing.id === message.id)
                ? current
                : [...current, message],
            );
            if (myId) void markConversationRead(id, myId, message.id);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, myId]);

  useEffect(() => {
    const channel = supabase
      .channel(`read-markers-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "read_markers", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { user_id?: string; last_read_message_id?: string | null };
          if (!row?.user_id) return;
          // Only the reader's position is tracked in state; timestamps are ignored.
          setReadMarkers((current) => {
            const next = current.filter((marker) => marker.userId !== row.user_id);
            next.push({ userId: row.user_id!, lastReadMessageId: row.last_read_message_id ?? null });
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages.length, sendingPhoto]);

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

  async function handlePhoto(file: File | undefined) {
    if (!profile || !file || sendingPhoto) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setSendingPhoto(preview);
    setError(null);
    const caption = draft.trim();
    try {
      await sendImageMessage(id, profile.id, file, caption);
      setDraft("");
    } catch (photoError) {
      setError((photoError as Error).message);
    } finally {
      setSendingPhoto(null);
      URL.revokeObjectURL(preview);
      if (fileRef.current) fileRef.current.value = "";
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

  async function handleReaction(messageId: string, emoji: string) {
    if (!profile || reactionPending) return;
    setReactionPending(messageId);
    setReactionPicker(null);
    setError(null);
    try {
      await toggleReaction(id, messageId, profile.id, emoji);
      await refreshReactions();
    } catch (reactionError) {
      setError((reactionError as Error).message);
    } finally {
      setReactionPending(null);
    }
  }

  const others = conversation?.others ?? [];

  // "Seen" applies to my newest message, once every other member's read
  // position has reached it. Their read times are never shown.
  const orderById = new Map(messages.map((message, index) => [message.id, index]));
  const myLastMessageId = [...messages].reverse().find((m) => m.senderId === myId)?.id ?? null;
  const myLastIndex = myLastMessageId ? (orderById.get(myLastMessageId) ?? -1) : -1;
  const seenByAll =
    myLastIndex >= 0 &&
    others.length > 0 &&
    others.every((member) => {
      const marker = readMarkers.find((entry) => entry.userId === member.id);
      const readId = marker?.lastReadMessageId;
      if (!readId) return false;
      const readIndex = orderById.get(readId);
      return readIndex !== undefined && readIndex >= myLastIndex;
    });


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

        <div ref={threadRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-6 sm:px-5">
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
              <div key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%]">
                  {conversation?.isGroup && !mine ? (
                    <p className="mb-1 px-1 text-[10px] text-mist/60">
                      {sender?.display_name || sender?.username || "Unknown"}
                    </p>
                  ) : null}
                  <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      className={`min-w-0 break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        mine
                          ? "rounded-tr-md text-foreground bubble-mine"
                          : "rounded-tl-md text-mist edge glass-strong"
                      }`}
                    >
                      {message.kind === "image" ? (
                        <div className="max-w-full space-y-2">
                          <PhotoAttachment conversationId={id} message={message} onOpen={setOpenPhoto} />
                          {message.body ? <p>{message.body}</p> : null}
                        </div>
                      ) : message.body}
                    </div>
                    <div className="shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="React to message"
                        title="React to message"
                        aria-expanded={reactionPicker === message.id}
                        disabled={reactionPending === message.id}
                        onClick={() => setReactionPicker((current) => current === message.id ? null : message.id)}
                        className="size-7 text-mist/70 opacity-60 hover:opacity-100 hover:text-accent-soft focus-visible:opacity-100"
                      >
                        <span aria-hidden="true">☺</span>
                      </Button>
                    </div>
                  </div>
                  {reactionPicker === message.id ? (
                    <div className={`mt-1 flex max-w-full flex-wrap gap-0.5 rounded-md p-1.5 edge glass-strong ${mine ? "justify-end" : "justify-start"}`} role="group" aria-label="Choose a reaction">
                      {REACTION_EMOJI.map((emoji) => (
                        <Button key={emoji} type="button" variant="ghost" size="icon" className="size-8 text-lg" aria-label={`React ${emoji}`} onClick={() => void handleReaction(message.id, emoji)}>{emoji}</Button>
                      ))}
                    </div>
                  ) : null}
                  {Object.entries(reactions[message.id] ?? {}).length ? (
                    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                      {Object.entries(reactions[message.id] ?? {}).map(([emoji, users]) => (
                        <Button
                          key={emoji}
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`${emoji} ${users.length} ${users.length === 1 ? "reaction" : "reactions"}${users.includes(profile?.id ?? "") ? ", including yours" : ""}`}
                          aria-pressed={users.includes(profile?.id ?? "")}
                          disabled={reactionPending === message.id}
                          onClick={() => void handleReaction(message.id, emoji)}
                          className={`h-7 gap-1 rounded-full border-border px-2 text-xs ${users.includes(profile?.id ?? "") ? "border-accent/50 bg-accent/10 text-accent-soft" : "bg-card/50 text-mist"}`}
                        >
                          <span>{emoji}</span><span>{users.length}</span>
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <p
                    className={`mt-1 px-1 text-[10px] text-mist/50 ${mine ? "text-right" : "text-left"}`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {mine && seenByAll && message.id === myLastMessageId ? (
                      <span className="ml-1.5 text-accent-soft">· Seen</span>
                    ) : null}
                  </p>
                </div>
              </div>
            );
          })}
          {sendingPhoto ? (
            <div className="flex justify-end" role="status" aria-label="Sending photo">
              <div className="max-w-[78%] rounded-2xl p-2 bubble-mine">
                <img src={sendingPhoto} alt="Photo being sent" className="max-h-48 max-w-full rounded-md object-contain opacity-70" />
                <p className="mt-1 text-xs text-foreground/70">Sending photo…</p>
              </div>
            </div>
          ) : null}
        </div>

        <form className="border-t px-4 py-3" onSubmit={handleSend}>
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 edge glass-plain">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a photo" onChange={(event) => void handlePhoto(event.target.files?.[0])} />
            <Button type="button" variant="ghost" size="icon" title="Add photo" aria-label="Add photo" disabled={Boolean(sendingPhoto)} onClick={() => fileRef.current?.click()} className="size-8 shrink-0 text-accent-soft"><ImagePlus /></Button>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Message ${conversation?.title ?? ""}…`}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-mist/50"
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
      {openPhoto ? (
        <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4" onClick={() => setOpenPhoto(null)} onKeyDown={(event) => { if (event.key === "Escape") setOpenPhoto(null); }}>
          <Button type="button" variant="ghost" size="icon" aria-label="Close photo" className="absolute right-4 top-4 text-foreground" onClick={() => setOpenPhoto(null)}><X /></Button>
          <img src={openPhoto} alt="Shared photo enlarged" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </AppShell>
  );
}
