// Field how-to guide. Plain, step-first answers for common survival questions.
// Pure data plus regex routing: no filesystem, no network, not on the getMappedAction hot path.
// Shape: lead with the action, numbered steps, materials, common mistakes, at most one safety line.
// Routing is deliberately narrow: only clear "how do I / what could I use / I need" questions
// about a known topic land here. Everything else falls through to the field notes as before.

export const FIELD_GUIDE_SOURCE = "symbolic_books/survival/field_guide";

function entry(id, title, lead, steps, extra = {}) {
  return { id, title, lead, steps, ...extra };
}

// Each entry: id, title, lead, steps[], materials?, mistakes?, safety?
const GUIDE = {
  shelter_now: entry("shelter_now", "Shelter: what to do first",
    "Get out of the wind and off wet ground first.",
    [
      "Put something dry under you: bark, evergreen boughs, dry leaves, a pad, or your pack. Ground cold steals heat faster than air.",
      "Block the wind on the windward side with a tarp, blanket, rock, fallen log, or a wall of branches.",
      "Keep the opening away from the wind, and leave a gap so air can move.",
      "Make it small. A shelter just big enough for your body holds your heat."
    ],
    {
      materials: "A tarp or emergency blanket, dead branches and bark, leaves or grass, packed snow as a windbreak, or a dense evergreen as a backstop.",
      mistakes: "Sitting on wet ground; building too big to warm; tying a ridge to a weak dead branch; camping in a dry wash or under dead limbs."
    }),
  shelter_options: entry("shelter_options", "What you can use for shelter",
    "Use whatever keeps wind and wet off you and puts insulation under you. Good options:",
    [
      "Tarp, poncho, or rain fly: tie a line between two trees about waist high, drape the tarp over it, and stake or weigh down the edges for an A-frame.",
      "Emergency blanket or large trash bag: wrap it around you or use it as a roof over a branch frame. Shiny side toward you holds heat.",
      "Dead branches, bark, and leaves: lean branches on a ridgepole and pile leaves or grass on top until it is about an arm's length thick (a debris hut).",
      "Natural cover: a rock overhang, the downhill side of a big fallen log, or the dry space under low evergreen branches. Add a bed of boughs.",
      "Snow, when deep: dig a trench or a cave and roof it with branches and snow. Snow insulates well."
    ],
    {
      mistakes: "Using only a roof and nothing underneath; choosing a low spot where cold air and water collect.",
      safety: "Check overhead for dead limbs and loose rock before you settle in."
    }),
  debris_hut: entry("debris_hut", "Debris hut",
    "A debris hut is a small, thick leaf pile you crawl into. It needs no tools and can keep you warm without a fire.",
    [
      "Find a ridgepole about one and a half times your height. Rest one end on a stump, rock, or forked stick at about hip height and the other end on the ground.",
      "Lean sticks along both sides like ribs, close enough that leaves do not fall through. Leave a small door at the high end.",
      "Pile dry leaves, grass, pine needles, or ferns over the frame until it is at least an arm's length thick. Thicker is warmer.",
      "Stuff the inside with more dry debris to lie on and to fill the space around you.",
      "Crawl in feet first and plug the door with a pile of leaves or your pack."
    ],
    {
      materials: "One strong ridgepole, many arm-length sticks, and a large pile of dry leaves or grass.",
      mistakes: "Making it too roomy; a thin roof that rain soaks through; skipping the bed under you."
    }),
  lean_to: entry("lean_to", "Lean-to",
    "A lean-to is a sloped roof with one open side. It is quick and works well with a fire in front.",
    [
      "Pick a spot above any flood line and out of drainages, then lash or wedge a crossbar between two trees about chest high, with the back facing the wind.",
      "Lean long poles from the crossbar down to the ground on the windward side.",
      "Weave thinner branches across the poles, then shingle with bark, evergreen boughs, or leaves from the bottom up so rain runs off.",
      "Lay a thick bed of boughs or leaves under the roof.",
      "If you use a fire, build it a few steps in front of the opening, with a log or rock wall behind it to reflect heat in."
    ],
    {
      materials: "Two trees or forked posts, a crossbar, long poles, branches, and bark or boughs. A tarp can replace the roof.",
      mistakes: "Facing the open side into the wind; a fire too close to the roof.",
      safety: "Keep the fire small and far enough from the roof that sparks cannot catch it."
    }),
  tarp: entry("tarp", "Tarp and poncho shelters",
    "A tarp is the fastest shelter. Pick the pitch for the weather.",
    [
      "A-frame (rain): run a cord between two trees about waist high, drape the tarp over it, and stake both edges low and tight.",
      "Lean-to (calm, with a fire): tie one edge high between trees, stake the other edge to the ground on the windward side.",
      "Low wedge (wind): stake one short edge to the ground facing the wind and raise the other end on a stick or line.",
      "Poncho: tie the hood shut, run a line through the grommets or corners, and stake out the edges.",
      "Tension the ridgeline with a trucker's hitch or taut-line hitch so it does not sag in rain."
    ],
    {
      materials: "Tarp or poncho, about 15 m (50 ft) of cord, stakes or sticks, and rocks to weigh edges.",
      mistakes: "A ridgeline too high in wind; pooling water on a flat roof; no ground sheet."
    }),
  snow_shelter: entry("snow_shelter", "Snow shelters",
    "Snow is good insulation. Dig into it instead of sitting on top of it.",
    [
      "Snow trench (fastest): dig a trench a little longer and wider than your body, about knee deep. Roof it with branches, a tarp, or snow blocks, then pile snow on top.",
      "Quinzhee (more time): pile snow into a mound about 2 m (6 ft) high, let it settle 1 to 2 hours, push in sticks about 30 cm (1 ft) long as depth guides, then hollow it out until you reach the sticks.",
      "Tree well: the space under low evergreen branches often has less snow. Dig down and line the floor with boughs.",
      "Put insulation under you: boughs, a pad, or your pack.",
      "Poke a fist-size vent hole in the roof and keep a digging tool inside."
    ],
    {
      materials: "A shovel, pot, or flat stick to dig, plus boughs or a pad for the floor.",
      mistakes: "Sweating while digging (slow down and vent layers); a roof thinner than about 30 cm; no vent.",
      safety: "Never use a stove or candle in a sealed snow shelter; keep the vent open to avoid carbon monoxide."
    }),
  natural_shelter: entry("natural_shelter", "Natural shelters",
    "Start with what the land gives you, then improve it.",
    [
      "Rock overhang: build a wall of rocks or branches across the open side and lay a bed of boughs.",
      "Big fallen log: dig a body-size hollow on the downwind side and lean branches over it like a roof.",
      "Evergreen with low branches: the dry space under the skirt makes a ready-made roof. Add more boughs to the sides.",
      "Dense thicket: weave in more branches and pile leaves on top."
    ],
    {
      mistakes: "Using a cave or hollow without checking for animals; sitting in a gully where cold air and water collect.",
      safety: "Check for loose rock and dead branches overhead before you use any natural shelter."
    }),
  ground_insulation: entry("ground_insulation", "Insulation under you",
    "Insulation under you matters most: the ground pulls heat out of you faster than the air does, so build the bed first.",
    [
      "Pile dry leaves, grass, pine needles, or evergreen boughs at least 15 to 20 cm (6 to 8 in) thick after you press it down. Deeper on snow.",
      "Lay boughs with the cut ends down and the tips up, overlapping like shingles.",
      "Use your pack, a rope coil, or a pad under your hips and shoulders if you have little else.",
      "Refresh the bed each night; crushed debris loses its loft."
    ],
    { mistakes: "A thin bed that flattens to nothing; sleeping on bare rock or snow." }),
  shelter_site: entry("shelter_site", "Choosing a shelter site",
    "Pick a spot out of the wind, on ground that drains, before you build anything.",
    [
      "Stay above dry washes, stream banks, and flood lines.",
      "Look up: avoid dead trees and hanging limbs.",
      "Avoid valley floors where cold air settles at night and exposed ridges where wind is strongest. A spot partway up a slope is often best.",
      "Face the opening away from the wind.",
      "Stay near building materials and, if you can, near water without camping right next to it."
    ],
    { mistakes: "Building in a low hollow because it looks sheltered; ignoring an ant nest or animal trail." }),
  stay_dry: entry("stay_dry", "Staying dry",
    "Wet clothes pull heat from you fast, so stay dry before you need to get warm.",
    [
      "Vent and remove layers before you sweat, then add them back when you stop.",
      "Change into a dry layer before sleep and keep one dry set sealed in a bag.",
      "Dry damp socks and gloves inside your jacket against your body.",
      "Shed rain with a tarp, poncho, or trash bag over your pack and shoulders."
    ],
    { mistakes: "Hiking hard in every layer; sleeping in damp clothes." }),

  fire_start: entry("fire_start", "Building a fire",
    "Gather all three sizes of fuel before you strike anything.",
    [
      "Clear a spot down to bare soil, away from overhanging branches. Use an existing fire ring if there is one.",
      "Tinder: a double handful of fine, dry material such as birch bark, dry grass, cattail fluff, pine needles, or cotton balls with petroleum jelly.",
      "Kindling: twigs from pencil-lead to thumb thickness. Snap test: dry wood snaps, damp wood bends.",
      "Fuel: wrist-thick and larger dead wood off the ground.",
      "Light the tinder, then add kindling one piece at a time, then fuel. Feed it air; do not smother it."
    ],
    {
      materials: "Lighter, matches, or ferro rod, plus tinder, kindling, and fuel wood.",
      mistakes: "Starting with sticks too thick; not gathering enough before lighting; piling on wood so the flame has no air.",
      safety: "Only light a fire where it is allowed, keep water nearby, and drown and stir it until it is cold before you leave."
    }),
  fire_options: entry("fire_options", "What you can use to start a fire",
    "Good fire starters, from easiest to hardest:",
    [
      "Lighter or waterproof matches: keep one in a dry bag and one in a pocket.",
      "Ferro rod: hold the striker still against the rod near the tinder and pull the rod back. The sparks land in the tinder instead of scattering it.",
      "Tinder that catches sparks: birch bark, cattail fluff, fatwood shavings (resin-rich pine), dry grass nests, cotton with petroleum jelly, or char cloth.",
      "Battery and steel wool: touch both battery terminals with fine steel wool to make it glow.",
      "Bow drill: a dry softwood board and spindle (cedar, willow, basswood) and a bow. It works but takes practice and energy."
    ],
    { safety: "Only light a fire where it is allowed, and keep water nearby." }),
  fire_lays: entry("fire_lays", "Fire lays",
    "Choose the lay for what you need.",
    [
      "Teepee: lean kindling in a cone over the tinder. Lights fast and burns hot. Good for starting and boiling.",
      "Log cabin: stack pairs of sticks in a square around a small teepee. Burns steadily and makes good coals for cooking.",
      "Lean-to: lean kindling over a log on its windward side. Good in wind.",
      "Star fire: push the ends of five or six logs into the center and slide them in as they burn. Saves fuel through the night."
    ],
    { mistakes: "Packing wood so tight the fire cannot breathe." }),
  fire_wet: entry("fire_wet", "Fire in wet weather or wind",
    "Wet wood is usually only wet on the outside. Find the dry inside.",
    [
      "Take standing dead wood and dead branches still on trees, not wood from the ground.",
      "Split wood to reach the dry core, and carve feather sticks with thin curls still attached.",
      "Look for dry tinder under logs, inside dead stumps, under evergreen skirts, or in fatwood (resin-rich pine).",
      "Build on a platform of sticks so the fire is off wet ground.",
      "Block wind with your body, a pack, or a rock wall, and light on the downwind side."
    ],
    { mistakes: "Using green or soaked wood without splitting it; giving up before the coals build." }),
  fire_bank: entry("fire_bank", "Keeping a fire going overnight",
    "A bed of coals lasts longer than flames.",
    [
      "Let the fire burn down to a thick bed of coals.",
      "Rake the coals together and set one or two large logs on top.",
      "Cover partly with ash or dirt to slow the burn, leaving some airflow.",
      "In the morning, uncover the coals, add fine kindling, and blow gently."
    ],
    { safety: "Do not leave a fire unattended in wind or dry conditions." }),
  fire_out: entry("fire_out", "Putting out a fire",
    "Drown it, stir it, and feel it. It is out when it is cold to the touch.",
    [
      "Pour water over all the coals, not just the red ones.",
      "Stir the ashes with a stick and pour again.",
      "Hold the back of your hand near the ashes. If you feel heat, repeat.",
      "If you have little water, mix in dirt or sand and stir, then feel again. Do not bury hot coals."
    ]),

  water_find: entry("water_find", "Finding water",
    "Look low, follow life, and collect what falls from the sky.",
    [
      "Follow the land downhill into valleys and drainages. Water collects at low points.",
      "Look for green vegetation, cattails, willows, and cottonwoods. Animal trails and birds at dawn and dusk often lead to water.",
      "Dig at the outside bend of a dry stream bed; water may seep in.",
      "Collect rain with a tarp, poncho, or any clean container.",
      "Wipe dew off grass at dawn with a cloth and wring it into a container."
    ],
    { safety: "Treat any water you find before drinking it. Clear-looking water can still make you sick." }),
  water_treat: entry("water_treat", "Making water safe",
    "Boil it if you can. A rolling boil kills germs.",
    [
      "Boil: bring to a rolling boil for 1 minute, or 3 minutes above about 2,000 m (6,500 ft). Let it cool covered.",
      "Filter: use a rated backcountry filter. Most do not stop viruses, so boil or treat too if the source is near people or livestock.",
      "Chemical: use water treatment tablets and follow the package for dose and wait time. Unscented household bleach works in a pinch; follow the label or official guidance for the amount.",
      "Sunlight (SODIS): fill a clear plastic bottle, lay it in full sun for 6 hours, or 2 days if cloudy.",
      "Cloudy water: let it settle, then strain through cloth before treating. Straining alone does not make it safe."
    ],
    {
      mistakes: "Trusting clear water; treating only half the bottle and drinking from the untreated cap threads.",
      safety: "Urine and seawater are not drinking water."
    }),
  water_collect: entry("water_collect", "Collecting water",
    "Collect whatever falls or condenses, then treat it.",
    [
      "Rain: spread a tarp or poncho with one corner low over a container.",
      "Dew: drag a cloth through wet grass at dawn and wring it out.",
      "Transpiration bag: tie a clear plastic bag over a leafy branch of a known non-toxic tree in the sun and collect the water in the low corner.",
      "Snow or ice: melt it before drinking. Eating snow cools you. Start with a little water in the pot so it does not scorch.",
      "Solar still: a pit covered with plastic and a stone over a cup. It yields little; use it only as a last resort."
    ],
    { safety: "Treat collected water before drinking unless it is clean rain caught straight into a clean container." }),
  water_options: entry("water_options", "What you can use for water",
    "Options for getting safe water, best first:",
    [
      "Boil it in any metal pot, can, or bottle: a rolling boil for 1 minute (3 minutes above about 2,000 m / 6,500 ft).",
      "Use a backcountry filter or treatment tablets, following the package.",
      "Catch rain on a tarp or poncho into a clean container.",
      "Melt snow or ice in a pot with a little water already in it.",
      "Use a clear plastic bottle in full sun for 6 hours (SODIS) when you cannot boil."
    ],
    { safety: "Urine and seawater are not drinking water." }),

  nav_lost: entry("nav_lost", "If you are lost",
    "Stop. Staying put is often the safest choice.",
    [
      "S - Stop: sit down, drink, and eat a little. Panic makes it worse.",
      "T - Think: when did you last know where you were? What landmarks have you passed?",
      "O - Observe: look for ridges, streams, roads, power lines, and the sun's direction.",
      "P - Plan: if you are not sure of the way, stay where you are, make yourself visible, and signal. Searchers find people who stay put sooner.",
      "If you do move, mark your route and travel toward a large, sure feature like a road or river you know is there."
    ],
    { mistakes: "Pushing on while tired or in the dark; following a stream downhill into a cliff or canyon." }),
  nav_compass: entry("nav_compass", "Map and compass",
    "Orient the map, then follow a bearing.",
    [
      "Lay the compass edge along a line from where you are to where you want to go.",
      "Turn the dial until its lines run with the map's north-south lines, with north up.",
      "Correct for declination: for an east declination, subtract it to get a magnetic bearing to walk; to turn a magnetic reading into a true bearing, add east declination.",
      "Hold the compass level, turn your body until the needle sits in the outline arrow, and walk where the arrow points.",
      "Sight on a landmark along that line, walk to it, and repeat."
    ],
    { mistakes: "Holding the compass near metal or a phone; forgetting declination; not checking back often." }),
  nav_no_gps: entry("nav_no_gps", "Finding direction without GPS",
    "Use the sun and stars for a rough direction, then pick a landmark.",
    [
      "Stick shadow: push a stick upright, mark the tip of its shadow, wait 15 minutes, and mark again. The line from the first mark to the second runs roughly west to east.",
      "Sun: it rises roughly east and sets roughly west. At midday in the northern hemisphere it is to the south.",
      "North Star: follow the two outer stars of the Big Dipper's cup about five times their distance to Polaris. It sits almost exactly north.",
      "Handrails and backstops: follow a stream, ridge, or trail as a handrail, and know what feature tells you that you went too far.",
      "Aim off: aim a little to one side of a target on a line feature, so you know which way to turn when you hit it."
    ],
    { mistakes: "Trusting moss or tree growth; it is not a compass." }),

  signal: entry("signal", "Signaling for help",
    "Make yourself big, bright, and in threes.",
    [
      "Whistle: three short blasts, pause, repeat. It carries farther than your voice and saves energy.",
      "Mirror: hold a V with two fingers of your free hand, put the target between them, and tilt the mirror so the light spot hits your fingers. Sweep it slowly across aircraft or distant people.",
      "Ground symbols: make a large V (need help) or X (need medical help), at least 3 m (10 ft) long, with contrasting rocks, logs, or clothing in an open area.",
      "Fire: three fires in a triangle are a distress signal. Add green boughs for white smoke in the day.",
      "Phone: if you have any signal, text emergency services or send a location. Texts can get through when calls cannot.",
      "Bright clothing or a tarp spread in the open is visible from the air."
    ],
    { mistakes: "Moving deep into trees where you cannot be seen; using up a phone battery searching for signal." }),

  cold_hypothermia: entry("cold_hypothermia", "Warming someone who is too cold",
    "Stop the heat loss first: out of the wind, out of wet clothes, off the ground.",
    [
      "Get them into shelter and onto insulation.",
      "Replace wet clothes with dry ones, and add a hat.",
      "Wrap them in a sleeping bag or blankets with a vapor barrier like a tarp or emergency blanket.",
      "Put warm (not hot) water bottles or heat packs at the chest, armpits, and groin.",
      "If they are awake and can swallow, give warm sweet drinks and food.",
      "Handle a very cold person gently and keep them lying down."
    ],
    {
      mistakes: "Rubbing the arms and legs; giving alcohol; letting them walk around if severely cold.",
      safety: "Confusion, slurred speech, or shivering that stops are emergencies; get help as fast as you can."
    }),
  cold_layers: entry("cold_layers", "Staying warm",
    "Layer, stay dry, and adjust before you sweat or shiver.",
    [
      "Base layer: wool or synthetic next to skin, never cotton in the cold.",
      "Insulating layer: fleece or puffy jacket.",
      "Shell: wind and rain jacket.",
      "Cover your head, neck, and hands. Eat and drink often; your body needs fuel to make heat.",
      "Take a layer off when you start working hard, and put it back on when you stop."
    ],
    { mistakes: "Cotton clothing; tight boots that cut circulation; waiting until you shiver to add a layer." }),
  heat: entry("heat", "Heat illness",
    "Cool them fast and get help for heat stroke.",
    [
      "Move them to shade and loosen or remove extra clothing.",
      "Heat stroke (hot skin, confusion, collapse): cool immediately. Soak them with water, fan them, and put cold packs at the neck, armpits, and groin. Cold water immersion is best if you can do it.",
      "Heat exhaustion (heavy sweat, dizziness, nausea): rest in shade, sip water or an electrolyte drink, and cool the skin.",
      "Prevent it: travel early and late, rest in shade at midday, and drink small amounts often."
    ],
    { safety: "Heat stroke is life-threatening; call for help while you cool them." }),

  knots: entry("knots", "Useful knots",
    "Five knots cover most camp jobs. If you learn only two knots, learn the bowline and the taut-line hitch. Carry about 15 m (50 ft) of strong cord such as paracord.",
    [
      "Bowline: a fixed loop that will not slip and unties easily. Make a small loop, pass the end up through it, around the standing line, and back down the loop.",
      "Taut-line hitch: an adjustable loop for tent lines. Wrap the end twice inside the loop around the standing line, then once outside, and snug it. Slide to tighten.",
      "Clove hitch: two wraps around a pole, crossing over itself, with the end tucked under the second wrap. Quick to tie a line to a post.",
      "Trucker's hitch: make a loop in the line, pass the end around an anchor and back through the loop, then pull for 3-to-1 tension and lock it with two half hitches. Best for a tight ridgeline.",
      "Two half hitches: wrap the end around a tree and tie two half hitches on the standing line. Simple anchor."
    ],
    { mistakes: "Leaving the tail too short; using a knot that jams under load when you need to untie it." }),
  ridgeline: entry("ridgeline", "Setting a ridgeline",
    "A tight ridgeline makes any tarp shelter stronger.",
    [
      "Tie one end to a tree with a bowline or two half hitches, about waist to chest height.",
      "Run the line to the second tree, around it, and tension it with a trucker's hitch.",
      "Lock it with two half hitches or a slipped hitch so it is easy to undo.",
      "Hang the tarp over it and stake the sides."
    ],
    { mistakes: "Tying to dead or thin trees; a sag that lets water pool." }),
  cordage: entry("cordage", "Making cordage from plants",
    "Twist plant fibers in opposite directions to make strong cord.",
    [
      "Find long fibers: the inner bark of basswood, willow, or cedar, or the dry stems of dogbane, nettle, or milkweed.",
      "Strip and soak the fibers if dry, then split them into thin strands.",
      "Hold a bundle in the middle and twist it until it kinks into two strands.",
      "Reverse wrap: twist each strand away from you, then lay them over each other toward you. Repeat.",
      "Add new fibers by overlapping them before a strand runs out."
    ],
    { mistakes: "Using short, brittle fibers; uneven twists that unravel." }),

  food: entry("food", "Finding food",
    "Food can wait. You can go weeks without it; shelter and water come first.",
    [
      "Eat only plants you can identify with certainty. Many look-alikes are deadly.",
      "Fish with a line and hook, a gorge hook, or a simple net where it is legal.",
      "Insects like grasshoppers, crickets, and grubs are high in protein. Cook them first.",
      "Trap only where legal and only if you know how. Snares need many sets and frequent checks.",
      "Clean game and fish away from camp, and cook meat thoroughly."
    ],
    {
      mistakes: "Eating unknown berries or mushrooms; spending more energy hunting than you gain.",
      safety: "If you are not sure what a plant is, do not eat it."
    }),
  food_store: entry("food_store", "Storing food in the wild",
    "Keep food away from where you sleep and away from animals.",
    [
      "Cook and eat at least 60 m (200 ft) downwind of your sleep spot.",
      "Use a bear canister where required, or hang food at least 4 m (12 ft) up and 2 m (6 ft) from the trunk.",
      "Store toiletries and trash with the food.",
      "Keep food sealed so smells do not spread."
    ]),

  knife: entry("knife", "Knife safety and use",
    "Cut away from yourself and keep the blade sharp.",
    [
      "Check your blood circle: hold the knife at arm's length and turn; no one should be inside that circle.",
      "Cut away from your body, with your free hand behind the blade.",
      "Use a sharp blade; a dull one slips.",
      "Baton to split wood: set the blade on a log end and tap the spine with another stick.",
      "Close or sheath it when you are not using it."
    ],
    { mistakes: "Cutting toward your thigh; prying with the tip." }),
  kit_72: entry("kit_72", "72-hour kit",
    "Pack for three days without help.",
    [
      "Water: about 4 L (1 gallon) per person per day, plus a way to treat more.",
      "Food: three days of ready-to-eat food and a can opener.",
      "Light and power: flashlight or headlamp, spare batteries, and a power bank.",
      "First aid kit and a week of any needed medicine.",
      "Warmth and shelter: emergency blanket, rain poncho, and a change of clothes.",
      "Tools: knife or multitool, whistle, duct tape, and a battery or crank radio.",
      "Papers and cash: copies of IDs, contacts on paper, and small bills."
    ]),
  kit_vehicle: entry("kit_vehicle", "Vehicle emergency kit",
    "Keep enough in the car to wait out a breakdown.",
    [
      "Water and snacks for everyone.",
      "Blankets, warm clothes, hats, and gloves.",
      "Flashlight, phone charger, jumper cables, and road flares or reflective triangles.",
      "First aid kit, multitool, and a small shovel.",
      "In winter: an ice scraper, cat litter or sand for traction, and keep the tank at least half full."
    ],
    { safety: "If stuck in snow, keep the exhaust pipe clear and run the engine only briefly with a window cracked." }),

  lightning: entry("lightning", "Lightning",
    "When thunder roars, get indoors or into a hard-top car.",
    [
      "If you hear thunder, you are close enough to be struck. Head for a building or a hard-top vehicle.",
      "Wait 30 minutes after the last thunder before going back out.",
      "If you cannot reach shelter, get off peaks, ridges, and open fields to lower ground. Stay away from tall lone trees, water, and metal fences.",
      "Groups should spread out at least 15 m (50 ft) apart.",
      "As a last resort, crouch low on the balls of your feet with feet together, on a pad if you have one."
    ]),
  flood: entry("flood", "Flash floods",
    "Climb to higher ground and stay out of moving water.",
    [
      "Watch for rising water, muddy water, debris, or a roar upstream.",
      "Move to higher ground right away. Do not wait for it to look bad.",
      "Never walk or drive through moving water. About 15 cm (6 in) can knock you down and about 30 cm (1 ft) can float a car.",
      "Do not camp in dry washes or narrow canyons when storms are possible, even far upstream."
    ]),
  river: entry("river", "Crossing a river",
    "Cross only if you must, at the safest spot you can find.",
    [
      "Scout for a wide, shallow, slow section to wade. Avoid bends, rapids, and anything above knee depth that moves fast.",
      "Unbuckle your pack's hip belt and chest strap so you can shed it.",
      "Keep shoes on. Face upstream and use a strong stick as a third leg, moving one point at a time.",
      "Groups can link arms or hold a pole together.",
      "Cross in the morning when snowmelt rivers are lower."
    ],
    { safety: "If in doubt, do not cross. Wait or find another way." }),
  avalanche: entry("avalanche", "Avalanche basics",
    "Avoid steep slopes after new snow or wind.",
    [
      "Most avalanches start on slopes of 30 to 45 degrees.",
      "Warning signs: recent heavy snow, wind-loaded drifts, cracking or collapsing snow, and recent slides.",
      "Cross one at a time and stay on ridges or low-angle terrain.",
      "Carry a beacon, probe, and shovel, and know how to use them. Check the local avalanche forecast.",
      "If caught, try to get off to the side, fight to stay on top, and make an air space in front of your face as it slows."
    ]),
  thin_ice: entry("thin_ice", "Thin ice",
    "Stay off ice unless you know its thickness.",
    [
      "Clear, solid ice at least 10 cm (4 in) thick is the usual minimum for walking. Gray, slushy, or cracked ice is weaker.",
      "Avoid ice near inlets, outlets, and moving water.",
      "If you fall in: control your breathing for the first minute, turn back the way you came, kick your legs, and pull yourself onto the ice on your belly.",
      "Roll away from the hole and do not stand up until you are on solid ice or land.",
      "Get warm and dry right away."
    ]),

  bears: entry("bears", "Bears",
    "Know which bear you are dealing with.",
    [
      "Avoid surprises: make noise, travel in groups, and keep food stored away from camp.",
      "Carry bear spray where bears live, and know how to use it. Spray when the bear is close, aiming low.",
      "If you see a bear: stay calm, speak firmly, back away slowly. Do not run.",
      "Grizzly or brown bear attack (defensive): play dead on your stomach, hands behind your neck, legs spread.",
      "Black bear attack, or any bear attacking you in your tent: fight back hard, hitting the face."
    ]),
  lion: entry("lion", "Mountain lions",
    "Look big, do not run, and fight back if attacked.",
    [
      "Stand tall, open your jacket, and raise your arms.",
      "Pick up small children without crouching.",
      "Speak loudly and back away slowly. Do not turn your back or run.",
      "If it attacks, fight back with rocks, sticks, or your hands, aiming at the face."
    ]),
  snakes: entry("snakes", "Snakes and snakebite",
    "Give snakes space; most bites happen when people try to handle or kill them.",
    [
      "Watch where you put hands and feet, especially near rocks and logs.",
      "If bitten: move away from the snake, keep calm, and keep the bitten limb still at about heart level.",
      "Remove rings, watches, and tight clothing before swelling starts.",
      "Get to medical care as fast as you safely can."
    ],
    { safety: "Do not cut, suck, ice, or put a tourniquet on a snakebite." }),
  ticks: entry("ticks", "Ticks",
    "Check often and remove them early.",
    [
      "Wear long pants tucked into socks and use a repellent on clothing.",
      "Check your body and scalp each evening.",
      "To remove: grab the tick with fine tweezers as close to the skin as you can and pull straight out with steady pressure.",
      "Clean the bite and your hands. Note the date.",
      "Watch for a rash or fever over the next few weeks and see a doctor if either shows up."
    ],
    { mistakes: "Twisting or squeezing the tick's body; burning it off." }),

  outage: entry("outage", "Power outage",
    "Use safe light, keep food cold, and keep air safe.",
    [
      "Use flashlights or headlamps, not candles.",
      "Keep the fridge and freezer closed. A fridge stays cold about 4 hours; a full freezer about 48 hours.",
      "Run a generator only outdoors, at least 6 m (20 ft) from windows and doors.",
      "Unplug electronics to avoid a surge when power returns.",
      "Check on neighbors who may need help."
    ],
    { safety: "Never use a grill, camp stove, or generator indoors; carbon monoxide can kill." }),
  shelter_in_place: entry("shelter_in_place", "Shelter in place",
    "Get inside, stay inside, and listen for official updates.",
    [
      "Go to an inside room with few windows, on a low floor.",
      "For a chemical release: close windows and doors, turn off fans and air systems, and seal gaps with tape and plastic.",
      "Bring water, food, a radio, a light, and any medicine.",
      "Stay until officials say it is safe."
    ]),
  evacuate: entry("evacuate", "Evacuating",
    "Leave early, and know two ways out.",
    [
      "Keep a go-bag packed: water, food, medicine, documents, chargers, and a change of clothes.",
      "Plan two routes out and a meeting place.",
      "Leave when told to, or earlier if you feel unsafe.",
      "Turn off utilities if told to, lock up, and tell someone where you are going."
    ]),
  boil_notice: entry("boil_notice", "Boil-water notice",
    "Boil tap water before you drink it, cook with it, or brush your teeth.",
    [
      "Bring water to a rolling boil for 1 minute (3 minutes above about 2,000 m / 6,500 ft), then let it cool.",
      "Use bottled or boiled water for drinking, ice, baby formula, and food prep.",
      "Wash dishes with boiled water or a dishwasher with a sanitize cycle.",
      "After the notice ends, flush taps for several minutes."
    ]),
  sanitation: entry("sanitation", "Sanitation without plumbing",
    "Keep waste contained and hands clean.",
    [
      "Line a sturdy bucket with two heavy trash bags for a toilet.",
      "Add kitty litter, sawdust, or dirt after each use to cut smell.",
      "Seal and store bags away from living areas until they can be disposed of.",
      "Wash hands with soap and water, or use hand sanitizer.",
      "Outdoors: dig a cathole 15 to 20 cm (6 to 8 in) deep, at least 60 m (200 ft) from water."
    ])
};

