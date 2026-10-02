<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep reactions as encrypted per-user rows keyed by message and encryption version; decrypt with conversation keys in the browser so old reactions survive key rotation.
- Store photo attachments as AES-GCM ciphertext in private, conversation-scoped storage paths and decrypt with the message's key version in the browser; this keeps old photos readable after key rotation.
- Keep replies as same-conversation message references and display quoted content from already-decrypted in-memory messages; this avoids duplicate plaintext storage or a second lookup.
- Tombstone deleted messages in place, clearing encrypted body and photo references after private file cleanup; this preserves reply and read-marker references.
- Keep conversation photo browsing in a dedicated carousel that decrypts the selected photo and only preloads its neighbors; this keeps long chats memory-efficient.
- Build reports from aggregate message metadata via invoker-rights database functions that never read encrypted columns; this keeps stats possible without exposing content.
