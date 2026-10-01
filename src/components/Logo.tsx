/** The GCS crest beside the ATHLETICS wordmark. */
export function Logo({ compact = false, size = 36, tone = 'auto' }: { compact?: boolean; size?: number; tone?: 'auto' | 'light' }) {
  return (
    <span className="flex select-none items-center gap-2.5">
      <img
        src="/crest.png"
        alt={compact ? 'GCS' : ''}
        width={Math.round(size * 0.927)}
        height={size}
        className="shrink-0 drop-shadow-sm"
        style={{ height: size, width: 'auto' }}
        decoding="async"
      />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={`display text-[22px] tracking-wide ${tone === 'light' ? 'text-[#f6efe2]' : ''}`}>Athletics</span>
          <span className={`mt-1 text-[9.5px] font-bold uppercase tracking-[0.16em] ${tone === 'light' ? 'text-[#f6efe2]/65' : 'faint'}`}>
            Gaonnuri Christian School
          </span>
        </span>
      )}
    </span>
  )
}
