"use client"

// Decorative retro-monitor dressing for the home screen: a faint scanline
// texture, a couple of light bands sweeping top to bottom (clipped to the
// screen area), and a bezel with corner brackets - all tinted with the
// active theme color.

interface CrtOverlayProps {
  color: string
}

const CORNERS = [
  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-[1.75rem]",
  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-[1.75rem]",
  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-[1.75rem]",
  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-[1.75rem]",
]

export function CrtOverlay({ color }: CrtOverlayProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-3 sm:inset-6">
      {/* screen area: texture + sweeping lines, clipped so nothing crosses the frame */}
      <div className="absolute inset-0 overflow-hidden rounded-[1.75rem]">
        <div
          className="absolute inset-0 opacity-40 mix-blend-multiply"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 1px, transparent 1px, transparent 3px)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-0.5 animate-[crt-scan_6s_linear_infinite]"
          style={{ backgroundColor: color, boxShadow: `0 0 20px 3px ${color}` }}
        />
        <div
          className="absolute inset-x-0 top-0 h-0.5 animate-[crt-scan_6s_linear_infinite] opacity-60 [animation-delay:3s]"
          style={{ backgroundColor: color, boxShadow: `0 0 20px 3px ${color}` }}
        />
      </div>

      {/* frame border, drawn un-clipped so its glow can bleed outward */}
      <div
        className="absolute inset-0 rounded-[1.75rem]"
        style={{
          border: `2px solid ${color}`,
          boxShadow: `0 0 0 1px ${color}aa inset, 0 0 30px 3px ${color}, 0 0 70px ${color}66`,
        }}
      />
      {/* inner hairline for a double-frame terminal look */}
      <div className="absolute inset-2.5 rounded-[1.4rem]" style={{ border: `1px solid ${color}55` }} />

      {/* corner brackets — glow follows the L shape via drop-shadow, not a boxy box-shadow */}
      {CORNERS.map((pos) => (
        <span
          key={pos}
          className={`absolute size-14 sm:size-20 ${pos}`}
          style={{ borderColor: color, filter: `drop-shadow(0 0 5px ${color})` }}
        />
      ))}
    </div>
  )
}
