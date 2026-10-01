import { EmojiPicker } from "frimousse";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function EmojiPickerSheet({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (emoji: string) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl border-border bg-card p-3">
        <SheetHeader className="p-1">
          <SheetTitle className="font-display text-sm">Choose a reaction</SheetTitle>
        </SheetHeader>
        {open ? (
          <EmojiPicker.Root className="isolate flex h-[min(360px,55vh)] w-full flex-col" onEmojiSelect={({ emoji }) => onPick(emoji)}>
            <EmojiPicker.Search placeholder="Search emoji" className="mb-2 h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent" />
            <EmojiPicker.Viewport className="relative flex-1 outline-none">
              <EmojiPicker.Loading className="grid h-full place-items-center text-sm text-muted-foreground">Loading…</EmojiPicker.Loading>
              <EmojiPicker.Empty className="grid h-full place-items-center text-sm text-muted-foreground">No emoji found.</EmojiPicker.Empty>
              <EmojiPicker.List
                className="select-none pb-2"
                components={{
                  CategoryHeader: ({ category, ...props }) => (
                    <div className="bg-card px-1 pb-1 pt-2 text-xs font-medium text-muted-foreground" {...props}>{category.label}</div>
                  ),
                  Row: ({ children, ...props }) => <div className="flex" {...props}>{children}</div>,
                  Emoji: ({ emoji, ...props }) => (
                    <button className="grid size-9 place-items-center rounded-md text-xl data-[active]:bg-accent/15" {...props}>{emoji.emoji}</button>
                  ),
                }}
              />
            </EmojiPicker.Viewport>
          </EmojiPicker.Root>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
