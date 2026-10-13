# Short recorded video clips (up to 15 seconds)

## Experience
- A camera button ("Record video") sits next to the photo button, always visible.
- It opens a full-screen recorder using the front camera, with a flip button, a 15-second countdown and a start/stop button. Recording stops on its own at 15 seconds.
- After stopping you review the clip and choose Send, Retake or Cancel. Anything typed in the message box becomes the caption. Clips over 8 MB show "Clip too large, try a shorter one" and aren't sent.
- The camera light turns off whenever you stop, cancel, close or leave.
- If camera access is refused or there's no camera, a clear pop-up explains it.
- While sending, a "Sending video…" bubble appears and the chat scrolls to it.
- Received videos show a "Tap to play" placeholder. The video downloads and unlocks only when tapped, so long chats stay light. If a phone can't play the format, you get "This video can't be played on this device" with a download link.
- Chat list and reply previews say "Video" (plus caption), like "Photo" today. Deleting a video also removes its file. Videos can't be edited.

## Privacy
- Videos are locked on your device before upload, exactly like photos, stored in the same private storage that only chat members can open.

## Technical details
- Migration: drop `messages_kind_check` (confirmed name, currently allows only text/image) and re-add it allowing `'text','image','video'`. No new columns; bucket policies and path `<conversationId>/<uuid>.enc` unchanged.
- Bucket `message-attachments` file size limit: currently 20 MB (20971520 bytes); set to exactly `12MB` with the storage tool. Photos are resized to 1600px JPEG, so well under it.
- `src/lib/messaging.ts` (in place): widen `kind` to `"text"|"image"|"video"`; both mappers (lines ~360, ~385) pass `video` through; `deleteMessage` removes the file whenever `attachment_path` exists (any kind), before tombstoning, aborting on failure; chat-list preview shows `Video · caption`; new `sendVideoMessage(conversationId, senderId, blob, caption="")` using `encryptBytes` with the newest key version, uploads, inserts `kind='video'`, and removes the uploaded file if the insert fails; new `loadVideoAttachment` that decrypts and sets the Blob type from magic bytes (WebM `1A 45 DF A3`, MP4 `ftyp` at bytes 4-7). Photo gallery queries (`kind='image'`) untouched.
- New `src/components/VideoRecorderSheet.tsx`: getUserMedia (video+audio, `facingMode` user/environment), MediaRecorder at 1,000,000 / 64,000 bps, mimeType chosen via `isTypeSupported` in order mp4 (avc1+mp4a), webm vp9/opus, webm vp8/opus, webm; stops every track on stop/cancel/close/unmount.
- New `src/components/VideoAttachment.tsx`: placeholder until tap, then `<video controls playsInline preload="metadata">`, URL cached via attachment-cache (revoked on close, sign-out, delete); error fallback with download link.
- `src/routes/chats.$id.tsx` (in place only): record button, `sendingVideo` state added to the scroll-to-bottom dependencies, `video` branch in bubble rendering, "Video" in `replySummary`; realtime and tombstone paths already go through the shared mapper so video rows behave like photos. Reactions, read receipts, reply/edit logic unchanged; edit stays text-only. All errors via toast.

## Verification
- Two signed-in accounts: send a clip (Chromium fake camera), confirm the other sees "Tap to play", plays it, chat list says "Video", stored file is unreadable ciphertext, deleting removes the file, no page errors. Real-phone recording (iPhone MP4) to be checked by you after publishing.
