// How long a party Scan's sweep of `radius` tiles takes: the floor ring (ScanPulse.jsx) and the minimap's ring
// (Minimap.jsx) run to the same clock, and the scan report waits for it.
export const scanSweepSeconds = (radius) => 0.9 + radius * 0.03
