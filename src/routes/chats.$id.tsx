import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Pencil, Reply, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { Protected } from "@/components/Protected";
import { PhotoAttachment } from "@/components/PhotoAttachment";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { clearAttachmentCache, clearCachedAttachment } from "@/lib/attachment-cache";
import { EmojiPickerSheet } from "@/components/EmojiPickerSheet";
import {
  decryptSingleMessage,
  deleteMessage,
  editMessage,
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

const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "👏", "😍", "🤔", "👎", "💯", "🙄"];

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
  const [fullPickerFor, setFullPickerFor] = useState<string | null>(null);
  const [reactionPending, setReactionPending] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<string | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState<string | null>(null);
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const messageIdsRef = useRef<string[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reactionPicker) {
      pickerRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [reactionPicker]);
  const myId = profile?.id ?? null;

  useEffect(() => () => clearAttachmentCache(id), [id]);
  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); }, []);
  useEffect(() => { setReplyingToId(null); setHighlightedId(null); }, [id]);

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
      toast.error((reactionError as Error).message);
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
         { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
           if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") return;
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
            reply_to_message_id: string | null;
             deleted_at: string | null;
            edited_at: string | null;
          };
          void decryptSingleMessage(id, row).then((message) => {
             if (message.deletedAt) {
               clearCachedAttachment(message.id);
               setOpenPhoto(null);
               setReactionPicker((current) => current === message.id ? null : current);
               setReactions((current) => { const next = { ...current }; delete next[message.id]; return next; });
             }
             setMessages((current) => {
               const index = current.findIndex((existing) => existing.id === message.id);
               if (index < 0) return payload.eventType === "INSERT" ? [...current, message] : current;
               const next = [...current];
               next[index] = message;
               return next;
             });
             if (payload.eventType === "INSERT" && myId) void markConversationRead(id, myId, message.id);
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
    if (editingId) {
      const editId = editingId;
      const previous = messages.find((m) => m.id === editId);
      setDraft("");
      setEditingId(null);
      if (previous && previous.body === text) return;
      try {
        const result = await editMessage(editId, id, null, text);
        setMessages((current) => current.map((m) => m.id === editId ? { ...m, body: text, editedAt: result.editedAt, keyVersion: result.keyVersion } : m));
      } catch (editError) {
        setError((editError as Error).message);
        setEditingId(editId);
        setDraft(text);
      }
      return;
    }
    const replyId = replyingToId;
    setDraft("");
    try {
      await sendMessage(id, profile.id, text, replyId);
      setReplyingToId((current) => current === replyId ? null : current);
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
    const replyId = replyingToId;
    try {
      await sendImageMessage(id, profile.id, file, caption, replyId);
      setDraft("");
      setReplyingToId((current) => current === replyId ? null : current);
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
    if (!profile) { toast.error("You're signed out — sign in again to react."); return; }
    if (reactionPending) { toast("Still saving your last reaction…"); return; }
    setReactionPending(messageId);
    setReactionPicker(null);
    setError(null);
    try {
      await Promise.race([
        toggleReaction(id, messageId, profile.id, emoji),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Reaction didn't go through — try again.")), 15000)),
      ]);
      await refreshReactions();
    } catch (reactionError) {
      toast.error((reactionError as Error).message);
    } finally {
      setReactionPending(null);
    }
  }

  async function handleDelete(messageId: string) {
    if (deletingMessage || !window.confirm("Delete this message for everyone? This cannot be undone.")) return;
    setDeletingMessage(messageId);
    setError(null);
    if (editingId === messageId) { setEditingId(null); setDraft(""); }
    try {
      await deleteMessage(messageId, id);
      clearCachedAttachment(messageId);
      setOpenPhoto(null);
      setReactionPicker((current) => current === messageId ? null : current);
      setReactions((current) => { const next = { ...current }; delete next[messageId]; return next; });
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, deletedAt: new Date().toISOString(), body: "", kind: "text", attachmentPath: null, attachmentIv: null }
        : message));
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setDeletingMessage(null);
    }
  }

  const others = conversation?.others ?? [];
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const photoMessages = messages.filter((message) => message.kind === "image" && !message.deletedAt);
  const replyingTo = replyingToId ? messageById.get(replyingToId) : undefined;

  function replySummary(message: DecryptedMessage | undefined) {
    if (!message) return { sender: "Replying to a message", preview: "" };
    if (message.deletedAt) return { sender: "Replying to a deleted message", preview: "" };
    const sender = message.senderId === profile?.id
      ? "You"
      : conversation?.members.find((person) => person.id === message.senderId)?.display_name
        || conversation?.members.find((person) => person.id === message.senderId)?.username
        || "Unknown";
    return { sender, preview: message.kind === "image" ? "Photo" : message.body };
  }

  function jumpToMessage(messageId: string) {
    const target = document.getElementById(`message-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(messageId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1800);
  }

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
            const quoted = message.replyToMessageId ? replySummary(messageById.get(message.replyToMessageId)) : null;
            return (
              <div id={`message-${message.id}`} key={message.id} className={`group flex rounded-md transition-colors ${mine ? "justify-end" : "justify-start"} ${highlightedId === message.id ? "bg-accent/15" : ""}`}>
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
                       {!message.deletedAt && quoted ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => { if (message.replyToMessageId) jumpToMessage(message.replyToMessageId); }}
                          className="mb-2 flex h-auto max-w-full flex-col items-start gap-0.5 border-l-2 border-accent/60 bg-background/20 px-2 py-1 text-left text-inherit hover:bg-background/30 hover:text-inherit"
                          title={messageById.has(message.replyToMessageId ?? "") ? "Jump to original message" : "Original message not loaded"}
                        >
                          <span className="max-w-full truncate text-xs font-semibold text-accent-soft">{quoted.sender}</span>
                          {quoted.preview ? <span className="max-w-full truncate text-xs font-normal text-mist">{quoted.preview}</span> : null}
                        </Button>
                      ) : null}
                       {message.deletedAt ? (
                         <span className="italic text-mist/60">This message was deleted</span>
                       ) : message.kind === "image" ? (
                        <div className="max-w-full space-y-2">
                           <PhotoAttachment conversationId={id} message={message} onOpen={() => setOpenPhoto(message.id)} />
                          {message.body ? <p>{message.body}</p> : null}
                        </div>
                      ) : message.body}
                    </div>
                     {!message.deletedAt ? <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Reply to message"
                        title="Reply to message"
                        onClick={() => { setReplyingToId(message.id); setReactionPicker(null); }}
                        className="size-7 text-mist/70 opacity-60 hover:opacity-100 hover:text-accent-soft focus-visible:opacity-100"
                      >
                        <Reply />
                      </Button>
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
                       {mine && message.kind === "text" ? (
                         <Button type="button" variant="ghost" size="icon" aria-label="Edit message" title="Edit message" onClick={() => { setEditingId(message.id); setReplyingToId(null); setReactionPicker(null); setDraft(message.body); }} className="size-7 text-mist/70 opacity-60 hover:opacity-100 hover:text-accent-soft focus-visible:opacity-100"><Pencil /></Button>
                       ) : null}
                       {mine ? (
                         <Button type="button" variant="ghost" size="icon" aria-label="Delete message" title="Delete message" disabled={deletingMessage === message.id} onClick={() => void handleDelete(message.id)} className="size-7 text-mist/70 opacity-60 hover:opacity-100 hover:text-destructive focus-visible:opacity-100"><Trash2 /></Button>
                       ) : null}
                     </div> : null}
                  </div>
                   {!message.deletedAt && reactionPicker === message.id ? (
                    <div ref={reactionPicker === message.id ? pickerRef : undefined} className={`mt-1 flex max-w-full flex-wrap gap-0.5 rounded-md p-1.5 edge glass-strong ${mine ? "justify-end" : "justify-start"}`} role="group" aria-label="Choose a reaction">
                      {REACTION_EMOJI.map((emoji) => (
                        <Button key={emoji} type="button" variant="ghost" size="icon" className="size-8 text-lg" aria-label={`React ${emoji}`} disabled={Boolean(reactionPending)} aria-busy={Boolean(reactionPending)} onClick={() => void handleReaction(message.id, emoji)}>{emoji}</Button>
                      ))}
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-lg text-accent-soft" aria-label="More emoji" title="More emoji" onClick={() => setFullPickerFor(message.id)}>+</Button>
                    </div>
                  ) : null}
                   {!message.deletedAt && Object.entries(reactions[message.id] ?? {}).length ? (
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
                    {message.editedAt && !message.deletedAt ? <span className="ml-1">(edited)</span> : null}
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
          {editingId ? (
            <div className="mb-2 flex items-center gap-2 border-l-2 border-accent/60 bg-background/20 px-2 py-1.5 text-xs" role="status">
              <p className="flex-1 font-semibold text-accent-soft">Editing message</p>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-mist" onClick={() => { setEditingId(null); setDraft(""); }}>Cancel</Button>
            </div>
          ) : null}
          {replyingToId && !editingId ? (
            <div className="mb-2 flex items-center gap-2 border-l-2 border-accent/60 bg-background/20 px-2 py-1.5" role="status">
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-semibold text-accent-soft">{replySummary(replyingTo).sender}</p>
                {replySummary(replyingTo).preview ? <p className="truncate text-mist">{replySummary(replyingTo).preview}</p> : null}
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Cancel reply" title="Cancel reply" className="size-7 shrink-0 text-mist" onClick={() => setReplyingToId(null)}><X /></Button>
            </div>
          ) : null}
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 edge glass-plain">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a photo" onChange={(event) => void handlePhoto(event.target.files?.[0])} />
            <Button type="button" variant="ghost" size="icon" title="Add photo" aria-label="Add photo" disabled={Boolean(sendingPhoto) || Boolean(editingId)} onClick={() => fileRef.current?.click()} className="size-8 shrink-0 text-accent-soft"><ImagePlus /></Button>
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
        <PhotoCarousel conversationId={id} messages={photoMessages} selectedMessageId={openPhoto} onClose={() => setOpenPhoto(null)} />
      ) : null}
      <EmojiPickerSheet
        open={Boolean(fullPickerFor)}
        onOpenChange={(open) => { if (!open) setFullPickerFor(null); }}
        onPick={(emoji) => { const target = fullPickerFor; setFullPickerFor(null); if (target) void handleReaction(target, emoji); }}
      />
    </AppShell>
  );
}
