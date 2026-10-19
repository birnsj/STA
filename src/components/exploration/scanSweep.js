// How long a party Scan's sweep of `radius` tiles takes: the floor ring (maps/pixi/effects.js ScanView) and the minimap's ring
// (Minimap.jsx) run to the same clock, and the scan report waits for it.
export const scanSweepSeconds = (radius) => 0.9 + radius * 0.03

// A Scan aimed at one person (combat Scan, or exploration Scan of an NPC): rings this many tiles around the scanner and
// the target, so the effect reads on both figures without covering the whole tricorder range.
export const CHARACTER_SCAN_RADIUS = 1.8

// Challenge / destructible Scan: full tricorder radius around the scanner (stored on lastTargetScan.radius) and this
// smaller ring around the object so both ends of the sweep read clearly.
export const OBJECT_SCAN_RADIUS = 1.2
