import { supabase } from "@/integrations/supabase/client";
import {
  createConversationKey,
  decryptMessage,
  encryptMessage,
  unwrapConversationKey,
  wrapConversationKey,
  type WrappedKeyBlob,
} from "@/lib/crypto";
import * as vault from "@/lib/key-vault";
import { normalizeUsername } from "@/lib/password-policy";

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  public_key: string;
};

export type ConversationSummary = {
  id: string;
  name: string | null;
  isGroup: boolean;
  title: string;
  members: PublicProfile[];
  keyVersion: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
};

export type DecryptedMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  keyVersion: number;
};

type KeyBundle = Record<string, WrappedKeyBlob>;

/* ---------------- key bundles ---------------- */

function parseBundle(raw: string | null): KeyBundle {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as KeyBundle;
  } catch {
    return {};
  }
}

export async function loadConversationKeys(conversationId: string) {
  const cached = vault.getCachedConversationKeys(conversationId);
  if (cached) return cached;

  const privateKey = vault.requirePrivateKey();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("conversation_members")
    .select("wrapped_conversation_key, key_version")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("You are not a member of this conversation.");

  const bundle = parseBundle(data.wrapped_conversation_key);
  const keys = new Map<number, CryptoKey>();
  for (const [version, blob] of Object.entries(bundle)) {
    try {
      keys.set(Number(version), await unwrapConversationKey(blob, privateKey));
    } catch {
      // A version we cannot unwrap (e.g. rotated before we joined) is skipped.
    }
  }
  vault.cacheConversationKeys(conversationId, keys);
  return keys;
}

/* ---------------- lookups ---------------- */

export async function findProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("find_profile_by_username", {
    _username: normalizeUsername(username),
  });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as PublicProfile | undefined;
  return row ?? null;
}

/* ---------------- conversations ---------------- */

export type ReadMarker = {
  userId: string;
  lastReadMessageId: string | null;
};

/**
 * Store the reader's position server-side so read state follows them across
 * devices. Only the message id is surfaced to other members — never the time.
 */
export async function markConversationRead(
  conversationId: string,
  userId: string,
  lastReadMessageId: string | null,
) {
  if (!lastReadMessageId) return;
  await supabase.from("read_markers").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      last_read_message_id: lastReadMessageId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
}

export async function listReadMarkers(conversationId: string): Promise<ReadMarker[]> {
  const { data } = await supabase
    .from("read_markers")
    .select("user_id, last_read_message_id")
    .eq("conversation_id", conversationId);
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    lastReadMessageId: row.last_read_message_id,
  }));
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const { data: myRows, error } = await supabase
    .from("conversation_members")
    .select("conversation_id, key_version")
    .eq("user_id", userId);
  if (error) throw new Error("Could not load your chats.");
  const ids = (myRows ?? []).map((r) => r.conversation_id);
  if (!ids.length) return [];

  const [{ data: conversations }, { data: memberRows }, { data: messages }, { data: myMarkers }] =
    await Promise.all([
      supabase.from("conversations").select("id, name, is_group, created_at").in("id", ids),
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", ids),
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, ciphertext, iv, key_version, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false }),
      supabase
        .from("read_markers")
        .select("conversation_id, last_read_message_id")
        .eq("user_id", userId)
        .in("conversation_id", ids),
    ]);

  const myReadMessageId = new Map(
    (myMarkers ?? []).map((row) => [row.conversation_id, row.last_read_message_id]),
  );

  const otherIds = Array.from(
    new Set((memberRows ?? []).map((m) => m.user_id).filter((id) => id !== userId)),
  );
  const { data: profiles } = otherIds.length
    ? await supabase.from("profiles").select("id, username, display_name, public_key").in("id", otherIds)
    : { data: [] as PublicProfile[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as PublicProfile]));
  const keyVersionById = new Map((myRows ?? []).map((r) => [r.conversation_id, r.key_version]));

  type MessageRow = NonNullable<typeof messages>[number];
  const latestByConversation = new Map<string, MessageRow>();
  for (const message of messages ?? []) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message);
    }
  }

  const summaries: ConversationSummary[] = [];
  for (const conversation of conversations ?? []) {
    const members = (memberRows ?? [])
      .filter((m) => m.conversation_id === conversation.id && m.user_id !== userId)
      .map((m) => profileById.get(m.user_id))
      .filter((p): p is PublicProfile => Boolean(p));

    const latest = latestByConversation.get(conversation.id);
    let preview: string | null = null;
    if (latest) {
      try {
        const keys = await loadConversationKeys(conversation.id);
        const key = keys.get(latest.key_version);
        preview = key ? await decryptMessage(key, latest.ciphertext, latest.iv) : "Encrypted message";
      } catch {
        preview = "Encrypted message";
      }
    }

    const read = lastReadAt(conversation.id);
    summaries.push({
      id: conversation.id,
      name: conversation.name,
      isGroup: conversation.is_group,
      title:
        conversation.is_group
          ? conversation.name || "Group"
          : members[0]?.display_name || members[0]?.username || "Conversation",
      members,
      keyVersion: keyVersionById.get(conversation.id) ?? 1,
      lastMessagePreview: preview,
      lastMessageAt: latest?.created_at ?? null,
      unread: Boolean(
        latest &&
          latest.sender_id !== userId &&
          (!read || new Date(latest.created_at) > new Date(read)),
      ),
    });
  }

  summaries.sort(
    (a, b) =>
      new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
  );
  return summaries;
}

