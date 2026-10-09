# Photos button: browse every photo in a chat

## Experience
- A "Photos" icon button sits next to the "← Chats" pill in every conversation header. It is always visible, with no hover needed.
- Tapping it opens the photo carousel on the newest photo in the chat, even when that photo's message isn't loaded in the thread.
- Swiping back toward older photos fetches more, 40 at a time, without changing the photo on screen.
- The counter reads "N of total" for the whole chat, not just the loaded part.
- If the chat has no photos, a pop-up says "No photos in this chat yet". If loading fails, it says "Could not load photos."
- Tapping a photo inside the thread behaves exactly as it does today.

## Privacy and memory
- Only photo messages the person can already see are listed. The existing member-only access rule applies, so no database change is needed.
- Photo files are still decrypted in the browser one at a time: the current photo plus its neighbors.
- When the gallery closes, decrypted photos that are only held for the gallery (not part of the chat's loaded messages) are released from memory, which keeps phones lean.

## Technical details
- `src/lib/messaging.ts` (additions only):
  - `loadConversationPhotos(conversationId, { before?, limit = 40 })`: selects only the mapper's columns, filtered by `kind = 'image'` and `deleted_at IS NULL`, ordered `created_at desc, id desc`, with `.lt("created_at", before)` when `before` is given. Each row goes through the existing `decryptSingleMessage`, so there is no second copy of the decryption logic. Returns `{ photos (oldest first), hasMore: rows === limit }`.
  - `countConversationPhotos(conversationId)`: `select("id", { count: "exact", head: true })` with the same filters.
  - Neither function downloads or decrypts photo files.
- `src/components/PhotoCarousel.tsx` (in-place edits only):
  - New optional props: `total`, `hasMoreOlder`, `onNeedOlder`.
  - An effect calls `onNeedOlder` when `currentIndex < 5 && hasMoreOlder`, with a ref guard against concurrent calls. Position is already tracked by `activeId`, so photos added at the start keep the same one on screen.
  - The counter is `total - (messages.length - 1 - currentIndex)` when `total` is given; otherwise it stays as today.
  - Sender name and date: the carousel shows neither today. The spec says to keep them visible, so I'll add an optional `senderName(id)` lookup and show both next to the counter. Thread-opened carousels get these too.
- `src/routes/chats.$id.tsx` (in-place edits only):
  - Gallery state holds the photos, `hasMore`, `total` and the selected id.
  - Button handler: `Promise.all([loadConversationPhotos, countConversationPhotos])`, then a toast when there are none, or open on the last (newest) photo. Errors go to `toast.error`.
  - `onNeedOlder` adds the next page in front, skipping duplicates.
  - On close: call `clearCachedAttachment` for each gallery photo id that isn't in `messagesRef.current`.
  - The thread's carousel, message loading, reactions and realtime subscriptions stay untouched.

## Verification
- Two accounts, a chat with more than 50 messages, and photos sent before the newest 50 messages.
- Photos button: opens on the newest photo, the counter matches the real total, and swiping back reaches the oldest photo while older pages load.
- Empty chat: the "No photos" pop-up appears.
- Tapping a photo in the thread still works as before, with no page errors.
