/**
 * A FACE FOR EVERY FOOD — emoji, not photos, and that is a considered position rather than a
 * shortcut. Real food photography would mean either bundling thousands of images into a static
 * export or hot-linking a third-party image CDN on every keystroke of search — and this app's
 * whole privacy story is that browsing your own food log talks to nobody. (The Cloudflare cache
 * worker fronts the app's OWN catalog shards; it has no photo library to serve.) Emoji are
 * shipped by the OS at zero bytes, render at any size, and are honest about what they are: a
 * recognisable glyph, not a promise that this is what your burrito looks like.
 *
 * Name keywords outrank the category because categories are broad: "salmon" deserves 🍣-adjacent
 * fish, not the generic meat of its `fish` category neighbour "tuna salad". First match wins, so
 * the list is ordered specific → generic.
 */
import type { Food } from './types';

const BY_KEYWORD: Array<[RegExp, string]> = [
  [/pizza/i, '🍕'],
  [/burger|cheeseburg/i, '🍔'],
  [/burrito|wrap\b/i, '🌯'],
  [/taco/i, '🌮'],
  [/sushi|sashimi|maki/i, '🍣'],
  [/ramen|noodle|pho\b|udon/i, '🍜'],
  [/spaghetti|pasta|penne|macaroni|lasagn/i, '🍝'],
  [/curry\b/i, '🍛'],
  [/fries|chips\b/i, '🍟'],
  [/sandwich|sub\b|hoagie/i, '🥪'],
  [/hot ?dog|sausage|bratwurst/i, '🌭'],
  [/pancake|waffle/i, '🥞'],
  [/croissant/i, '🥐'],
  [/bagel/i, '🥯'],
  [/donut|doughnut/i, '🍩'],
  [/cookie|biscuit/i, '🍪'],
  [/cake|brownie|muffin|cupcake/i, '🍰'],
  [/chocolate|cocoa/i, '🍫'],
  [/ice ?cream|gelato|sundae/i, '🍨'],
  [/bread|toast|baguette|roll\b/i, '🍞'],
  [/rice\b|risotto|pilaf|biryani/i, '🍚'],
  [/oat|porridge|muesli|granola/i, '🥣'],
  [/cereal/i, '🥣'],
  [/egg/i, '🥚'],
  [/bacon/i, '🥓'],
  [/chicken|turkey|poultry/i, '🍗'],
  [/steak|beef|lamb|pork|veal|ham\b/i, '🥩'],
  [/salmon|tuna|cod\b|tilapia|trout|sardine|mackerel|fish/i, '🐟'],
  [/shrimp|prawn/i, '🦐'],
  [/cheese|paneer/i, '🧀'],
  [/yogurt|yoghurt|kefir/i, '🥛'],
  [/milk\b|latte|cappuccino/i, '🥛'],
  [/coffee|espresso|americano/i, '☕'],
  [/tea\b|matcha|chai/i, '🍵'],
  [/juice|smoothie|shake\b/i, '🧃'],
  [/beer|lager|ale\b/i, '🍺'],
  [/wine/i, '🍷'],
  [/avocado|guacamole/i, '🥑'],
  [/banana/i, '🍌'],
  [/apple\b/i, '🍎'],
  [/orange\b|mandarin|clementine/i, '🍊'],
  [/strawberr/i, '🍓'],
  [/blueberr|raspberr|blackberr|berries/i, '🫐'],
  [/grape/i, '🍇'],
  [/watermelon/i, '🍉'],
  [/mango/i, '🥭'],
  [/pineapple/i, '🍍'],
  [/peach|nectarine|apricot/i, '🍑'],
  [/lemon|lime\b/i, '🍋'],
  [/kiwi/i, '🥝'],
  [/tomato/i, '🍅'],
  [/carrot/i, '🥕'],
  [/broccoli|cauliflower/i, '🥦'],
  [/corn\b|maize/i, '🌽'],
  [/potato(?!.*sweet)/i, '🥔'],
  [/sweet ?potato|yam\b/i, '🍠'],
  [/salad|lettuce|greens|spinach|kale/i, '🥗'],
  [/cucumber|zucchini|courgette/i, '🥒'],
  [/pepper\b|capsicum|chilli|chili/i, '🫑'],
  [/onion/i, '🧅'],
  [/garlic/i, '🧄'],
  [/mushroom/i, '🍄'],
  [/peanut|almond|cashew|walnut|pistachio|pecan|nut\b|nuts\b/i, '🥜'],
  [/bean|lentil|dal\b|dahl|chickpea|hummus|tofu|edamame|tempeh/i, '🫘'],
  [/soup|broth|stew|chowder/i, '🍲'],
  [/honey/i, '🍯'],
  [/butter\b|ghee|margarine/i, '🧈'],
  [/oil\b|olive/i, '🫒'],
  [/salt|spice|seasoning|sauce|ketchup|mustard|mayo/i, '🧂'],
  [/protein (powder|shake)|whey|casein|creatine|supplement|vitamin/i, '💊'],
  [/popcorn/i, '🍿'],
  [/pretzel/i, '🥨'],
  [/dumpling|gyoza|momo/i, '🥟'],
  [/pie\b|tart\b/i, '🥧'],
];

const BY_CATEGORY: Record<Food['category'], string> = {
  fruit: '🍎',
  vegetable: '🥦',
  grain: '🌾',
  meat: '🥩',
  fish: '🐟',
  dairy: '🥛',
  legume: '🫘',
  nuts: '🥜',
  beverage: '🥤',
  snack: '🍿',
  condiment: '🧂',
  fastfood: '🍔',
  dish: '🍽️',
  soup: '🍲',
  breakfast: '🍳',
  supplement: '💊',
};

export function emojiForFood(food: Pick<Food, 'name' | 'category'>): string {
  for (const [re, emoji] of BY_KEYWORD) {
    if (re.test(food.name)) return emoji;
  }
  return BY_CATEGORY[food.category] ?? '🍽️';
}
