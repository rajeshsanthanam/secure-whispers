# Secure Whispers

Build a web chat app called Secure Messenger using Lovable Cloud as the backend.

AUTH
- Username + password only, no email/phone collection from the user.
- Under the hood, use Supabase auth with a synthetic email derived from the normalized username (lowercase, trimmed) as <username>@app.local, with email auto-confirm enabled.
- Enforce a minimum password strength (at least 10 characters, block top-10000 common passwords via a simple check).
- Rate-limit login attempts per username (e.g. exponential backoff after 5 failed attempts) since there is no password reset path.
- Sign-up screen must show a clear, unmissable notice: "There is no password recovery. If you forget your password, your account and message history cannot be recovered."

DATABASE SCHEMA (with Row-Level Security on every table)
- profiles: id (references auth.users), username (unique, citext or lowercased), display_name, public_key, encrypted_private_key_blob, salt, created_at. RLS: any authenticated user can read username/display_name/public_key only (exact-match lookup); a user can only write their own row.
- conversations: id, name (nullable, for groups), is_group (bool), created_at.
- conversation_members: conversation_id, user_id, wrapped_conversation_key (this member's copy of the conversation key, encrypted to their public key), joined_at, key_version (int, default 1). RLS: readable/writable only if the requesting user is a member of that conversation.
- messages: id, conversation_id, sender_id, ciphertext, iv, key_version (which conversation key version encrypted this message), created_at. RLS: readable/writable only if requesting user is in conversation_members for that conversation_id.

KEY ROTATION ON MEMBER REMOVAL
- When a member is removed from a group, generate a new conversation key, increment key_version, and re-wrap the new key for all remaining members. New messages use the new key_version. Do not attempt to re-encrypt old messages — old messages stay under the old key_version, which the removed member already had, and that's an accepted, disclosed limitation (not a bug to fix).

CRYPTO (Web Crypto API, client-side only, private keys never leave the browser unencrypted)
- On sign-up: generate an ECDH P-256 key pair. Derive a wrapping key from password + random salt via PBKDF2 (250,000+ iterations). Encrypt the private key with the wrapping key (AES-GCM) before ever sending anything to the server. Store only: public key, encrypted private key blob, salt.
- On sign-in: fetch the blob and salt, re-derive the wrapping key from the entered password, decrypt the private key into memory only (never localStorage/sessionStorage).
- Per conversation: generate a random AES-GCM 256 conversation key. Wrap it separately for each member using ECDH-derived shared secrets with their public key.
- Per message: random IV, AES-GCM encrypt with the current conversation key.
- On sign-out: wipe all in-memory key material.

SCREENS
- Welcome/auth (sign in / sign up, single screen)
- Chats list (search, new chat, new group, unread indicators, latest message preview)
- Conversation view (bubbles, text input, real-time updates via Supabase realtime subscription filtered by conversation_id, decrypt client-side)
- New chat / new group (exact-username search only, member multi-select)
- Profile (display name, username, sign out, key fingerprint display placeholder for future verification feature)

SCOPE FOR V1
- No media/attachments, no read receipts, no typing indicators.
- Note in-app, in a small help/info section: this protects message content from the server operator but does not include forward secrecy (a compromised password can expose past messages) or out-of-band key verification (no defense against a compromised server actively substituting keys). Label this clearly as "current limitations," not hidden.

DESIGN
- Clean, minimal chat UI, mobile-responsive, dark mode support. Generate a design direction before building screens

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bfb58a90-7c28-43b6-a055-46fe9f2c5f1e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
