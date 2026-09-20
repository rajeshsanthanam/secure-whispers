import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { Protected } from "@/components/Protected";
import { useAuth } from "@/lib/auth";
import { createConversation, findProfileByUsername, type PublicProfile } from "@/lib/messaging";

type Search = { group: boolean };

export const Route = createFileRoute("/new")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    group: search["group"] === true || search["group"] === "true",
  }),
  head: () => ({
    meta: [
      { title: "Start a conversation — Secure Messenger" },
      {
        name: "description",
        content: "Find people by their exact username and start an encrypted chat or group.",
      },
      { property: "og:title", content: "Start a conversation — Secure Messenger" },
      {
        property: "og:description",
        content: "Find people by their exact username and start an encrypted chat or group.",
      },
    ],
  }),
  component: () => (
    <Protected>
      <NewConversationScreen />
    </Protected>
  ),
});

function NewConversationScreen() {
  const { group } = Route.useSearch();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [isGroup, setIsGroup] = useState(group);
  const [username, setUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<PublicProfile[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);
    const found = await findProfileByUsername(username);
    if (!found) {
      setStatus("No account with that exact username.");
      return;
    }
    if (found.id === profile?.id) {
      setStatus("That is you.");
      return;
    }
    if (selected.some((person) => person.id === found.id)) {
      setStatus("Already selected.");
      return;
    }
    setSelected((current) => (isGroup ? [...current, found] : [found]));
    setUsername("");
  }

  async function handleCreate() {
    if (!profile || !selected.length) return;
    setBusy(true);
    setStatus(null);
    try {
      const id = await createConversation({
        me: {
          id: profile.id,
          username: profile.username,
          display_name: profile.displayName,
          public_key: profile.publicKey,
        },
        others: selected,
        isGroup,
        name: isGroup ? groupName : null,
      });
      navigate({ to: "/chats/$id", params: { id } });
    } catch (createError) {
      setStatus((createError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl rounded-3xl p-6 edge glass">
        <h1 className="font-display text-xl font-semibold text-foreground">
          {isGroup ? "New group" : "New chat"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          People are found by exact username only — there is no directory to browse.
        </p>

        <div className="mt-5 flex gap-1 rounded-xl p-1 edge glass-plain">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => {
                setIsGroup(value);
                setSelected((current) => (value ? current : current.slice(0, 1)));
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                isGroup === value
                  ? "bg-accent text-accent-foreground"
                  : "text-mist hover:text-foreground"
              }`}
            >
              {value ? "Group" : "Direct"}
            </button>
          ))}
        </div>

        {isGroup ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-mist uppercase">
              Group name
            </span>
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Field team"
              className="w-full rounded-xl px-4 py-3 text-sm text-foreground edge glass-plain outline-none placeholder:text-mist/50 focus:outline-accent/40"
            />
          </label>
        ) : null}

        <form className="mt-4 flex items-center gap-2" onSubmit={handleLookup}>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Exact username"
            className="flex-1 rounded-xl px-4 py-3 text-sm text-foreground edge glass-plain outline-none placeholder:text-mist/50 focus:outline-accent/40"
          />
          <button
            type="submit"
            disabled={!username.trim()}
            className="rounded-xl px-4 py-3 text-sm font-medium text-mist edge glass-plain disabled:opacity-40"
          >
            Add
          </button>
        </form>

        {status ? <p className="mt-3 text-xs text-warning">{status}</p> : null}

        {selected.length ? (
          <ul className="mt-4 space-y-1.5">
            {selected.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-3 rounded-2xl p-3 edge glass-plain"
              >
                <Avatar label={person.display_name || person.username} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {person.display_name || person.username}
                  </p>
                  <p className="truncate text-xs text-mist/70">@{person.username}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected((current) => current.filter((p) => p.id !== person.id))}
                  className="text-xs text-mist hover:text-destructive"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={handleCreate}
          disabled={busy || !selected.length || (isGroup && !groupName.trim())}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-opacity disabled:opacity-40"
        >
          {busy ? "Wrapping keys…" : isGroup ? "Create group" : "Start chat"}
        </button>
      </div>
    </AppShell>
  );
}
