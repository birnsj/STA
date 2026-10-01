// Light effects layered over features painted into the menu background (1024x576 image coordinates).
const GLOWS = [
  { id: 'sun', className: 'ambient-sun', x: 1007, y: 230 },
  { id: 'nacelle-upper', className: 'ambient-nacelle', x: 504, y: 229 },
  { id: 'nacelle-lower', className: 'ambient-nacelle is-offset', x: 676, y: 333 },
  { id: 'deflector', className: 'ambient-deflector', x: 765, y: 268 },
]

// Energy pulses travel along the red stripes painted on each nacelle; start point, length and angle trace the stripe.
const NACELLE_STREAKS = [
  { id: 'upper', x: 362, y: 269, length: 97, angle: -19.4, className: 'ambient-nacelle-streak' },
  { id: 'lower', x: 554, y: 284, length: 97, angle: -12.5, className: 'ambient-nacelle-streak is-offset' },
]

const NAV_LIGHTS = [
  { id: 'port', x: 557, y: 207, className: 'ambient-nav-light is-red' },
  { id: 'starboard', x: 973, y: 197, className: 'ambient-nav-light is-green' },
]

// Painted saucer and hull windows that brighten briefly, each on its own cycle.
const WINDOWS = [
  { id: 'rim-a', x: 700, y: 150, duration: 9, delay: -2 },
  { id: 'rim-b', x: 735, y: 150, duration: 13, delay: -7 },
  { id: 'rim-c', x: 812, y: 157, duration: 11, delay: -4 },
  { id: 'rim-d', x: 885, y: 150, duration: 15, delay: -11 },
  { id: 'saucer-left', x: 591, y: 213, duration: 10, delay: -6 },
  { id: 'hull', x: 575, y: 322, duration: 12, delay: -1 },
]

// Shooting stars cross open sky between the logo and the saucer; long, unequal cycles keep them rare and out of step.
const SHOOTING_STARS = [
  { id: 'a', x: 930, y: 25, className: 'ambient-shooting-star' },
  { id: 'b', x: 700, y: 20, className: 'ambient-shooting-star is-late' },
]

export default function MenuAmbience() {
  return (
    <div className="menu-ambience" aria-hidden="true">
      {GLOWS.map((glow) => (
        <span key={glow.id} className={glow.className} style={{ left: glow.x, top: glow.y }} />
      ))}
      {NACELLE_STREAKS.map((streak) => (
        <span
          key={streak.id}
          className={streak.className}
          style={{ left: streak.x, top: streak.y, width: streak.length, transform: `rotate(${streak.angle}deg)` }}
        />
      ))}
      {NAV_LIGHTS.map((light) => (
        <span key={light.id} className={light.className} style={{ left: light.x, top: light.y }} />
      ))}
      {WINDOWS.map((win) => (
        <span
          key={win.id}
          className="ambient-window"
          style={{
            left: win.x,
            top: win.y,
            '--window-duration': `${win.duration}s`,
            '--window-delay': `${win.delay}s`,
          }}
        />
      ))}
      {SHOOTING_STARS.map((star) => (
        <span key={star.id} className={star.className} style={{ left: star.x, top: star.y }} />
      ))}
    </div>
  )
}
