# Chat stats page (metadata only)

## Why this keeps messages private
Message text, captions, photos, and reactions are scrambled in the browser before they're saved. The server can't read them. The server does store plain facts about each message: when it was sent, who sent it, whether it's text or a photo, and whether it was edited or deleted. The report only counts those facts. It never opens or unscrambles any message.

## What you'll see
A new **Stats** page, reached from a link on your Profile page:
- A chat picker: "All my chats" or one specific chat
- Totals: messages, photos, text messages, edited, deleted, reactions
- Messages per day for the last 30 days, as a simple bar chart
- Messages per person in the chosen chat (names only, no content)
- First and latest message dates

Each person sees stats only for chats they belong to.

## Technical details
- New database function `get_my_chat_stats(_conversation_id uuid default null)`, SECURITY INVOKER so existing member-only RLS applies. It returns aggregates only: counts by kind, edited_at/deleted_at counts, reaction row counts, daily buckets (`date_trunc('day', created_at)`), and per-sender counts. It never selects ciphertext, iv, or attachment fields.
- New route `src/routes/stats.tsx`, wrapped in Protected and AppShell, with its own head() metadata. Data is fetched with useQuery from the browser client (rpc), keyed by the selected chat. The chat list comes from the existing conversations query.
- Bar chart built with plain token-styled divs; no new library.
- Profile page gets one added "Chat stats" link (edited in place).
- AGENTS.md: add a rule that reports aggregate metadata only through invoker-rights functions and never read encrypted columns.
