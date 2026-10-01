# Diagnose the reaction tap on a real phone

I can't run a real phone, read your phone's browser console, or watch its network traffic. I can add the logging and explain how you check those three things on your device.

## Step 1 — I add temporary logging
- Add `console.log("reaction tap", emoji)` as the first line of `handleReaction`.
- Add `console.log("reaction sent", emoji)` after `toggleReaction` succeeds.
- Add `console.error("reaction failed", err)` in its error path, so a failure shows its exact message.
- Each is a one-line, in-place addition (around line 301 of the chat screen). Nothing around them changes.

## Step 2 — You publish and test on the phone
- Publish. A platform incident is in progress right now (https://status.lovable.dev), so wait for it to clear before you publish and test.
- **iPhone:** turn on Settings > Safari > Advanced > Web Inspector. Connect to a Mac and open Safari > Develop > [your phone] > the app page. That gives you the Console and Network tabs.
- **Android:** turn on USB debugging. Connect to a computer and open `chrome://inspect` in desktop Chrome, then click "inspect" on the app tab.
- Open a chat, open the reaction picker, and tap an emoji.

## Step 3 — What to report back
1. Any red console error at the moment of the tap.
2. Whether a `message_reactions` request appears in Network, and its status code.
3. Whether "reaction tap", "reaction sent", or "reaction failed" appears.

## What the result tells us
- No "reaction tap": the tap never reaches the button. That points to a touch or layout problem, such as the picker closing or moving before the tap lands.
- "reaction tap" appears but there's no request: the problem is inside the reaction code.
- A request goes out but fails: the error text tells us the fix.

After the diagnosis, I'll remove the logs.