const WORD = (pattern) => new RegExp(pattern, "i");

// Ordered: specific subtopics first, then topic-level questions. Each route lists the
// patterns that must match. "ask" means the line reads as a request for practical help.
const ROUTES = [
  { id: "debris_hut", test: WORD("\\bdebris (hut|shelter)\\b") },
  { id: "lean_to", test: WORD("\\blean[- ]?to\\b"), not: WORD("\\bfire\\b.*\\blay|lay\\b") },
  { id: "snow_shelter", test: WORD("\\b(snow (shelter|cave|trench|hut)|quinzh?ee|igloo|tree well)\\b") },
  { id: "tarp", test: WORD("\\b(tarp|poncho|a-frame)\\b"), with: WORD("\\b(shelter|pitch|set ?up|rig|tent|use|make|build)\\b") },
  { id: "ground_insulation", test: WORD("\\b(ground insulation|insulat\\w* (from|under|off)|sleep(ing)? (on|off) the ground|bough bed|bed of boughs|cold ground)\\b") },
  { id: "natural_shelter", test: WORD("\\b(natural shelter|rock overhang|overhang|fallen (tree|log) shelter)\\b") },
  { id: "stay_dry", test: WORD("\\b(stay(ing)? dry|keep(ing)? dry|wet clothes)\\b"), not: WORD("\\b(fire|wood|tinder|match)") },
  { id: "shelter_site", test: WORD("\\b(shelter site|where (should|do|can) (i|we) (build|put|set up|pitch|make)\\b.*\\b(shelter|camp|tent|tarp))\\b|\\bwhere to (build|put|pitch) (a |my |the )?(shelter|camp|tent|tarp)\\b") },
  { id: "shelter_options", test: WORD("\\b(what|which)\\b.*\\b(could|can|should|do|might)\\b.*\\buse\\b.*\\bshelter\\b|\\bshelter (materials|options|ideas)\\b|\\b(materials?|things?|stuff)\\b.*\\b(for|to make|to build)\\b.*\\bshelter\\b|\\bwhat (kind|type)s? of shelter\\b") },
  { id: "shelter_now", test: WORD("^\\s*(i|we)\\s+(really\\s+)?(need|want|have to (find|build|make|get))\\s+(a\\s+|some\\s+)?shelter\\b|\\b(how (do|can|could|should) (i|we) (build|make|set up|put up)|help me (build|make)|build(ing)? an? (emergency |survival |quick )?)\\s*(a |an )?(emergency |survival |quick |simple )?shelter\\b") },

  { id: "fire_out", test: WORD("\\b(put out|extinguish|douse|drown)\\b.*\\bfire\\b") },
  { id: "fire_bank", test: WORD("\\b(bank|keep)\\b.*\\bfire\\b.*\\b(night|going|overnight|alive)\\b|\\bfire\\b.*\\b(all night|overnight)\\b") },
  { id: "fire_wet", test: WORD("\\bfire\\b.*\\b(wet|rain|damp|wind|snow)\\b|\\b(wet|damp)\\b.*\\b(wood|tinder)\\b") },
  { id: "fire_lays", test: WORD("\\b(fire lays?|teepee|tipi|log cabin|star fire|lay a fire|fire structure)\\b") },
  { id: "fire_options", test: WORD("\\b(what|which)\\b.*\\b(could|can|should|do)\\b.*\\buse\\b.*\\b(start|light|make)\\b.*\\bfire\\b|\\b(ferro ?rod|fire ?steel|bow drill|fire starters?|tinder)\\b|\\bwithout (a )?(lighter|matches)\\b") },
  { id: "fire_start", test: WORD("\\b(how (do|can|could|should) (i|we)|help me|need to|teach me to)\\b.*\\b(start|build|make|light)\\b.*\\bfire\\b|^\\s*(i|we) need (a )?fire\\b") },

  { id: "water_collect", test: WORD("\\b(collect|catch|gather|harvest)\\b.*\\b(water|rain|dew)\\b|\\b(solar still|transpiration bag|melt snow)\\b") },
  { id: "water_options", test: WORD("\\b(what|which)\\b.*\\b(could|can|should|do)\\b.*\\buse\\b.*\\b(water|drink)\\b") },
  { id: "water_treat", test: WORD("\\b(purify|purif\\w+|disinfect|make)\\b.*\\bwater\\b.*\\b(safe|drinkable|potable)?|\\bwater (purification|treatment|filter)\\b|\\bsodis\\b"), not: WORD("\\b(charcoal|iodine|cloudy|heat|note|notes)\\b") },
  { id: "water_find", test: WORD("\\b(find|finding|locate|get|source of|sources of)\\b.*\\bwater\\b|^\\s*(i|we) need water\\b"), not: WORD("\\b(nearest water|show water|where is water|treat|cloudy|note)\\b") },

  { id: "nav_lost", test: WORD("\\b(i('| a)m|we('| a)re|got|get|getting) lost\\b|\\bif (you|i) (are|am|get) lost\\b"), not: WORD("\\b(whistle|signal|mirror)\\b") },
  { id: "nav_no_gps", test: WORD("\\b(without (a )?(gps|compass|phone|map)|north star|polaris|stick shadow|shadow stick|find (north|direction)|which way is north)\\b"), not: WORD("\\b(moss|how far|distance|walked|pace)\\b") },
  { id: "nav_compass", test: WORD("\\b(use|read|using|reading) (a |the )?(map and )?compass\\b|\\bmap and compass\\b|\\btake a bearing\\b") },

  { id: "signal", test: WORD("\\b(signal(l?ing)? (mirror|fire)|ground[- ]to[- ]air|signal for (rescue|a helicopter|a plane|aircraft)|get rescued|be found|attract (rescue|attention)|signal(l?ing)? options|ways to signal)\\b") },

  { id: "cold_hypothermia", test: WORD("\\b(hypotherm\\w*|warm (someone|a person|him|her|them) up|rewarm)\\b"), not: WORD("\\bfrostbite\\b") },
  { id: "cold_layers", test: WORD("\\b(stay|keep|staying|keeping) warm\\b|\\blayering\\b|\\bwhat to wear\\b.*\\bcold\\b") },
  { id: "heat", test: WORD("\\b(heat ?stroke|heat exhaustion|heat illness|overheat\\w*|too hot)\\b"), not: WORD("\\bdehydr") },

  { id: "ridgeline", test: WORD("\\bridge ?line\\b"), with: WORD("\\b(tarp|tie|rig|set ?up|hang|pitch|tension|tight)\\b") },
  { id: "cordage", test: WORD("\\b(cordage|make (rope|cord|string)|plant fib(er|re)s?)\\b") },
  { id: "knots", test: WORD("\\b(knots?|bowline|taut[- ]?line|clove hitch|trucker'?s hitch|half hitch)\\b"), not: WORD("\\d\\s*knots?\\b|\\bknots? (per|an|of speed)\\b|\\b(boat|ship|wind speed|nautical)\\b") },

  { id: "food_store", test: WORD("\\bbears? (away )?from (my |the )?(food|cooking|camp|kitchen)|\\b(store|hang|protect)\\b.*\\bfood\\b|\\bbear (hang|canister|bag)\\b") },
  { id: "food", test: WORD("\\b(find|finding|get|catch|forage)\\b.*\\bfood\\b|^\\s*(i('| a)m|we('| a)re) (hungry|starving)\\b|\\bfood in the wild\\b|\\bwhat (can|could) (i|we) eat\\b"), not: WORD("\\b(berry|berries|mushroom|plant|leaf|leaves|root|bark)\\b") },

  { id: "knife", test: WORD("\\bknife (safety|skills|use|uses)\\b|\\b(use|using|handle) a knife\\b|\\bbaton(ing)?\\b") },
  { id: "kit_vehicle", test: WORD("\\b(car|vehicle|truck) (emergency |survival )?kit\\b") },
  { id: "kit_72", test: WORD("\\b(72[- ]hour|bug[- ]?out|go[- ]?bag|emergency kit|survival kit|what should i pack)\\b") },

  { id: "lightning", test: WORD("\\blightning\\b|\\bthunder ?storm\\b") },
  { id: "flood", test: WORD("\\bflash flood|\\bflood(ing|s)?\\b"), not: WORD("\\b(flood line)\\b") },
  { id: "river", test: WORD("\\b(cross|crossing|ford|fording)\\b.*\\b(river|stream|creek)\\b") },
  { id: "avalanche", test: WORD("\\bavalanche\\b") },
  { id: "thin_ice", test: WORD("\\b(thin ice|ice thickness|fall(en)? through (the )?ice|safe ice|walk on ice)\\b") },

  { id: "bears", test: WORD("\\b(bears?|grizzl\\w*)\\b"), not: WORD("\\b(bear (hang|canister|bag)|bears? in mind|bears? (fruit|weight|the|a|an|on|witness|repeating|responsibility)|bear market)\\b") },
  { id: "lion", test: WORD("\\b(mountain lion|cougar|puma)\\b") },
  { id: "snakes", test: WORD("\\b(snake ?bites?|snakes?|rattlesnake|viper)\\b") },
  { id: "ticks", test: WORD("\\b(tick ?bites?|remove (a |the )?ticks?|ticks? (on|in) (me|my|him|her|the skin|skin)|lyme|deer ticks?|tick checks?|(avoid|prevent|repel|keep off|keep away) ticks?|got a tick|bitten by a tick|about ticks)\\b") },

  { id: "outage", test: WORD("\\b(power (outage|cut|failure)|blackout|power is out|lost power|no power|power went out)\\b") },
  { id: "shelter_in_place", test: WORD("\\bshelter[- ]in[- ]place\\b") },
  { id: "evacuate", test: WORD("\\bevacuat\\w*\\b") },
  { id: "boil_notice", test: WORD("\\bboil[- ](water )?(notice|advisory|order)\\b") },
  { id: "sanitation", test: WORD("\\b(sanitation|bucket toilet|cathole|cat hole|toilet without|no plumbing|toilet (doesn'?t|does not|won'?t) flush)\\b") }
];

