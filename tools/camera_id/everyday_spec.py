# Everyday (non-wild) classes for Camera ID round 4.
# A photo of supermarket oranges must never come back as a toxic mushroom. These classes give the head
# somewhere honest to put food, household objects, hands and pets, so the screen can say
# "This looks like an everyday object or food, not a wild species" instead of guessing a wild species.
# Row: id | title (what the phone says it looks like) | Wikimedia Commons search queries (semicolon list)
# Photos: Wikimedia Commons, licences CC0 / public domain / CC BY / CC BY-SA only. Photos are not shipped.
ROWS = """
ev_citrus|citrus fruit (oranges, lemons, limes)|oranges in a net bag;oranges fruit pile;mandarin oranges;clementines;lemons fruit;limes fruit;grapefruit;oranges supermarket;orange fruit on table;tangerines in a crate;orange slices
ev_fruit|fruit from a shop or market|apples in a basket;bananas bunch;grapes bunch;pears fruit;fruit bowl;fruit market stall;pineapple fruit;watermelon;peaches fruit;kiwi fruit;mango fruit;plums fruit
ev_vegetables|vegetables from a shop or kitchen|potatoes;onions bulbs;carrots bunch;tomatoes;bell peppers;cabbage;lettuce;cucumbers;garlic bulbs;vegetable market stall;broccoli;corn on the cob
ev_packaged_food|packaged food|canned food;cereal box;pasta packaging;supermarket shelf;potato chips bag;food jar;yogurt cup;cheese packaged;frozen food package;cream cheese tub;snack packaging;rice bag
ev_drinks|a drink, bottle or can|water bottle;soda can;beer bottle;wine bottle;coffee cup;milk carton;juice bottle;tea cup;drinking glass;plastic bottle
ev_prepared_food|cooked or baked food|pizza;sandwich;bread loaf;cake;pasta dish;hamburger;plated meal;fried eggs;soup bowl;cookies;breakfast table
ev_kitchen|a kitchen item|mug;plate dishes;cooking pot;frying pan;cutlery;kitchen counter;refrigerator;cutting board;kettle;toaster
ev_household|a household item or room|chair;sofa;lamp;bed bedroom;bookshelf;towels;dining table;living room interior;bathroom interior;curtains;carpet;door
ev_electronics|a phone, screen or gadget|smartphone;laptop computer;remote control;television;computer keyboard;headphones;charger cable;computer monitor;tablet computer;camera device
ev_clothing|clothing, shoes or a bag|shoe;jacket;t-shirt;backpack;hat;jeans;socks;gloves;handbag;boots
ev_hands_people|a hand or a person|human hand;hand holding object;fingers;person portrait;face close-up;people group;child playing;person sitting;man smiling;woman portrait
ev_dog|a pet dog|dog;puppy;dog breeds;dog sitting;dog on leash;golden retriever;labrador retriever;german shepherd dog;dog running
ev_cat|a pet cat|domestic cat;kitten;cat sitting;tabby cat;cat sleeping
ev_pets_farm|a pet or farm animal|hamster;goldfish;parrot pet;cattle cow;horse;sheep;domestic chicken;domestic goose;goat farm;pig farm;rabbit pet
ev_tools_office|a tool, toy or office item|hammer;screwdriver;toy;book;notebook;pen;paper documents;scissors;toolbox;board game
ev_street|a car, street or building|car;city street;house building;bicycle;road sign;parking lot;apartment building;truck;garage
"""
def rows():
    out = []
    for line in ROWS.strip().splitlines():
        p = line.split("|")
        assert len(p) == 3, line
        out.append(dict(id=p[0], title=p[1], queries=p[2].split(";")))
    assert len({r["id"] for r in out}) == len(out)
    return out
if __name__ == "__main__":
    print(len(rows()))
