/** Ambient blurred light blooms behind every screen. */
export function Aura() {
  return (
    <>
      <div className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-accent/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 size-[560px] rounded-full bg-indigo-600/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-48 left-1/4 size-[420px] rounded-full bg-cyan-500/10 blur-[120px]" />
    </>
  );
}
