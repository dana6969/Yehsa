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
 },
 {
  "id": "dom-day-hike-essentials",
  "category": "domain-gear",
  "prompt": "Tell me about ten essentials",
  "expect": {
   "kind": "facts",
   "all": [
    "day-hike essentials checklist"
   ]
  }
 },
 {
  "id": "dom-deer-hunt-day-kit",
  "category": "domain-gear",
  "prompt": "Tell me about hunting pack list",
  "expect": {
   "kind": "facts",
   "all": [
    "deer-hunt day kit"
   ]
  }
 },
 {
  "id": "dom-kit-72-hour",
  "category": "domain-gear",
  "prompt": "Tell me about go bag",
  "expect": {
   "kind": "facts",
   "all": [
    "72-hour bag, car kit, and home outage kit"
   ]
  }
 },
 {
  "id": "dom-forgot-knife-light-fire",
  "category": "domain-gear",
  "prompt": "Tell me about forgot my knife",
  "expect": {
   "kind": "facts",
   "all": [
    "forgot your knife, light, or fire starter"
   ]
  }
 },
 {
  "id": "dom-clothing-layers-wet",
  "category": "domain-gear",
  "prompt": "Tell me about layering",
  "expect": {
   "kind": "facts",
   "all": [
    "clothing layers"
   ]
  }
 },
 {
  "id": "dom-headlamp-red-light",
  "category": "domain-gear",
  "prompt": "Tell me about headlamp",
  "expect": {
   "kind": "facts",
   "all": [
    "headlamp, spare batteries, and red mode"
   ]
  }
 },
 {
  "id": "dom-knife-safety-edge",
  "category": "domain-gear",
  "prompt": "Tell me about knife safety",
  "expect": {
   "kind": "facts",
   "all": [
    "knife safety and a basic edge"
   ]
  }
 },
 {
  "id": "dom-water-filter-care",
  "category": "domain-gear",
  "prompt": "Tell me about hollow fiber filter frozen",
  "expect": {
   "kind": "facts",
   "all": [
    "water filter care"
   ]
  }
 },
 {
  "id": "dom-first-aid-kit-contents",
  "category": "domain-gear",
  "prompt": "Tell me about first aid kit list",
  "expect": {
   "kind": "facts",
   "all": [
    "first-aid kit contents"
   ]
  }
 },
 {
  "id": "dom-stove-fuel-safety",
  "category": "domain-gear",
  "prompt": "Tell me about camp stove safety",
  "expect": {
   "kind": "facts",
   "all": [
    "stove and fuel safety"
   ]
  }
 },
 {
  "id": "dom-boot-fit-blisters",
  "category": "domain-gear",
  "prompt": "Tell me about blisters hiking",
  "expect": {
   "kind": "facts",
   "all": [
    "boot fit and blister prevention"
   ]
  }
 },
 {
  "id": "dom-sleeping-bag-ratings",
  "category": "domain-gear",
  "prompt": "Tell me about sleeping bag rating",
  "expect": {
   "kind": "facts",
   "all": [
    "sleeping bag temperature ratings"
   ]
  }
 },
 {
  "id": "dom-pack-fit",
  "category": "domain-gear",
  "prompt": "Tell me about backpack fit",
  "expect": {
   "kind": "facts",
   "all": [
    "fitting a backpack"
   ]
  }
 },
 {
  "id": "dom-field-repair-kit",
  "category": "domain-gear",
  "prompt": "Tell me about repair kit",
  "expect": {
   "kind": "facts",
   "all": [
    "field repair"
   ]
  }
 },
 {
  "id": "dom-rope-cordage-basics",
  "category": "domain-gear",
  "prompt": "Tell me about paracord",
  "expect": {
   "kind": "facts",
   "all": [
    "rope and cordage basics"
   ]
  }
 },
 {
  "id": "dom-binoculars-rangefinder",
  "category": "domain-gear",
  "prompt": "Tell me about binoculars",
  "expect": {
   "kind": "facts",
   "all": [
    "binoculars and rangefinders in practice"
   ]
  }
 },
 {
  "id": "dom-trekking-poles",
  "category": "domain-gear",
  "prompt": "Tell me about hiking poles",
  "expect": {
   "kind": "facts",
   "all": [
    "trekking poles"
   ]
  }
 },
 {
  "id": "dom-saw-hatchet-safety",
  "category": "domain-gear",
  "prompt": "Tell me about hatchet safety",
  "expect": {
   "kind": "facts",
   "all": [
    "saw and hatchet safety"
   ]
  }
 },
 {
  "id": "dom-winter-travel-gear",
  "category": "domain-gear",
  "prompt": "Tell me about snowshoes",
  "expect": {
   "kind": "facts",
   "all": [
    "winter travel gear"
   ]
  }
 },
 {
  "id": "dom-phone-battery-backup",
  "category": "domain-gear",
  "prompt": "Tell me about phone battery dying",
  "expect": {
   "kind": "facts",
   "all": [
    "phone battery and backup power"
   ]
  }
 },
 {
  "id": "dom-satellite-sos-messenger",
  "category": "domain-gear",
  "prompt": "Tell me about satellite SOS",
  "expect": {
   "kind": "facts",
   "all": [
    "satellite sos and messengers"
   ]
  }
 },
 {
  "id": "dom-whistle-mirror-signal",
  "category": "domain-gear",
  "prompt": "Tell me about emergency whistle",
  "expect": {
   "kind": "facts",
   "all": [
    "whistle and signal mirror"
   ]
  }
 },
 {
  "id": "dom-insect-repellent-use",
  "category": "domain-gear",
  "prompt": "Tell me about bug spray",
  "expect": {
   "kind": "facts",
   "all": [
    "insect repellent and tick-treated clothing"
   ]
  }
 },
 {
  "id": "dom-water-carry-capacity",
  "category": "domain-gear",
  "prompt": "Tell me about water bottles",
  "expect": {
   "kind": "facts",
   "all": [
    "how much water to carry"
   ]
  }
 },
 {
  "id": "dom-family-emergency-plan",
  "category": "domain-family",
  "prompt": "Tell me about family plan",
  "expect": {
   "kind": "facts",
   "all": [
    "family emergency plan and meeting points"
   ]
  }
 },
 {
  "id": "dom-child-lost-woods",
  "category": "domain-family",
  "prompt": "Tell me about kid lost in woods",
  "expect": {
   "kind": "facts",
   "all": [
    "what to teach a child about being lost in the woods"
   ]
  }
 },
 {
  "id": "dom-child-calls-emergency",
  "category": "domain-family",
  "prompt": "Tell me about teach kids to call 911",
  "expect": {
   "kind": "facts",
   "all": [
    "how a child calls 911"
   ]
  }
 },
 {
  "id": "dom-child-cold-infant",
  "category": "domain-family",
  "prompt": "Tell me about baby hypothermia",
  "expect": {
   "kind": "facts",
   "all": [
    "keeping children warm and spotting cold stress in infants"
   ]
  }
 },
 {
  "id": "dom-child-dehydration-fever",
  "category": "domain-family",
  "prompt": "Tell me about child dehydrated",
  "expect": {
   "kind": "facts",
   "all": [
    "dehydration and fever in a child"
   ]
  }
 },
 {
  "id": "dom-kids-prevention-rules",
  "category": "domain-family",
  "prompt": "Tell me about kids safety outdoors",
  "expect": {
   "kind": "facts",
   "all": [
    "kids outdoors"
   ]
  }
 },
 {
  "id": "dom-infant-formula-unsafe-water",
  "category": "domain-family",
  "prompt": "Tell me about baby formula water",
  "expect": {
   "kind": "facts",
   "all": [
    "infant formula when the water is unsafe"
   ]
  }
 },
 {
  "id": "dom-child-in-vehicle",
  "category": "domain-family",
  "prompt": "Tell me about child left in car",
  "expect": {
   "kind": "facts",
   "all": [
    "a child left in a vehicle is an emergency"
   ]
  }
 },
 {
  "id": "dom-pet-kit-evacuation",
  "category": "domain-family",
  "prompt": "Tell me about pet emergency kit",
  "expect": {
   "kind": "facts",
   "all": [
    "pet kit, pet evacuation, and pet poisoning"
   ]
  }
 },
 {
  "id": "dom-talk-kids-emergency",
  "category": "domain-family",
  "prompt": "Tell me about kids scared storm",
  "expect": {
   "kind": "facts",
   "all": [
    "talking to children during an emergency"
   ]
  }
 },
 {
  "id": "dom-reunification-after-disaster",
  "category": "domain-family",
  "prompt": "Tell me about find family after disaster",
  "expect": {
   "kind": "facts",
   "all": [
    "reuniting a family after a storm or evacuation"
   ]
  }
 },
 {
  "id": "dom-school-pickup-plan",
  "category": "domain-family",
  "prompt": "Tell me about school emergency pickup",
  "expect": {
   "kind": "facts",
   "all": [
    "school or daycare pickup when phones or roads fail"
   ]
  }
 },
 {
  "id": "dom-child-carrier-trail",
  "category": "domain-family",
  "prompt": "Tell me about hiking with a baby",
  "expect": {
   "kind": "facts",
   "all": [
    "child carriers and trail safety with little ones"
   ]
  }
 },
 {
  "id": "dom-shared-kit-meds",
  "category": "domain-family",
  "prompt": "Tell me about family medicines trip",
  "expect": {
   "kind": "facts",
   "all": [
    "shared kit"
   ]
  }
 },
 {
  "id": "dom-pets-outage-weather",
  "category": "domain-family",
  "prompt": "Tell me about pets cold weather",
  "expect": {
   "kind": "facts",
   "all": [
    "pets in a power outage, heat, or cold"
   ]
  }
 },
 {
  "id": "dom-after-hard-event-kids",
  "category": "domain-family",
  "prompt": "Tell me about kid saw something scary",
  "expect": {
   "kind": "facts",
   "all": [
    "helping children after a hard event"
   ]
  }
 },
 {
  "id": "dom-youth-hunts-link",
  "category": "domain-family",
  "prompt": "Tell me about youth deer season",
  "expect": {
   "kind": "facts",
   "all": [
    "youth seasons and mentored hunts"
   ]
  }
 },
 {
  "id": "dom-teen-crisis-support",
  "category": "domain-family",
  "prompt": "Tell me about teen depressed",
  "expect": {
   "kind": "facts",
   "all": [
    "supporting a teenager in crisis"
   ]
  }
 },
 {
  "id": "dom-emergency-info-card",
  "category": "domain-family",
  "prompt": "Tell me about medical info card",
  "expect": {
   "kind": "facts",
   "all": [
    "emergency contact and medical card"
   ]
  }
 },
 {
  "id": "dom-check-older-relatives",
  "category": "domain-family",
  "prompt": "Tell me about check on elderly parent",
  "expect": {
   "kind": "facts",
   "all": [
    "checking on older relatives and neighbors"
   ]
  }
 },
 {
  "id": "dom-kids-water-safety",
  "category": "domain-family",
  "prompt": "Tell me about kids drowning",
  "expect": {
   "kind": "facts",
   "all": [
    "children and water"
   ]
  }
 },
 {
  "id": "dom-panic-attack-help",
  "category": "domain-mental",
  "prompt": "Tell me about panic attack",
  "expect": {
   "kind": "facts",
   "all": [
    "panic attack"
   ]
  }
 },
 {
  "id": "dom-scared-lost-calm",
  "category": "domain-mental",
  "prompt": "Tell me about afraid in the woods",
  "expect": {
   "kind": "facts",
   "all": [
    "scared or lost"
   ]
  }
 },
 {
  "id": "dom-suicidal-thoughts-help",
  "category": "domain-mental",
  "prompt": "Tell me about suicidal",
  "expect": {
   "kind": "facts",
   "all": [
    "thoughts of suicide or not wanting to be here"
   ]
  }
 },
 {
  "id": "dom-acute-stress-close-call",
  "category": "domain-mental",
  "prompt": "Tell me about acute stress",
  "expect": {
   "kind": "facts",
   "all": [
    "shaken after a close call, crash, or bad hunt"
   ]
  }
 },
 {
  "id": "dom-grief-after-loss",
  "category": "domain-mental",
  "prompt": "Tell me about hunter remorse",
  "expect": {
   "kind": "facts",
   "all": [
    "grief after a death, and grief after a kill"
   ]
  }
 },
 {
  "id": "dom-when-get-help",
  "category": "domain-mental",
  "prompt": "Tell me about need a therapist",
  "expect": {
   "kind": "facts",
   "all": [
    "when to get professional mental health help"
   ]
  }
 },
 {
  "id": "dom-exhaustion-bad-decisions",
  "category": "domain-mental",
  "prompt": "Tell me about too tired to think",
  "expect": {
   "kind": "facts",
   "all": [
    "exhaustion, poor sleep, and bad decisions in the field"
   ]
  }
 },
 {
  "id": "dom-alcohol-outdoors-risk",
  "category": "domain-mental",
  "prompt": "Tell me about drinking at camp",
  "expect": {
   "kind": "facts",
   "all": [
    "alcohol and drugs as a way to cope outdoors"
   ]
  }
 },
 {
  "id": "dom-helping-friend-crisis",
  "category": "domain-mental",
  "prompt": "Tell me about friend in crisis",
  "expect": {
   "kind": "facts",
   "all": [
    "helping a friend in crisis"
   ]
  }
 },
 {
  "id": "dom-anxiety-before-event",
  "category": "domain-mental",
  "prompt": "Tell me about nervous before trip",
  "expect": {
   "kind": "facts",
   "all": [
    "anxiety before a storm, trip, or hunt"
   ]
  }
 },
 {
  "id": "dom-grounding-breathing",
  "category": "domain-mental",
  "prompt": "Tell me about breathing exercise",
  "expect": {
   "kind": "facts",
   "all": [
    "slow breathing and grounding"
   ]
  }
 },
 {
  "id": "dom-low-mood-winter",
  "category": "domain-mental",
  "prompt": "Tell me about winter blues",
  "expect": {
   "kind": "facts",
   "all": [
    "low mood in short winter days or isolation"
   ]
  }
 },
 {
  "id": "dom-loneliness-help",
  "category": "domain-mental",
  "prompt": "Tell me about lonely",
  "expect": {
   "kind": "facts",
   "all": [
    "loneliness"
   ]
  }
 },
 {
  "id": "dom-anger-conflict-group",
  "category": "domain-mental",
  "prompt": "Tell me about arguing in group",
  "expect": {
   "kind": "facts",
   "all": [
    "anger and conflict in a family or group under stress"
   ]
  }
 },
 {
  "id": "dom-shame-after-mistake",
  "category": "domain-mental",
  "prompt": "Tell me about feel ashamed",
  "expect": {
   "kind": "facts",
   "all": [
    "shame after a mistake"
   ]
  }
 },
 {
  "id": "dom-caregiver-burnout",
  "category": "domain-mental",
  "prompt": "Tell me about burned out parent",
  "expect": {
   "kind": "facts",
   "all": [
    "caregiver or parent burnout in a long outage"
   ]
  }
 },
 {
  "id": "dom-trauma-find-clinician",
  "category": "domain-mental",
  "prompt": "Tell me about PTSD",
  "expect": {
   "kind": "facts",
   "all": [
    "finding help for lasting trauma"
   ]
  }
 },
 {
  "id": "dom-morale-routines",
  "category": "domain-mental",
  "prompt": "Tell me about keep spirits up",
  "expect": {
   "kind": "facts",
   "all": [
    "routines that keep morale up"
   ]
  }
 },
 {
  "id": "dom-veterans-support",
  "category": "domain-mental",
  "prompt": "Tell me about veterans crisis line",
  "expect": {
   "kind": "facts",
   "all": [
    "support for veterans"
   ]
  }
 },
 {
  "id": "dom-stress-after-disaster",
  "category": "domain-mental",
  "prompt": "Tell me about disaster stress",
  "expect": {
   "kind": "facts",
   "all": [
    "stress after a disaster"
   ]
  }
 }
];
