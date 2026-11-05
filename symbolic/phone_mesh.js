// Read-only mesh status for the Expo screen.
// This runtime does not scan, join, or open a socket. Dry-run and a missing helper are the same honesty.

export function meshScreenStatus() {
  return {
    readiness: "degraded",
    title: "Offline phone",
    headline: "Discovery is degraded on this screen.",
    detail: "This screen does not scan for radios and does not open a socket. When termux-bluetooth-scan is missing, or the run is a dry run, the phone service stays local only. Nothing here pretends a link is up.",
    rows: [
      { label: "Service", value: "Offline phone. No cellular call and no bill." },
      { label: "Radio", value: "Not ready. Discovery was not run." },
      { label: "Position", value: "The phone service is meant to stay up without a position lock. Locking a position is a separate consent." },
      { label: "Ownership", value: "Mesh still requires this phone's Android id in Termux. This screen cannot read that id, so it does not join or send." }
    ]
  };
}
