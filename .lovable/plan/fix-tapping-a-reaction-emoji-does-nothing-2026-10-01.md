# Fix: tapping a reaction emoji does nothing

## What I found so far
- The database shows only **one** reaction ever saved in the conversation you're testing, at 20:15 UTC. Nothing was saved after that, so your later taps never got through.
- Another test conversation saved reactions as recently as 20:52 UTC. Saving reactions works in general, so the problem is specific to your situation.
- Two weak spots in the chat screen fit "nothing happens" (not yet confirmed):
  1. **Silent ignore:** while one reaction is saving, every other tap is quietly dropped. The quick-row emoji don't look disabled during that time. If a save stalls, every later tap does nothing, and you get no message.
  2. **Hidden error:** if a save fails, the error appears at the very top of the message list. In a long chat that's off screen, so a failure looks like nothing happened.

## Step 1 — Confirm the cause
- Sign in as a test user in a conversation like yours and tap a quick-row emoji. Record the screen messages, saves, and errors at the moment of the tap.
- Add three temporary log lines to the reaction handler: "tap", "saved", and "failed + reason". They're added in place, and nothing around them changes.

## Step 2 — Fix, whatever the cause turns out to be
- Show reaction errors as a pop-up notice at the bottom of the screen, where you'll always see them, with the real reason.
- While a reaction is saving, dim the emoji buttons and show that they're busy, instead of silently dropping taps.
- Add a time limit: if a save takes more than about 15 seconds, stop waiting, unlock the buttons, and show "Reaction didn't go through — try again".
- If Step 1 finds a specific failure, such as a key or permission problem in this conversation, fix that directly.

## Step 3 — Verify, then clean up
- Re-test in a signed-in chat at laptop and phone sizes. Confirm the pill appears, and that a second tap on the same emoji removes it.
- Remove the temporary logs.
- Then you check it on your real phone, after publishing, once the current platform incident clears (https://status.lovable.dev).

## Technical details
- `handleReaction` (chats.$id.tsx ~301): `if (!profile || reactionPending) return;` is the silent-drop path. Picker buttons (~529) have no `disabled={reactionPending === message.id}`.
- `setError` renders at ~450, above the thread, not near the compose bar. Use sonner `toast.error` and mount `<Toaster />` once in `__root.tsx` if it isn't mounted already.
- Timeout: wrap `toggleReaction` in a `Promise.race` with a 15s rejection.
- Every edit is in place, with no rewriting of nearby code.
