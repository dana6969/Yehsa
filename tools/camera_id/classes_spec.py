# Camera-ID class list for round 3. One row per thing Yehsa can suggest.
# Row: id | title | iNaturalist taxa (comma list of scientific names) | group | use | look-for | look-alike ids | extra caution
# group: plant tree mushroom animal track scat
# use: edible medicinal toxic deadly tree mushroom animal sign
# Photos are fetched from iNaturalist research-grade observations with CC0 / CC BY / CC BY-SA photos only.
# Nothing here is a verdict: every result on the phone is shown as a photo hint with these look-alikes.
ROWS = """
yarrow|Yarrow|Achillea millefolium|plant|medicinal|Feathery, finely divided leaves in a fern-like pattern; flat clusters of small white flowers. Crushed leaves smell sharp.|wild_carrot,poison_hemlock,water_hemlock|
plantain|Plantain|Plantago major,Plantago lanceolata|plant|medicinal|Rosette of ribbed leaves with parallel veins and a stringy core when torn; a narrow seed spike.||
willow|Willow|Salix|tree|medicinal|Narrow leaves, often pale underneath; slim flexible twigs; usually near water.||
wild_carrot|Wild carrot (Queen Anne's lace)|Daucus carota|plant|edible|Hairy stem, finely cut leaves, flat white umbrella with one dark floret in the centre, smells of carrot.|poison_hemlock,water_hemlock,yarrow|Poison hemlock has a smooth stem with purple blotches. Do not rely on a photo.
poison_hemlock|Poison hemlock|Conium maculatum|plant|deadly|Smooth hairless stem with purple blotches, finely cut leaves, white umbrella flowers. Smells musty.|wild_carrot,water_hemlock,yarrow|Every part is deadly.
water_hemlock|Water hemlock|Cicuta|plant|deadly|Wet ground; clustered tuberous roots; leaves with sharp toothed leaflets and side veins that run to the notches.|poison_hemlock,wild_carrot,yarrow|One of the most toxic plants in North America. Every part is deadly.
wild_onion|Wild onion|Allium canadense,Allium vineale,Allium cernuum|plant|edible|Round or flat grass-like leaves that smell of onion when crushed; a bulb at the base.|death_camas|If it has no onion smell it is not a wild onion. Death camas has no onion smell.
death_camas|Death camas|Toxicoscordion,Anticlea,Zigadenus|plant|deadly|Onion-like grass leaves from a bulb, cream or greenish flower cluster. No onion smell.|wild_onion|Every part is deadly.
ramps|Ramps (wild leek)|Allium tricoccum|plant|edible|Two or three broad smooth leaves per plant in spring, red-purple stalk base, strong onion and garlic smell.|false_hellebore,lily_of_valley|Check smell on every leaf. False hellebore and lily of the valley grow in the same woods and are deadly.
false_hellebore|False hellebore (Indian poke)|Veratrum viride|plant|deadly|Big pleated leaves that wrap the stem in a spiral; wet woods and meadows. No onion smell.|ramps|Sometimes mistaken for ramps. Deadly.
lily_of_valley|Lily of the valley|Convallaria majalis|plant|deadly|Two smooth upright leaves, small white bells on an arching stem, red berries.|ramps|Mistaken for ramps. Every part is deadly.
dandelion|Dandelion|Taraxacum officinale|plant|edible|Rosette of toothed leaves, one yellow flower per hollow stalk, milky sap.|chicory|
chicory|Chicory|Cichorium intybus|plant|edible|Sky blue flowers on stiff, nearly leafless stems along roadsides; milky sap.|dandelion|
red_clover|Red clover|Trifolium pratense|plant|edible|Pink-purple round flower heads; three leaflets with a pale V mark.|white_clover|
white_clover|White clover|Trifolium repens|plant|edible|Low creeping plant, white round flower heads, three leaflets often with a pale band.|red_clover|
burdock|Burdock|Arctium|plant|edible|Very large heart-shaped leaves, hooked burr heads, purple thistle-like flowers.|foxglove|Young leaves can be mistaken for foxglove, which is deadly.
foxglove|Foxglove|Digitalis purpurea|plant|deadly|Fuzzy leaves in a rosette, tall spike of tubular pink-purple bells.|burdock,comfrey|Deadly to the heart. Often confused with comfrey in the first year.
comfrey|Comfrey|Symphytum officinale|plant|toxic|Rough hairy leaves, bell flowers in curled clusters.|foxglove|Contains liver-damaging compounds. Do not eat or brew it.
cattail|Cattail|Typha|plant|edible|Tall blade leaves, brown sausage-shaped seed head; wet places.|iris_flag|Iris leaves look alike before flowering and are toxic.
iris_flag|Wild iris (blue flag, yellow flag)|Iris versicolor,Iris pseudacorus|plant|toxic|Flat sword-shaped leaves in a fan; blue-violet or yellow flowers; wet ground.|cattail|Toxic if eaten. Often mistaken for cattail shoots.
wild_strawberry|Wild strawberry|Fragaria virginiana|plant|edible|Three toothed leaflets, white five-petal flowers, tiny red berries with seeds on the outside.||
brambles|Blackberry and raspberry (Rubus)|Rubus|plant|edible|Arching prickly canes, toothed compound leaves, clustered berries made of tiny beads.||
blueberry|Blueberry|Vaccinium angustifolium,Vaccinium corymbosum,Vaccinium myrtilloides|plant|edible|Low shrub, small oval leaves, blue berries with a five-point crown at the tip.||
cranberry|Cranberry|Vaccinium macrocarpon,Vaccinium oxycoccos|plant|edible|Trailing evergreen vine in bogs, tiny leaves, red berries.||
elderberry|Elderberry|Sambucus canadensis,Sambucus racemosa|plant|edible|Opposite compound leaves, flat clusters of white flowers, dark purple (or red) berries, pithy stems.|water_hemlock,pokeweed|Raw berries, leaves and stems are toxic. Cook the berries.
pokeweed|Pokeweed|Phytolacca americana|plant|toxic|Purple-red stems, large leaves, drooping clusters of dark purple berries.|elderberry|Berries, roots and mature leaves are toxic.
staghorn_sumac|Staghorn sumac|Rhus typhina|plant|edible|Fuzzy velvet twigs, long compound leaves, upright red fuzzy berry cones.|poison_sumac|Poison sumac has white drooping berries and grows in wet ground.
poison_sumac|Poison sumac|Toxicodendron vernix|plant|toxic|Wet ground, smooth stems, leaves with a red stalk, drooping white-grey berries.|staghorn_sumac|Skin contact causes a severe rash.
poison_ivy|Poison ivy|Toxicodendron radicans|plant|toxic|Three leaflets, the middle one on a longer stalk; hairy vine on trees; leaves red in autumn.|virginia_creeper|Leaves of three. Skin contact causes a rash. Smoke from burning it is dangerous.
virginia_creeper|Virginia creeper|Parthenocissus quinquefolia|plant|toxic|Five leaflets spread like a hand; climbing vine with tendrils.|poison_ivy|Berries are toxic. Sometimes mistaken for poison ivy.
stinging_nettle|Stinging nettle|Urtica dioica|plant|edible|Opposite toothed leaves with stinging hairs, square stem, small green flower strings.||Stings on touch. Cooking removes the sting.
lambsquarters|Lambsquarters|Chenopodium album|plant|edible|Diamond-shaped leaves with a white mealy powder underneath.||
wood_sorrel|Wood sorrel|Oxalis stricta,Oxalis montana|plant|edible|Heart-shaped leaflets in threes like a clover, small yellow or pink five-petal flowers; sour taste.|white_clover|Eat only small amounts.
jewelweed|Jewelweed|Impatiens capensis,Impatiens pallida|plant|medicinal|Orange or yellow spotted trumpet flowers, pale watery stems, leaves bead up water; seed pods burst when touched.||
ostrich_fern|Ostrich fern (fiddleheads)|Matteuccia struthiopteris|plant|edible|Tightly coiled fiddlehead with a smooth U-shaped groove on the inside of the stem, papery brown scales.|bracken|Fiddleheads must be cooked. Bracken is not safe to eat.
bracken|Bracken fern|Pteridium aquilinum|plant|toxic|Large triangular fronds on a single stalk, fuzzy coiled shoots, open ground.|ostrich_fern|Toxic and linked to cancer. Do not eat.
common_milkweed|Common milkweed|Asclepias syriaca|plant|toxic|Thick stem with milky white sap, big opposite oval leaves, pink ball flower clusters, warty pods.|dogbane|Toxic raw. Only a trained forager should use it, and not by photo.
dogbane|Dogbane|Apocynum cannabinum,Apocynum androsaemifolium|plant|toxic|Red-tinged stems with milky sap, pointed opposite leaves, tiny white bells, slim paired pods.|common_milkweed|Toxic to the heart. Looks like milkweed.
mullein|Mullein|Verbascum thapsus|plant|medicinal|Large grey fuzzy leaves in a rosette and a tall yellow flower spike in the second year.||
st_johns_wort|St. John's wort|Hypericum perforatum|plant|medicinal|Opposite small leaves with see-through dots when held to light; yellow five-petal flowers that stain purple.||Interacts with many medicines and causes sun sensitivity.
self_heal|Self-heal|Prunella vulgaris|plant|medicinal|Low plant, square stem, spiky purple flower head with ruffled lips.||
goldenrod|Goldenrod|Solidago|plant|medicinal|Tall plume of tiny yellow flowers in late summer, alternate narrow leaves.||
white_snakeroot|White snakeroot|Ageratina altissima|plant|toxic|Opposite toothed leaves on a branching stem, fuzzy white flower clusters in autumn.||Poisons livestock and milk. Do not eat.
jerusalem_artichoke|Jerusalem artichoke|Helianthus tuberosus|plant|edible|Tall rough sunflower-like plant with small yellow flowers and knobby tubers.||
evening_primrose|Evening primrose|Oenothera biennis|plant|edible|Tall plant with four-petal yellow flowers that open at dusk, reddish stem.||
pineapple_weed|Pineapple weed|Matricaria discoidea|plant|edible|Low plant with feathery leaves, yellow-green cone flowers with no petals; smells like pineapple when crushed.||
wild_bergamot|Wild bergamot|Monarda fistulosa|plant|medicinal|Square stem, lavender shaggy flower heads, minty oregano smell.||
mayapple|Mayapple|Podophyllum peltatum|plant|toxic|Umbrella-like lobed leaves, a single white flower under the leaves, one green-yellow fruit.||Everything except the ripe fruit is toxic.
bloodroot|Bloodroot|Sanguinaria canadensis|plant|toxic|One clasped rounded lobed leaf and a white eight-petal flower in early spring; red-orange sap.||Toxic.
baneberry|Baneberry|Actaea pachypoda,Actaea rubra|plant|deadly|Compound toothed leaves, a white or red berry cluster on thick red stalks (doll's eyes).||Berries are deadly.
jimsonweed|Jimsonweed|Datura stramonium|plant|deadly|Large white trumpet flowers, spiny egg-shaped seed pods, strong smell.||Every part is deadly.
bittersweet_nightshade|Bittersweet nightshade|Solanum dulcamara|plant|toxic|Climbing vine, purple flowers with a yellow cone, red egg-shaped berries.||Berries are toxic.
monkshood|Monkshood|Aconitum|plant|deadly|Deeply cut leaves and tall spikes of hooded blue-purple flowers.||Deadly. Even skin contact can numb or harm.
giant_hogweed|Giant hogweed|Heracleum mantegazzianum|plant|toxic|Huge: stem 5-10 cm wide with purple blotches and stiff hairs, umbrella flower head up to 1 m.|cow_parsnip,poison_hemlock|Sap plus sunlight causes severe burns. Do not touch.
cow_parsnip|Cow parsnip|Heracleum maximum|plant|toxic|Big maple-like leaves, white flat umbrella, hairy hollow stem.|giant_hogweed,poison_hemlock|Sap can cause burns on sunny skin.
wild_parsnip|Wild parsnip|Pastinaca sativa|plant|toxic|Yellow umbrella flowers, grooved hollow stem, toothed leaflets.|poison_hemlock|Sap plus sunlight causes burns and blisters.
skunk_cabbage|Skunk cabbage|Symplocarpus foetidus|plant|toxic|Wet ground; mottled purple-maroon hooded flower in late winter; big cabbage-like leaves with a skunky smell.|false_hellebore|Toxic raw.
japanese_knotweed|Japanese knotweed|Reynoutria japonica|plant|edible|Hollow bamboo-like reddish canes, heart-shaped leaves, dense stands.||Invasive. Do not spread it.
curly_dock|Curly dock|Rumex crispus|plant|edible|Long leaves with wavy ruffled edges, tall rust-red seed stalk.||
wintergreen|Wintergreen|Gaultheria procumbens|plant|edible|Low evergreen with glossy leaves that smell of wintergreen when crushed; red berries.||
wild_rose|Wild rose|Rosa carolina,Rosa virginiana,Rosa rugosa,Rosa multiflora|plant|edible|Prickly canes, five-petal pink flowers, red rose hips.||Hips have irritating hairs inside. Remove them.
hawthorn|Hawthorn|Crataegus|plant|edible|Thorny small tree or shrub with lobed leaves and red apple-like haws.||
mountain_laurel|Mountain laurel|Kalmia latifolia|plant|toxic|Evergreen glossy leaves, clusters of pink-white cup flowers.||Leaves, flowers and honey from it are toxic.
sphagnum|Sphagnum moss|Sphagnum|plant|medicinal|Pale green to red spongy moss in bogs that holds a lot of water.||Wild moss can carry germs. Do not put it on an open wound.
usnea|Old man's beard (Usnea)|Usnea|plant|medicinal|Pale green hair-like lichen on branches; pull it and the core is a white elastic thread.||
cleavers|Cleavers|Galium aparine|plant|edible|Sprawling square stem with whorls of narrow leaves that cling by tiny hooks.||
moonseed|Canada moonseed|Menispermum canadense|plant|deadly|Climbing vine with big lobed leaves, dark blue-black berries each with a single crescent seed.|wild_grape|Looks like wild grape. Grapes have several seeds and tendrils. Moonseed has neither.
wild_grape|Wild grape|Vitis riparia,Vitis labrusca|plant|edible|Climbing vine with tendrils, toothed lobed leaves, round berries in a bunch.|moonseed|
thistle|Thistle|Cirsium vulgare,Cirsium arvense|plant|edible|Spiny leaves and stem, round purple flower heads.||
spurge|Spotted spurge (Euphorbia)|Euphorbia maculata|plant|toxic|Flat mat of small oval leaves with a dark spot, milky sap.|purslane|Sap irritates. Mistaken for purslane.
purslane|Purslane|Portulaca oleracea|plant|edible|Flat mat of thick succulent paddle leaves with reddish stems; clear sap.|spurge|Spurge has milky sap. Check the sap.
chickweed|Chickweed|Stellaria media|plant|edible|Low plant with small oval leaves and one line of hairs along the stem; tiny white deep-notched petals.||
common_mallow|Common mallow|Malva neglecta|plant|edible|Round lobed leaves on long stalks, small pale pink flowers, round cheese-wheel fruits.||
garlic_mustard|Garlic mustard|Alliaria petiolata|plant|edible|Heart-shaped toothed leaves smelling of garlic, small white four-petal flowers.||Invasive. Do not spread it.
common_juniper|Common juniper|Juniperus communis|tree|edible|Low spreading evergreen shrub with sharp needles in threes and blue berry-like cones.||Do not mix it up with yew, which is deadly.
yew|Yew (Canada yew)|Taxus canadensis,Taxus baccata,Taxus cuspidata|tree|deadly|Flat dark green needles with two pale lines underneath, red fleshy cup berries; low shrub.|balsam_fir,eastern_hemlock|Needles, seeds and bark are deadly.
balsam_fir|Balsam fir|Abies balsamea|tree|tree|Flat blunt needles with two white lines underneath, upright cones, smooth bark with resin blisters, spicy smell.|red_spruce,eastern_hemlock,yew|
red_spruce|Red spruce|Picea rubens|tree|tree|Square four-sided stiff needles that roll between your fingers, hanging cones, reddish scaly bark.|balsam_fir,white_spruce|
white_spruce|White spruce|Picea glauca|tree|tree|Four-sided blue-green needles, slim hanging cones; needles smell strongly when crushed.|red_spruce|
black_spruce|Black spruce|Picea mariana|tree|tree|Bog tree with a thin top, short needles, small round cones that stay on the tree.|red_spruce|
white_pine|Eastern white pine|Pinus strobus|tree|tree|Soft needles in bundles of five, long slim cones, tiered branches.|red_pine|
red_pine|Red pine|Pinus resinosa|tree|tree|Long needles in bundles of two that snap cleanly, orange-red flaky bark.|white_pine|
eastern_hemlock|Eastern hemlock (the tree)|Tsuga canadensis|tree|tree|Flat short needles with two white lines underneath on tiny stalks, tiny cones, drooping top.|balsam_fir,yew,water_hemlock|The tree is not the poison hemlock plants. Poison and water hemlock are herbs with umbrella flowers.
eastern_red_cedar|Eastern red cedar|Juniperus virginiana|tree|tree|Scaly green leaves or sharp awls, blue berry-like cones, shredding reddish bark.|northern_white_cedar|
northern_white_cedar|Northern white cedar|Thuja occidentalis|tree|tree|Flat fans of scale-like leaves, small cones, stringy bark; wet ground.|eastern_red_cedar|
tamarack|Tamarack (larch)|Larix laricina|tree|tree|Soft needles in tufts that turn gold and drop in autumn.||
sugar_maple|Sugar maple|Acer saccharum|tree|tree|Five-lobed leaf with smooth rounded gaps, opposite branches, grey furrowed bark.|red_maple|
red_maple|Red maple|Acer rubrum|tree|tree|Three- to five-lobed leaf with toothed edges and sharp gaps, red twigs and buds.|sugar_maple|
paper_birch|Paper birch|Betula papyrifera|tree|tree|White bark peeling in papery sheets with dark marks; toothed oval leaves.|yellow_birch|
yellow_birch|Yellow birch|Betula alleghaniensis|tree|tree|Silver-yellow bark that peels in curly strips; twigs smell of wintergreen when scratched.|paper_birch|
american_beech|American beech|Fagus grandifolia|tree|tree|Smooth blue-grey bark, toothed oval leaves with straight veins, pale leaves that stay in winter.||
white_oak|White oak|Quercus alba|tree|tree|Rounded leaf lobes, pale scaly bark.|red_oak|
red_oak|Red oak|Quercus rubra|tree|tree|Pointed leaf lobes with bristle tips, ridged bark with pale stripes.|white_oak|
american_elm|American elm|Ulmus americana|tree|tree|Leaves with uneven bases and double teeth, vase shape.||
white_ash|White ash|Fraxinus americana|tree|tree|Opposite compound leaves, diamond-pattern bark.||
quaking_aspen|Quaking aspen|Populus tremuloides|tree|tree|Round leaves on flat stalks that tremble, smooth pale green-white bark.||
black_cherry|Black cherry|Prunus serotina|tree|tree|Dark scaly bark like burnt potato chips, glossy toothed leaves, dark berries.||Leaves, pits and bark contain cyanide compounds. Wilted leaves are dangerous.
shagbark_hickory|Shagbark hickory|Carya ovata|tree|tree|Long loose plates of bark curling at the ends; compound leaves; hard nuts in husks.||
basswood|Basswood (linden)|Tilia americana|tree|tree|Large heart-shaped lopsided leaves, nut-like balls hanging from a leafy strip.||
black_walnut|Black walnut|Juglans nigra|tree|tree|Compound leaves of many leaflets, dark ridged bark, round green husked nuts.||
sassafras|Sassafras|Sassafras albidum|tree|tree|Leaves of three shapes on one tree (oval, mitten, three-lobed); spicy smell when crushed.||
sycamore|American sycamore|Platanus occidentalis|tree|tree|Bark flaking off in patches of white and brown, big lobed leaves, ball fruits.||
witch_hazel|Witch hazel|Hamamelis virginiana|tree|medicinal|Wavy-edged uneven leaves, yellow ribbon flowers in late autumn.||
fly_agaric|Fly agaric|Amanita muscaria|mushroom|toxic|Red or orange cap with white warts, white gills, a ring on the stem and a bulb at the base.|death_cap,destroying_angel|Toxic. Related to the deadly Amanitas.
death_cap|Death cap|Amanita phalloides|mushroom|deadly|Olive-green to pale cap, white gills, a skirt-like ring and a cup (volva) at the base.|destroying_angel,giant_puffball|One cap can kill. Symptoms start many hours later, after which it is already working on the liver.
destroying_angel|Destroying angel|Amanita bisporigera,Amanita virosa,Amanita ocreata|mushroom|deadly|Pure white cap, gills, ring and stem, with a cup at the base that may be buried.|death_cap,giant_puffball|Deadly. Looks like button mushrooms and young puffballs.
deadly_galerina|Deadly galerina|Galerina marginata|mushroom|deadly|Small brown mushroom on rotting wood with a thin ring and rusty brown spores.|honey_mushroom|Deadly. Grows on the same logs as honey mushrooms.
webcaps|Webcaps (Cortinarius)|Cortinarius|mushroom|deadly|Rusty-brown spores, a web-like veil on young caps, often on the ground in woods.|chanterelle|Some are deadly to the kidneys. Never eat a brown mushroom you cannot identify.
chanterelle|Chanterelle|Cantharellus|mushroom|mushroom|Golden or orange funnel with blunt forked ridges that run down the stem, not true gills; fruity smell.|jack_o_lantern,webcaps|Jack-o'-lantern has true gills, grows in clusters on wood and is toxic.
jack_o_lantern|Jack-o'-lantern|Omphalotus illudens|mushroom|toxic|Orange clusters on wood or buried roots with true gills that run down the stem; glows faintly in the dark.|chanterelle|Toxic. Causes severe vomiting.
chicken_of_the_woods|Chicken of the woods|Laetiporus sulphureus,Laetiporus cincinnatus|mushroom|mushroom|Bright orange and yellow shelves with no gills on trees, soft when young.||Some people react badly, and growths on conifers or eucalyptus can be harmful.
hen_of_the_woods|Hen of the woods (maitake)|Grifola frondosa|mushroom|mushroom|Big clump of grey-brown overlapping fronds at the base of oaks; pores instead of gills.||
morel|True morel|Morchella|mushroom|mushroom|Hollow throughout when cut lengthwise, cap fused to the stem, honeycomb pits.|false_morel|False morels are deadly. Cut every one open.
false_morel|False morel|Gyromitra|mushroom|deadly|Wrinkled brain-like cap that is not hollow-honeycombed; stem cottony inside.|morel|Deadly even when cooked.
giant_puffball|Puffball|Calvatia gigantea,Lycoperdon perlatum,Calvatia|mushroom|mushroom|Round white ball with no stem or gills; solid white inside when cut.|death_cap,destroying_angel|A young Amanita looks like a puffball. Cut it open: any outline of a cap and stem means leave it.
lions_mane|Lion's mane|Hericium|mushroom|mushroom|White hanging icicle-like spines on trees.||
oyster_mushroom|Oyster mushroom|Pleurotus ostreatus|mushroom|mushroom|Shelf-shaped grey-tan caps with gills running down to a short side stem, on wood.|jack_o_lantern|Do not confuse it with other shelf fungi that have gills.
turkey_tail|Turkey tail|Trametes versicolor|mushroom|medicinal|Thin tough shelves with colored concentric bands and a white pore underside.||
birch_polypore|Birch polypore (razor strop)|Fomitopsis betulina|mushroom|medicinal|Rounded grey-white shelf on dead birch; the pore side is white; used as a strop.||Survival history only. Do not eat it.
reishi|Reishi (hemlock varnish shelf)|Ganoderma tsugae,Ganoderma applanatum|mushroom|medicinal|Glossy varnished red-brown shelf on a stalk or the side of a tree.||
honey_mushroom|Honey mushroom|Armillaria|mushroom|mushroom|Clusters of honey-coloured caps on wood with a ring; white spores.|deadly_galerina|The deadly galerina looks like it.
shaggy_mane|Shaggy mane|Coprinus comatus|mushroom|mushroom|Tall white cylinder cap with shaggy scales that melts into ink.||
bolete|Bolete|Boletus,Suillus,Leccinum|mushroom|mushroom|Fat stem with a sponge of pores instead of gills under the cap.||Red-pored and bitter ones are toxic. Do not eat on a photo.
green_spored_parasol|Green-spored parasol|Chlorophyllum molybdites|mushroom|toxic|Big scaly cap with a ring; gills turn green with age; lawns.||The most common mushroom poisoning in North America.
hedgehog_mushroom|Hedgehog mushroom|Hydnum repandum|mushroom|mushroom|Pale orange cap with soft spines instead of gills.||
tinder_fungus|Tinder fungus|Fomes fomentarius|mushroom|mushroom|Hoof-shaped grey woody shelf on birch and beech; used for tinder.||Survival use for fire only.
chaga|Chaga|Inonotus obliquus|mushroom|medicinal|Black charcoal-like crust on birch with an orange inside.||
white_tailed_deer|White-tailed deer|Odocoileus virginianus|animal|animal|Brown coat, white underside, tail raised like a white flag.||
moose|Moose|Alces alces|animal|animal|Huge with a long face, dewlap, and broad flat antlers on bulls.||Do not approach. Cows with calves and bulls in rut charge.
elk|Elk|Cervus canadensis|animal|animal|Large with a pale rump and branching antlers.||
black_bear|Black bear|Ursus americanus|animal|animal|Black or brown with a straight muzzle and no shoulder hump.||Keep distance, never run, store food away from camp.
coyote|Coyote|Canis latrans|animal|animal|Slim dog-like with a bushy low tail and pointed ears.|red_fox|
red_fox|Red fox|Vulpes vulpes|animal|animal|Red coat, black legs, white tail tip.|coyote|
bobcat|Bobcat|Lynx rufus|animal|animal|Short tail with a black tip, tufted ears, spotted coat.||
porcupine|Porcupine|Erethizon dorsatum|animal|animal|Round quill-covered body, slow waddle.||Quills cannot be thrown. Keep dogs away.
raccoon|Raccoon|Procyon lotor|animal|animal|Black mask and ringed tail.||
striped_skunk|Striped skunk|Mephitis mephitis|animal|animal|Black with white stripes down the back.||
beaver|Beaver|Castor canadensis|animal|animal|Flat paddle tail, dam and cut sapling stumps.||
snowshoe_hare|Snowshoe hare|Lepus americanus|animal|animal|Large back feet, coat white in winter and brown in summer.||
wild_turkey|Wild turkey|Meleagris gallopavo|animal|animal|Large dark bird with a bare head and fanned tail.||
ruffed_grouse|Ruffed grouse|Bonasa umbellus|animal|animal|Brown barred bird with a fan tail and dark neck ruff.||
bald_eagle|Bald eagle|Haliaeetus leucocephalus|animal|animal|Large dark bird with a white head and tail on adults.||
great_horned_owl|Great horned owl|Bubo virginianus|animal|animal|Large owl with ear tufts and yellow eyes.||
canada_goose|Canada goose|Branta canadensis|animal|animal|Black neck and head with a white chin strap.||
rattlesnake|Rattlesnake|Crotalus|animal|animal|Thick body, triangular head, a rattle on the tail.|eastern_garter_snake,northern_water_snake|Venomous. Back away slowly. Call emergency services after a bite.
copperhead|Copperhead|Agkistrodon contortrix|animal|animal|Copper head, tan body with hourglass bands.|northern_water_snake|Venomous. Back away slowly. Call emergency services after a bite.
cottonmouth|Cottonmouth|Agkistrodon piscivorus|animal|animal|Heavy dark water snake with a white mouth when it gapes.|northern_water_snake|Venomous. Back away slowly. Call emergency services after a bite.
eastern_garter_snake|Garter snake|Thamnophis sirtalis|animal|animal|Slim, three pale stripes along the body.|rattlesnake|
northern_water_snake|Northern water snake|Nerodia sipedon|animal|animal|Banded brown snake near water.|copperhead,cottonmouth|Not venomous but it bites hard. Often mistaken for a copperhead.
blacklegged_tick|Blacklegged (deer) tick|Ixodes scapularis|animal|animal|Tiny dark tick; adult females have an orange-red body and black plate.|american_dog_tick|Carries Lyme and other diseases. Remove with tweezers close to the skin and keep the date.
american_dog_tick|American dog tick|Dermacentor variabilis|animal|animal|Larger brown tick with white-cream markings on the back.|blacklegged_tick|Can carry spotted fever. Remove with tweezers close to the skin.
lone_star_tick|Lone star tick|Amblyomma americanum|animal|animal|Reddish-brown tick with one white dot on the back of females.||Bites can cause meat allergy. Remove with tweezers close to the skin.
black_widow|Black widow|Latrodectus mactans,Latrodectus variolus,Latrodectus hesperus|animal|animal|Shiny black spider with a red hourglass underneath.||Venomous. Seek care after a bite.
bald_faced_hornet|Bald-faced hornet|Dolichovespula maculata|animal|animal|Black and white wasp with a grey paper nest the size of a football.||Stings hurt and are dangerous if allergic.
yellowjacket|Yellowjacket|Vespula|animal|animal|Black and yellow wasp that nests underground.||Stings hurt and are dangerous if allergic.
wild_boar|Wild boar (feral hog)|Sus scrofa|animal|animal|Dark bristly pig with a long snout.||Can be aggressive. Cook the meat fully.
deer_track|Deer track|Odocoileus virginianus|track|sign|Two teardrop toes forming a heart shape, pointed forward, sometimes with two small dewclaw dots.||
bear_track|Bear track|Ursus americanus|track|sign|Wide five-toed print with claw dots and a broad heel pad.||
canine_track|Coyote, fox or dog track|Canis latrans,Vulpes vulpes,Canis lupus,Canis familiaris|track|sign|Four toes with claw marks and an X shape between the toes and the pad.||
raccoon_track|Raccoon track|Procyon lotor|track|sign|Five long finger-like toes like a tiny human hand.||
moose_track|Moose track|Alces alces|track|sign|Large pointed split hoof print, over 10 cm long.|deer_track|
turkey_track|Turkey track|Meleagris gallopavo|track|sign|Three forward toes and a short back toe, in a long stride.||
bobcat_track|Bobcat track|Lynx rufus|track|sign|Four toes with no claw marks and a three-lobed heel pad.||
rabbit_track|Rabbit or hare track|Leporidae|track|sign|Two large hind feet side by side ahead of two smaller front prints.||
deer_scat|Deer scat|Odocoileus virginianus|scat|sign|Small dark oval pellets in a pile.|rabbit_scat|
bear_scat|Bear scat|Ursus americanus|scat|sign|Large tubular scat with berries, seeds or hair in it.||Fresh bear sign means a bear is near. Be bear aware.
coyote_scat|Coyote or fox scat|Canis latrans,Vulpes vulpes|scat|sign|Twisted tubular scat with hair and bone and a tapered end.||
moose_scat|Moose scat|Alces alces|scat|sign|Large oval wood-fibre pellets, or a clump in summer.|deer_scat|
raccoon_scat|Raccoon scat|Procyon lotor|scat|sign|Blunt-ended tubes with berry seeds and bits of shell, often at a latrine.||Raccoon latrines can carry roundworm. Do not touch them.
rabbit_scat|Rabbit scat|Leporidae|scat|sign|Round pea-sized pellets that are flat on the sides.|deer_scat|
"""
def rows():
    out = []
    for line in ROWS.strip().splitlines():
        p = line.split("|")
        assert len(p) == 8, line
        out.append(dict(id=p[0], title=p[1], taxa=p[2].split(","), group=p[3], use=p[4], look=p[5], lookalikes=[x for x in p[6].split(",") if x], caution=p[7]))
    ids = {r["id"] for r in out}
    for r in out:
        for l in r["lookalikes"]:
            assert l in ids, (r["id"], l)
    assert len(ids) == len(out)
    return out
if __name__ == "__main__":
    r = rows(); print(len(r))
    from collections import Counter; print(Counter(x["group"] for x in r))
