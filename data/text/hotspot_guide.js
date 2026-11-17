// How phone hotspots share a connection, and what Yehsa's mesh can do offline.

export const HOTSPOT_TITLE = "Hotspot and mesh";

export const HOTSPOT_LEAD = "A phone hotspot shares this phone's internet with nearby devices. Yehsa's mesh is different: it can pass a short note to a nearby Yehsa install over Bluetooth, without a cell signal. It is not a hotspot, not a phone call, and not the internet.";

export const HOTSPOT_SECTIONS = [
  {
    id: "hotspot",
    title: "Share a connection with a phone hotspot",
    body: "When this phone already has a cell or Wi-Fi connection, many phones can share that connection as a Wi-Fi hotspot (sometimes called tethering). On most phones you will find this in Settings, under names such as Hotspot, Mobile Hotspot, or Tethering. Turn the hotspot on, then join that Wi-Fi network from the other device. The exact menu and any password or band settings vary, so check your phone's settings. A hotspot uses the sharing phone's data plan. If this phone has no cell or Wi-Fi service to share, a hotspot will not create a new connection to the outside world."
  },
  {
    id: "mesh",
    title: "What Yehsa's mesh can do without a cell signal",
    body: "Yehsa can look for nearby Yehsa installs over Bluetooth and, when you connect one, keep a short offline note on a link you already hold. That path does not need a cell signal. A scan does not drop a Bluetooth link this phone already has. Nearby peers stay outside this install and cannot run it. A note stays on this phone unless a write to the held link is accepted. There is no cellular call and no bill."
  },
  {
    id: "mesh-limits",
    title: "What the mesh does not do",
    body: "The mesh does not give you internet access, does not replace a hotspot, and does not reach emergency services. Typical Bluetooth range is short — a room, a trailhead, or nearby camp, not miles. If no Yehsa peer is in range, or the radio is missing or the permission is denied, the screen stays honest and does not invent a peer. Yehsa does not claim a sealed or guaranteed radio link. For a true emergency, try 911 or 112 first when you can, and use your phone's own SOS tools if you have them."
  }
];

export const HOTSPOT = [HOTSPOT_LEAD, ...HOTSPOT_SECTIONS.map((section) => `${section.title}. ${section.body}`)].join("\n\n");
