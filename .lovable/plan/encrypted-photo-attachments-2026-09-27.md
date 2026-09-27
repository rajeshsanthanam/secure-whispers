# Encrypted photo attachments

Add camera/gallery photo selection to the existing chat screen. Photos will be resized and encrypted in the browser before upload, and decrypted in the browser for people in that conversation. Captions remain optional.

## What changes

1. Create a **private** `message-attachments` storage bucket and member-only upload/download rules. Files use a conversation-scoped path, so only current members can access the encrypted file. Leave uploaded attachments immutable: no edit or delete access in this version.
2. Add image metadata to messages while keeping existing text messages and their encrypted contents unchanged. Store the encrypted caption (or encrypted empty string) in the existing message body fields.
3. Add binary AES-GCM encrypt/decrypt helpers, using a fresh IV for every photo. Resize photos locally to a maximum 1600px edge and encode as JPEG at quality 0.8 before encryption.
4. Add photo selection beside the message input. Use the device's standard image picker without forcing camera-only mode; show a temporary local preview and sending state, then send the encrypted photo with any typed caption. Show useful errors if processing, upload, or sending fails.
5. Show received photos inside message bubbles with an optional decrypted caption, a loading state, and a full-screen tap-to-view overlay. Preserve existing text messages, reactions, read receipts, and scrolling.
6. Verify the flow with real signed-in users: send from one account, read from another, check mobile layout, and confirm the uploaded file is ciphertext rather than a viewable photo.

## Technical details

- Create the bucket with the storage management tool, not SQL; apply the `storage.objects` policies and `messages` column changes through a database migration. Restrict INSERT/SELECT to authenticated conversation members by the first path segment. No UPDATE/DELETE policies.
- Store files as `<conversationId>/<randomUuid>.enc`. Keep `messages.ciphertext` and `messages.iv` non-null; add `kind` (`text`/`image`), `attachment_path`, and `attachment_iv`. Use each message's `key_version` when decrypting both its caption and attachment, including older photos after key rotation.
- Implement browser-side byte encryption/decryption beside the existing text helpers. Upload only encrypted bytes to the private bucket; never persist plaintext photos or decrypted URLs in backend data.
- Load and cache decrypted object URLs while the chat is open, revoke them when the chat closes or keys are cleared, and show an error state if an attachment or its key is unavailable. The file input accepts images; camera availability in the system picker depends on the device/browser.
- Leave unrelated security findings and other chat features untouched.