// A guide answer is for practical "how / what / I need" lines. A quiz about what a
// specific note says, a number, or a myth check still goes to the field notes.
const QUIZ = /\b(note|notes|says?|said|according|how many|which way should|what should i get out of|before i think|blasts?|distress pattern|myth|true or false|right\?)\b/i;
const PRACTICAL = /\b(how|what|which|ways?|tips?|help|need|should i|can i|could i|i'?m|i am|we'?re|we are|teach|explain|options?|ideas?|steps?|safe|do i|do we)\b/i;

export function routeFieldGuide(input) {
  const raw = String(input ?? "").trim();
  if (raw.length < 4 || raw.length > 220) return null;
  if (QUIZ.test(raw)) return null;
  // Two questions in one line go to the joined-answer path, not a single guide card.
  if (/\band also\b/i.test(raw) || (raw.match(/\?/g) || []).length > 1) return null;
  if (!PRACTICAL.test(raw) && !/\b(debris hut|lean[- ]?to|quinzh?ee|bowline|ridge ?line|cordage)\b/i.test(raw)) return null;
  for (const route of ROUTES) {
    if (!route.test.test(raw)) continue;
    if (route.with && !route.with.test(raw)) continue;
    if (route.not && route.not.test(raw)) continue;
    return GUIDE[route.id] ? route.id : null;
  }
  return null;
}

export function formatGuide(item) {
  const parts = [item.lead];
  parts.push(item.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"));
  if (item.materials) parts.push(`You can use ${item.materials.charAt(0).toLowerCase()}${item.materials.slice(1)}`);
  if (item.mistakes) parts.push(`Common mistakes: ${item.mistakes.charAt(0).toLowerCase()}${item.mistakes.slice(1)}`);
  if (item.safety) parts.push(item.safety);
  return parts.join("\n\n");
}

/**
 * A step-first field answer, or null. Pure: no I/O, no state.
 */
export function fieldGuideAnswer(input) {
  const id = routeFieldGuide(input);
  if (!id) return null;
  const item = GUIDE[id];
  const text = formatGuide(item);
  const hit = { kind: "survival", symbol: `guide_${id}`, title: item.title, source: FIELD_GUIDE_SOURCE, text };
  return { text, kind: "survival", symbol: hit.symbol, title: item.title, source: FIELD_GUIDE_SOURCE, hits: [hit] };
}

export function fieldGuideTopics() {
  return Object.keys(GUIDE);
}

export function fieldGuideEntry(id) {
  return GUIDE[id] || null;
}
