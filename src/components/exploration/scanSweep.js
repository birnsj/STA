// How long a party Scan's sweep of `radius` tiles takes: the floor ring (ScanPulse.jsx) and the minimap's ring
// (Minimap.jsx) run to the same clock, and the scan report waits for it.
export const scanSweepSeconds = (radius) => 0.9 + radius * 0.03

// A Scan aimed at one person (combat Scan, or exploration Scan of an NPC): rings this many tiles around the scanner and
// the target, so the effect reads on both figures without covering the whole tricorder range.
export const CHARACTER_SCAN_RADIUS = 1.8
