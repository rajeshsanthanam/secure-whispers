# Fix: reactions not showing in long chats

## What's going on
Yes, it's the size of the chat. The long chat has **656 messages**, and the small chats have about 7.

- **Your reactions are being saved.** The long chat already has 80 saved reactions, the latest at 20:52 UTC today.
- **They just never appear on screen.** After a tap, the app reloads the chat's reactions by sending the ID of every message in a single request. With 656 messages, that request is far too large, so the server rejects it.
- The app treated that failure as "couldn't load reactions" and showed the error at the very top of the chat, where you'd never see it. That's why it looked like nothing happened and you got no error.

## The fix
1. Load reactions in batches of about 100 messages at a time instead of all at once. Then any chat length works, and nothing about encryption or storage changes.
2. Show "couldn't load reactions" problems as a pop-up notice at the bottom of the screen, the same way tap errors already show.
3. Remove the temporary "reaction tap / saved / failed" logs added for diagnosis.

When it's done, the 80 reactions already saved in the long chat will appear. You don't need to re-tap them.

## Verify
Sign in as a test account with a long chat (600+ messages) and tap an emoji. Confirm the pill appears and that the reactions saved earlier show up. Then recheck a small chat.

## Technical details
- `loadReactions` in `src/lib/messaging.ts` (~line 577): split `messageIds` into chunks of 100. Run the `.in("message_id", chunk)` queries with `Promise.all`, merge the rows, then decrypt as today. This is an in-place edit of that function only.
- `refreshReactions` in `chats.$id.tsx` (~118): replace `setError` with `toast.error` (one line).
- Remove the three `console.*` lines in `handleReaction`, keeping the timeout and busy handling.
- Check that no other `.in(...)` call grows with message count. The read markers query is by conversation, so it's fine.
