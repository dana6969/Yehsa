// Round 4: one typed question per new entry in the hunting, navigation, gear, family, mental health,
// spiritual, and home domains. Not the frozen v1 suite and not the external holdout.
export const DOMAIN_DEV_SET = [
 {
  "id": "dom-hunt-before-you-go",
  "category": "domain-hunting",
  "prompt": "Tell me about hunting license",
  "expect": {
   "kind": "facts",
   "all": [
    "before you hunt"
   ]
  }
 },
 {
  "id": "dom-hunt-legal-light-note",
  "category": "domain-hunting",
  "prompt": "Tell me about shooting hours",
  "expect": {
   "kind": "facts",
   "all": [
    "legal shooting light"
   ]
  }
 },
 {
  "id": "dom-hunt-firearm-safety",
  "category": "domain-hunting",
  "prompt": "Tell me about gun safety",
  "expect": {
   "kind": "facts",
   "all": [
    "firearm safety in the field"
   ]
  }
 },
 {
  "id": "dom-hunt-target-beyond",
  "category": "domain-hunting",
  "prompt": "Tell me about identify before you shoot",
  "expect": {
   "kind": "facts",
   "all": [
    "know your target and what is beyond it"
   ]
  }
 },
 {
  "id": "dom-hunt-shot-placement",
  "category": "domain-hunting",
  "prompt": "Tell me about ethical shot",
  "expect": {
   "kind": "facts",
   "all": [
    "shot placement and what to do after the shot"
   ]
  }
 },
 {
  "id": "dom-hunt-blood-trail",
  "category": "domain-hunting",
  "prompt": "Tell me about blood trail",
  "expect": {
   "kind": "facts",
   "all": [
    "tracking a hit deer and reading a blood trail"
   ]
  }
 },
 {
  "id": "dom-hunt-lost-animal",
  "category": "domain-hunting",
  "prompt": "Tell me about lost the blood trail",
  "expect": {
   "kind": "facts",
   "all": [
    "when you cannot find the animal"
   ]
  }
 },
 {
  "id": "dom-field-dressing-deer",
  "category": "domain-hunting",
  "prompt": "Tell me about gutting a deer",
  "expect": {
   "kind": "facts",
   "all": [
    "field dressing a deer"
   ]
  }
 },
 {
  "id": "dom-meat-care-temperature",
  "category": "domain-hunting",
  "prompt": "Tell me about meat care warm weather",
  "expect": {
   "kind": "facts",
   "all": [
    "keeping game meat cool and spotting spoiled meat"
   ]
  }
 },
 {
  "id": "dom-cwd-awareness",
  "category": "domain-hunting",
  "prompt": "Tell me about CWD",
  "expect": {
   "kind": "facts",
   "all": [
    "chronic wasting disease"
   ]
  }
 },
 {
  "id": "dom-game-cooking-temps",
  "category": "domain-hunting",
  "prompt": "Tell me about venison temperature",
  "expect": {
   "kind": "facts",
   "all": [
    "cooking venison and wild game safely"
   ]
  }
 },
 {
  "id": "dom-tree-stand-safety",
  "category": "domain-hunting",
  "prompt": "Tell me about tree stand",
  "expect": {
   "kind": "facts",
   "all": [
    "tree-stand safety"
   ]
  }
 },
 {
  "id": "dom-hunt-fence-crossing",
  "category": "domain-hunting",
  "prompt": "Tell me about crossing a fence with a gun",
  "expect": {
   "kind": "facts",
   "all": [
    "crossing fences and obstacles with a firearm"
   ]
  }
 },
 {
  "id": "dom-small-game-tularemia",
  "category": "domain-hunting",
  "prompt": "Tell me about rabbit fever",
  "expect": {
   "kind": "facts",
   "all": [
    "small game"
   ]
  }
 },
 {
  "id": "dom-waterfowl-rules-link",
  "category": "domain-hunting",
  "prompt": "Tell me about duck hunting rules",
  "expect": {
   "kind": "facts",
   "all": [
    "waterfowl and migratory birds have their own rules"
   ]
  }
 },
 {
  "id": "dom-turkey-hunting-safety",
  "category": "domain-hunting",
  "prompt": "Tell me about turkey hunting",
  "expect": {
   "kind": "facts",
   "all": [
    "turkey hunting safety"
   ]
  }
 },
 {
  "id": "dom-quartering-packing-out",
  "category": "domain-hunting",
  "prompt": "Tell me about quarter a deer",
  "expect": {
   "kind": "facts",
   "all": [
    "quartering and packing out game"
   ]
  }
 },
 {
  "id": "dom-skinning-hanging-deer",
  "category": "domain-hunting",
  "prompt": "Tell me about skin a deer",
  "expect": {
   "kind": "facts",
   "all": [
    "skinning and hanging a deer"
   ]
  }
 },
 {
  "id": "dom-basic-butcher-cuts",
  "category": "domain-hunting",
  "prompt": "Tell me about butcher a deer",
  "expect": {
   "kind": "facts",
   "all": [
    "basic venison butchering cuts"
   ]
  }
 },
 {
  "id": "dom-tag-transport-checkin",
  "category": "domain-hunting",
  "prompt": "Tell me about tag a deer",
  "expect": {
   "kind": "facts",
   "all": [
    "tagging, transport, and checking in game"
   ]
  }
 },
 {
  "id": "dom-cwd-processor-request",
  "category": "domain-hunting",
  "prompt": "Tell me about deer processor CWD",
  "expect": {
   "kind": "facts",
   "all": [
    "using a processor when cwd is a concern"
   ]
  }
 },
 {
  "id": "dom-recover-game-water-cover",
  "category": "domain-hunting",
  "prompt": "Tell me about deer in the water",
  "expect": {
   "kind": "facts",
   "all": [
    "recovering game in water or thick cover"
   ]
  }
 },
 {
  "id": "dom-ground-blind-safety",
  "category": "domain-hunting",
  "prompt": "Tell me about ground blind",
  "expect": {
   "kind": "facts",
   "all": [
    "ground blind safety"
   ]
  }
 },
 {
  "id": "dom-youth-hunter-mentor",
  "category": "domain-hunting",
  "prompt": "Tell me about take a kid hunting",
  "expect": {
   "kind": "facts",
   "all": [
    "hunting with a young or new hunter"
   ]
  }
 },
 {
  "id": "dom-bear-moose-camp-safety",
  "category": "domain-hunting",
  "prompt": "Tell me about bear at my deer",
  "expect": {
   "kind": "facts",
   "all": [
    "black bear and moose around camps and carcasses"
   ]
  }
 },
 {
  "id": "dom-field-dressing-birds",
  "category": "domain-hunting",
  "prompt": "Tell me about clean a turkey",
  "expect": {
   "kind": "facts",
   "all": [
    "field dressing birds"
   ]
  }
 },
 {
  "id": "dom-lead-ammo-awareness",
  "category": "domain-hunting",
  "prompt": "Tell me about lead bullet fragments",
  "expect": {
   "kind": "facts",
   "all": [
    "lead versus non-lead ammunition"
   ]
  }
 },
 {
  "id": "dom-hunting-ethics-waste",
  "category": "domain-hunting",
  "prompt": "Tell me about hunting ethics",
  "expect": {
   "kind": "facts",
   "all": [
    "hunting ethics"
   ]
  }
 },
 {
  "id": "dom-land-access-trespass",
  "category": "domain-hunting",
  "prompt": "Tell me about hunting private land",
  "expect": {
   "kind": "facts",
   "all": [
    "land access, permission, and trespass"
   ]
  }
 },
 {
  "id": "dom-trapping-regulated",
  "category": "domain-hunting",
  "prompt": "Tell me about trapping license",
  "expect": {
   "kind": "facts",
   "all": [
    "trapping is tightly regulated"
   ]
  }
 },
 {
  "id": "dom-game-camera-etiquette",
  "category": "domain-hunting",
  "prompt": "Tell me about trail camera",
  "expect": {
   "kind": "facts",
   "all": [
    "game cameras"
   ]
  }
 },
 {
  "id": "dom-wind-scent-hunting",
  "category": "domain-hunting",
  "prompt": "Tell me about wind direction hunting",
  "expect": {
   "kind": "facts",
   "all": [
    "wind direction and your scent"
   ]
  }
 },
 {
  "id": "dom-dragging-deer-safety",
  "category": "domain-hunting",
  "prompt": "Tell me about drag a deer",
  "expect": {
   "kind": "facts",
   "all": [
    "dragging a deer without hurting yourself"
   ]
  }
 },
 {
  "id": "dom-hunting-alone-plan",
  "category": "domain-hunting",
  "prompt": "Tell me about solo hunting",
  "expect": {
   "kind": "facts",
   "all": [
    "hunting alone"
   ]
  }
 },
 {
  "id": "dom-map-orient-compass",
  "category": "domain-navigation",
  "prompt": "Tell me about set the map",
  "expect": {
   "kind": "facts",
   "all": [
    "orienting a map with a compass"
   ]
  }
 },
 {
  "id": "dom-declination-basics",
  "category": "domain-navigation",
  "prompt": "Tell me about compass doesn't match the map",
  "expect": {
   "kind": "facts",
   "all": [
    "declination"
   ]
  }
 },
 {
  "id": "dom-north-types",
  "category": "domain-navigation",
  "prompt": "Tell me about grid north",
  "expect": {
   "kind": "facts",
   "all": [
    "true north, magnetic north, and grid north"
   ]
  }
 },
 {
  "id": "dom-bearing-take-follow",
  "category": "domain-navigation",
  "prompt": "Tell me about follow a bearing",
  "expect": {
   "kind": "facts",
   "all": [
    "taking and following a compass bearing"
   ]
  }
 },
 {
  "id": "dom-contour-terrain-features",
  "category": "domain-navigation",
  "prompt": "Tell me about contour lines",
  "expect": {
   "kind": "facts",
   "all": [
    "contour lines and terrain features"
   ]
  }
 },
 {
  "id": "dom-map-distance-pace",
  "category": "domain-navigation",
  "prompt": "Tell me about pace count",
  "expect": {
   "kind": "facts",
   "all": [
    "measuring distance and keeping a pace count"
   ]
  }
 },
 {
  "id": "dom-gps-vs-map",
  "category": "domain-navigation",
  "prompt": "Tell me about GPS not working",
  "expect": {
   "kind": "facts",
   "all": [
    "gps and phone versus map and compass"
   ]
  }
 },
 {
  "id": "dom-lost-stop-plan",
  "category": "domain-navigation",
  "prompt": "Tell me about I'm lost",
  "expect": {
   "kind": "facts",
   "all": [
    "lost? stop, think, observe, plan"
   ]
  }
 },
 {
  "id": "dom-aiming-off-handrails",
  "category": "domain-navigation",
  "prompt": "Tell me about handrail navigation",
  "expect": {
   "kind": "facts",
   "all": [
    "handrails, catching features, and aiming off"
   ]
  }
 },
 {
  "id": "dom-phone-compass-unreliable",
  "category": "domain-navigation",
  "prompt": "Tell me about phone compass wrong",
  "expect": {
   "kind": "facts",
   "all": [
    "when a phone compass is unreliable"
   ]
  }
 },
 {
  "id": "dom-stream-crossing-choice",
  "category": "domain-navigation",
  "prompt": "Tell me about crossing a river",
  "expect": {
   "kind": "facts",
   "all": [
    "stream crossings"
   ]
  }
 },
 {
  "id": "dom-compass-parts",
  "category": "domain-navigation",
  "prompt": "Tell me about baseplate compass",
  "expect": {
   "kind": "facts",
   "all": [
    "parts of a baseplate compass"
   ]
  }
 },
 {
  "id": "dom-night-navigation",
  "category": "domain-navigation",
  "prompt": "Tell me about walking in the dark",
  "expect": {
   "kind": "facts",
   "all": [
    "navigating at night"
   ]
  }
 },
 {
  "id": "dom-sun-direction-rough",
  "category": "domain-navigation",
  "prompt": "Tell me about sun direction",
  "expect": {
   "kind": "facts",
   "all": [
    "rough direction from the sun"
   ]
  }
 },
 {
  "id": "dom-stars-north",
  "category": "domain-navigation",
  "prompt": "Tell me about north star",
  "expect": {
   "kind": "facts",
   "all": [
    "stars as a rough north reference"
   ]
  }
 },
 {
  "id": "dom-mark-route-self",
  "category": "domain-navigation",
  "prompt": "Tell me about mark my trail",
  "expect": {
   "kind": "facts",
   "all": [
    "marking a route for yourself"
   ]
  }
 },
 {
  "id": "dom-whiteout-fog-navigation",
  "category": "domain-navigation",
  "prompt": "Tell me about lost in fog",
  "expect": {
   "kind": "facts",
   "all": [
    "whiteout or fog"
   ]
  }
 },
 {
  "id": "dom-altimeter-navigation",
  "category": "domain-navigation",
  "prompt": "Tell me about altimeter navigation",
  "expect": {
   "kind": "facts",
   "all": [
    "altimeter or barometer as a rough navigation aid"
   ]
  }
 },
 {
  "id": "dom-map-scale-limits",
  "category": "domain-navigation",
  "prompt": "Tell me about map scale",
  "expect": {
   "kind": "facts",
   "all": [
    "map scale and what a map does not show"
   ]
  }
 },
 {
  "id": "dom-vehicle-vs-foot-travel",
  "category": "domain-navigation",
  "prompt": "Tell me about car stuck on back road",
  "expect": {
   "kind": "facts",
   "all": [
    "driving versus walking when the road is not on the map"
   ]
  }
 },
 {
  "id": "dom-resection-intersection",
  "category": "domain-navigation",
  "prompt": "Tell me about triangulation",
  "expect": {
   "kind": "facts",
   "all": [
    "resection and intersection"
   ]
  }
 },
 {
  "id": "dom-grid-coordinates",
  "category": "domain-navigation",
  "prompt": "Tell me about UTM coordinates",
  "expect": {
   "kind": "facts",
   "all": [
    "reading grid coordinates on a map"
   ]
  }
 },
 {
  "id": "dom-turnaround-time",
  "category": "domain-navigation",
  "prompt": "Tell me about turnaround time",
  "expect": {
   "kind": "facts",
   "all": [
    "turnaround time and trip plans"
   ]
  }
 }
];
