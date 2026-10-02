import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Protected } from "@/components/Protected";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { listConversations } from "@/lib/messaging";

type Stats = {
  total: number;
  photos: number;
  texts: number;
  edited: number;
  deleted: number;
  reactions: number;
  first_at: string | null;
  last_at: string | null;
  per_day: { day: string; count: number }[];
  per_sender: { name: string; count: number }[];
};

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Chat stats — Secure Messenger" },
      { name: "description", content: "Counts and activity for your chats, without reading any message content." },
      { property: "og:title", content: "Chat stats — Secure Messenger" },
      { property: "og:description", content: "Message counts, photos, and daily activity for your chats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <StatsScreen />
    </Protected>
  ),
});

function StatsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const [chatId, setChatId] = useState<string>("");

  const chats = useQuery({
    queryKey: ["stats-chats", userId],
    queryFn: () => listConversations(userId),
    enabled: !!userId,
  });

  const stats = useQuery({
    queryKey: ["chat-stats", chatId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_my_chat_stats",
        chatId ? { _conversation_id: chatId } : {},
      );
      if (error) throw new Error("Could not load stats.");
      return data as unknown as Stats;
    },
  });

  const s = stats.data;
  const maxDay = Math.max(1, ...(s?.per_day ?? []).map((d) => d.count));
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-foreground">Chat stats</h1>
          <Link to="/profile" className="text-sm text-mist hover:text-foreground">← Profile</Link>
        </div>
        <p className="text-sm text-mist/70">
          Only counts and dates are used. No message, caption, or photo is opened.
        </p>

        <select
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-sm text-foreground edge glass-plain outline-none sm:w-80"
          aria-label="Choose a chat"
        >
          <option value="">All my chats</option>
          {(chats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>

        {stats.isError ? <p className="text-sm text-destructive">{(stats.error as Error).message}</p> : null}
        {!s ? (
          <p className="text-sm text-mist">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Messages", s.total],
                ["Text", s.texts],
                ["Photos", s.photos],
                ["Edited", s.edited],
                ["Deleted", s.deleted],
                ["Reactions", s.reactions],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl p-4 edge glass">
                  <p className="text-[10px] tracking-[0.15em] text-mist/60 uppercase">{label}</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-mist/70">First message: {fmt(s.first_at)} · Latest: {fmt(s.last_at)}</p>

            <section className="rounded-3xl p-6 edge glass">
              <h2 className="font-display text-lg font-semibold text-foreground">Messages per day (last 30 days)</h2>
              {s.per_day.length === 0 ? (
                <p className="mt-3 text-sm text-mist">No messages in the last 30 days.</p>
              ) : (
                <div className="mt-4 flex h-40 items-end gap-1">
                  {s.per_day.map((d) => (
                    <div
                      key={d.day}
                      title={`${new Date(d.day).toLocaleDateString()}: ${d.count}`}
                      className="flex-1 rounded-t bg-accent"
                      style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: 2 }}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl p-6 edge glass">
              <h2 className="font-display text-lg font-semibold text-foreground">Messages per person</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {s.per_sender.map((p) => (
                  <li key={p.name} className="flex justify-between text-mist">
                    <span className="truncate text-foreground">{p.name}</span>
                    <span>{p.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