export async function getConversation(conversationId: string, userId: string) {
  const [{ data: conversation }, { data: memberRows }] = await Promise.all([
    supabase.from("conversations").select("id, name, is_group").eq("id", conversationId).maybeSingle(),
    supabase.from("conversation_members").select("user_id, key_version").eq("conversation_id", conversationId),
  ]);
  if (!conversation) throw new Error("Conversation not found.");

  const ids = (memberRows ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, public_key")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const members = (profiles ?? []) as PublicProfile[];
  const others = members.filter((m) => m.id !== userId);
  const myRow = (memberRows ?? []).find((m) => m.user_id === userId);

  return {
    id: conversation.id,
    name: conversation.name,
    isGroup: conversation.is_group,
    title: conversation.is_group
      ? conversation.name || "Group"
      : others[0]?.display_name || others[0]?.username || "Conversation",
    members,
    others,
    keyVersion: myRow?.key_version ?? 1,
  };
}

export async function createConversation(options: {
  me: PublicProfile;
  others: PublicProfile[];
  isGroup: boolean;
  name?: string | null;
}) {
  const privateKey = vault.requirePrivateKey();
  const conversationKey = await createConversationKey();

  // The id is generated here: the row cannot be read back after insert until
  // we are a member of it, so no returning select is possible.
  const conversationId = crypto.randomUUID();

  // Atomically create the conversation and the creator's membership row.
  const creatorBlob = await wrapConversationKey(
    conversationKey,
    privateKey,
    options.me.public_key,
    options.me.public_key,
  );
  const { error } = await supabase.rpc("create_conversation", {
    _id: conversationId,
    // Generated types mark _name non-null; direct chats legitimately pass null.
    _name: (options.isGroup ? options.name || "Group" : null) as string,
    _is_group: options.isGroup,
    _wrapped_key: JSON.stringify({ 1: creatorBlob }),
  });
  if (error) throw new Error("Could not start the conversation.");

  for (const member of options.others) {
    const blob = await wrapConversationKey(
      conversationKey,
      privateKey,
      options.me.public_key,
      member.public_key,
    );
    const { error: memberError } = await supabase.from("conversation_members").insert({
      conversation_id: conversationId,
      user_id: member.id,
      wrapped_conversation_key: JSON.stringify({ 1: blob }),
      key_version: 1,
    });
    if (memberError) throw new Error("Could not share the conversation key with everyone.");
  }

  vault.cacheConversationKeys(conversationId, new Map([[1, conversationKey]]));
  return conversationId;
}

export async function loadMessages(conversationId: string): Promise<DecryptedMessage[]> {
  const keys = await loadConversationKeys(conversationId);
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, ciphertext, iv, key_version, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load messages.");

  const out: DecryptedMessage[] = [];
  for (const row of data ?? []) {
    const key = keys.get(row.key_version);
    let body = "Cannot be decrypted with your keys.";
    if (key) {
      try {
        body = await decryptMessage(key, row.ciphertext, row.iv);
      } catch {
        body = "Cannot be decrypted with your keys.";
      }
    }
    out.push({
      id: row.id,
      senderId: row.sender_id,
      body,
      createdAt: row.created_at,
      keyVersion: row.key_version,
    });
  }
  return out;
}

export async function decryptSingleMessage(
  conversationId: string,
  row: { id: string; sender_id: string; ciphertext: string; iv: string; key_version: number; created_at: string },
): Promise<DecryptedMessage> {
  const keys = await loadConversationKeys(conversationId);
  const key = keys.get(row.key_version);
  let body = "Cannot be decrypted with your keys.";
  if (key) {
    try {
      body = await decryptMessage(key, row.ciphertext, row.iv);
    } catch {
      /* keep fallback */
    }
  }
  return { id: row.id, senderId: row.sender_id, body, createdAt: row.created_at, keyVersion: row.key_version };
}

export async function sendMessage(conversationId: string, senderId: string, text: string) {
  const keys = await loadConversationKeys(conversationId);
  const version = Math.max(...keys.keys());
  const key = keys.get(version);
  if (!key) throw new Error("No usable conversation key.");

  const { ciphertext, iv } = await encryptMessage(key, text);
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    ciphertext,
    iv,
    key_version: version,
  });
  if (error) throw new Error("Message could not be sent.");
}

/**
 * Remove a member and rotate the conversation key.
 *
 * Old messages stay readable under their old key version — the removed member
 * already held that key. This is a disclosed limitation, not a bug.
 */
export async function removeMemberAndRotate(options: {
  conversationId: string;
  removeUserId: string;
  me: PublicProfile;
}) {
  const privateKey = vault.requirePrivateKey();

  const { error: deleteError } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", options.conversationId)
    .eq("user_id", options.removeUserId);
  if (deleteError) throw new Error("Could not remove that member.");

  const { data: remaining } = await supabase
    .from("conversation_members")
    .select("user_id, wrapped_conversation_key, key_version")
    .eq("conversation_id", options.conversationId);

  const currentVersion = Math.max(1, ...(remaining ?? []).map((r) => r.key_version));
  const nextVersion = currentVersion + 1;
  const newKey = await createConversationKey();

  const ids = (remaining ?? []).map((r) => r.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, public_key")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const profileById = new Map(((profiles ?? []) as PublicProfile[]).map((p) => [p.id, p]));

  for (const row of remaining ?? []) {
    const member = profileById.get(row.user_id);
    if (!member) continue;
    const blob = await wrapConversationKey(newKey, privateKey, options.me.public_key, member.public_key);
    const bundle = parseBundle(row.wrapped_conversation_key);
    bundle[String(nextVersion)] = blob;
    const { error } = await supabase
      .from("conversation_members")
      .update({ wrapped_conversation_key: JSON.stringify(bundle), key_version: nextVersion })
      .eq("conversation_id", options.conversationId)
      .eq("user_id", row.user_id);
    if (error) throw new Error("Could not re-share the new key with everyone.");
  }

  vault.forgetConversation(options.conversationId);
  return nextVersion;
}
