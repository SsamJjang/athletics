/** Wordmark: a slanted "GCS" plate — like a jersey chest badge — then ATHLETICS. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 select-none">
      <span
        className="display grid h-8 place-items-center bg-ink px-2.5 text-[20px] text-paper"
        style={{ clipPath: 'polygon(10% 0, 100% 0, 90% 100%, 0 100%)', paddingInline: 14 }}
      >
        <span className="relative">
          GCS
          <span className="absolute -bottom-[3px] left-0 right-0 h-[3px] bg-signal" aria-hidden />
        </span>
      </span>
      {!compact && <span className="display text-[22px] tracking-wide">Athletics</span>}
    </span>
  )
}
