# Full emoji picker for reactions

## What you'll see
- The current quick row of 14 emoji stays, so common reactions remain one tap.
- A new "+" button at the end of that row opens a full emoji picker with every standard emoji. It has a search box ("heart", "laugh"…), category tabs, and skin-tone choice.
- Tap any emoji to react. The picker closes and the reaction appears just like it does today, still encrypted.
- On phones the full picker opens as a sheet from the bottom of the screen, so the keyboard or scrolling can't push it off screen. On larger screens it opens as a small popover.
- It uses the Frosted Navy dark styling.

## What stays the same
- Reactions are still stored encrypted, one per person per message. They're decrypted with each message's key version, so older reactions still show after a key change.
- Deleted messages still can't be reacted to.
- Any emoji can be a reaction. The reaction pills already show whatever emoji was saved.

## Technical details
- Add `frimousse`, a small headless React emoji picker with built-in search. It loads its emoji data on demand when first opened, so the app's initial load stays the same size.
- New component `src/components/EmojiPickerSheet.tsx`. It wraps frimousse in the existing Sheet (mobile) / Popover (desktop) UI parts, styled with existing tokens only.
- `src/routes/chats.$id.tsx`: small in-place edits only, with no rewriting of nearby code:
  - add one "+" button after the `REACTION_EMOJI` map inside the picker div
  - add one state flag for which message's full picker is open
  - render `EmojiPickerSheet`, which calls the existing `handleReaction(message, emoji)`
- Keep `pickerRef` and the scroll-into-view effect as they are.
- `toggleReaction` needs no changes because it already accepts any emoji string. I'll check this when building.
- Save the "edit in place, don't rewrite surrounding code" rule to project memory.

## Verify
- Sign in, open a chat, open the full picker, search for an emoji, react, and confirm the pill appears. Test at both phone and desktop sizes.
