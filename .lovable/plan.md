# Scroll-through chat photos

## Experience
- Tapping any undeleted photo opens the existing full-screen viewer at that photo.
- The viewer becomes a conversation photo carousel, ordered the same way as the chat.
- On phones, swipe left or right to move between photos. On laptops, use visible previous/next arrows or the keyboard arrow keys.
- Show a compact position counter such as `4 of 18`, keep the close control, and display the photo caption when one exists.
- Disable navigation at the first and last photo rather than looping unexpectedly.

## Loading and privacy
- Build the carousel only from already-loaded, undeleted image messages in the current conversation.
- Continue decrypting photos in the browser with each message's original key version; no plaintext photos or new metadata will be stored.
- Load the selected photo first, then preload only the neighboring photo so long chats do not download and decrypt every image at once.
- Reuse the existing in-memory attachment cache and clear it under the current sign-out, conversation-change, and deletion rules.
- If one photo cannot load, show its retry state without preventing navigation to the other photos.

## Implementation
- Add a focused photo-carousel component and pass it the conversation ID, ordered image messages, and selected message ID.
- Change each chat photo's open action to identify its message instead of passing only a temporary image URL.
- Preserve the current encrypted attachment loader and cache; no database migration or access-policy change is needed.
- Make only targeted, in-place edits to the conversation file.

## Verification
- Test opening a middle photo, swiping/tapping through adjacent photos, keyboard navigation, captions, first/last boundaries, close/reopen behavior, and a deleted-photo case.
- Verify a long conversation does not eagerly request every photo and that the page remains error-free on mobile and desktop sizes.
