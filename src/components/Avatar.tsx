export function initials(value: string) {
  const parts = value.trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function Avatar({
  label,
  size = "md",
  tone = "accent",
}: {
  label: string;
  size?: "sm" | "md";
  tone?: "accent" | "muted";
}) {
  const dimensions = size === "sm" ? "size-8 text-[11px]" : "size-10 text-sm";
  const toneClasses =
    tone === "accent"
      ? "bg-accent/20 text-accent-soft outline-1 outline-accent/30"
      : "bg-mist/10 text-mist edge";
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full font-display font-semibold ${dimensions} ${toneClasses}`}
    >
      {initials(label)}
    </div>
  );
}
