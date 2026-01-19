//@ts-nocheck
import { markets } from "./nodes";

/**
 * Bounties that can be completed in the game
 * Data is referenced from: https://brightershoreswiki.org/w/Merchant
 *
 * Experience data is referenced from: https://brightershoreswiki.org/w/Merchant_Guild_Bounties_XP_%26_Values
 * Experience scales with level, and the formula is currently unknown.
 * So we are using the maximum values currently reported on the wiki (currently level 153)
 */
export const bounties = {
  CARROTS: {
    name: "Carrots",
    level: 0,
    kp: 9,
    seller: markets.GREENGROCERS,
    buyer: markets.TOY_STALL,
  },
  SOAP: {
    name: "Soap",
    level: 0,
    kp: 8,
    seller: markets.SOAP_SHOP,
    buyer: markets.BUTCHERS_STALL,
  },
  RIBS: {
    name: "Ribs",
    level: 2,
    kp: 6,
    seller: markets.BUTCHERS_STALL,
    buyer: markets.SOUVENIR_STALL,
  },
  MEAT_WRAP: {
    name: "MeatWrap",
    level: 4,
    kp: 6,
    seller: markets.HALLIGS_STREET_FOOD,
    buyer: markets.CHEESE_SHOP,
  },
  BEEF_JOINT: {
    name: "BeefJoint",
    level: 6,
    kp: 6,
    seller: markets.HENDERSONS_MEAT,
    buyer: markets.HALLIGS_STREET_FOOD,
  },
  CLOCKWORK_SHEEP: {
    name: "ClockworkSheep",
    level: 8,
    kp: 6,
    seller: markets.PENNYS_CLOCKWORK,
    buyer: markets.CLOCK_STALL,
  },
  PORCELAIN_DOLL: {
    name: "PorcelainDoll",
    level: 12,
    kp: 8,
    seller: markets.TOY_STALL,
    buyer: markets.FORTUNEHOLD_FARM,
  },
  PLATES: {
    name: "Plates",
    level: 16,
    kp: 8,
    seller: markets.HERMARS_HOMEWARE,
    buyer: markets.JENNALERS_WINES,
  },
  PIN_BADGE: {
    name: "PinBadge",
    level: 23,
    kp: 8,
    seller: markets.SOUVENIR_STALL,
    buyer: markets.VICTOR_T_CYCLOPS,
  },
  PUMPKIN: {
    name: "Pumpkin",
    level: 28,
    kp: 8,
    seller: markets.FORTUNEHOLD_FARM,
    buyer: markets.VASE_STALL,
  },
  PIZZA: {
    name: "Pizza",
    level: 35,
    kp: 9,
    seller: markets.CHEF,
    buyer: markets.FRANCESCAS_FRUIT_STALL,
  },
  BANANAS: {
    name: "Bananas",
    level: 40,
    kp: 9,
    seller: markets.FRANCESCAS_FRUIT_STALL,
    buyer: markets.PENNYS_CLOCKWORK,
  },
  TIN_POCKET_WATCH: {
    name: "TinPocketWatch",
    level: 49,
    kp: 10,
    seller: markets.SNILCHS_WATCHES,
    buyer: markets.BOGGS_ANTIQUES,
  },
  HOMESPUN_CLOTH: {
    name: "HomespunCloth",
    level: 54,
    kp: 7,
    seller: markets.TEXTILES_STALL,
    buyer: markets.CLOCK_STALL,
  },
  RAINBOW_CHEESE: {
    name: "RainbowCheese",
    level: 61,
    kp: 7,
    seller: markets.CHEESE_SHOP,
    buyer: markets.HENDERSONS_MEAT,
  },
  ARGANIAN_WINE: {
    name: "ArganianWine",
    level: 66,
    kp: 9,
    seller: markets.JENNALERS_WINES,
    buyer: markets.VASE_STALL,
  },
  OAK_PATTERNED_VASE: {
    name: "OakPatternedVase",
    level: 75,
    kp: 7,
    seller: markets.VASE_STALL,
    buyer: markets.HENDERSONS_MEAT,
  },
  SCENTED_CANDLE: {
    name: "ScentedCandle",
    level: 80,
    kp: 8,
    seller: markets.CANDICES_CANDLES,
    buyer: markets.SOAP_SHOP,
  },
  UNICORN_DUST: {
    kp: 7,
    level: 87,
    name: "UnicornDust",
    seller: markets.VICTOR_T_CYCLOPS,
    buyer: markets.JANESSAS_DELICACIES,
  },
  LANDSCAPE_PAINTING: {
    kp: 6,
    level: 92,
    name: "Painting",
    seller: markets.BERTS_GALLERY,
    buyer: markets.TOMMY_SHOES_WINES,
  },
  CARRIAGE_CLOCK: {
    level: 101,
    kp: 8,
    name: "CarriageClock",
    seller: markets.CLOCK_STALL,
    buyer: markets.PENNYS_CLOCKWORK,
  },
  SPECTACLES: {
    level: 106,
    kp: 8,
    name: "Spectacles",
    seller: markets.MONOCLE_MARKET,
    buyer: markets.CANDICES_CANDLES,
  },
  SHARPSEED_WINE: {
    level: 113,
    kp: 5,
    name: "SharpseedWine",
    seller: markets.TOMMY_SHOES_WINES,
    buyer: markets.JANESSAS_DELICACIES,
  },
  RUG: {
    level: 118,
    kp: 6,
    name: "Rug",
    seller: markets.BOGGS_ANTIQUES,
    buyer: markets.HERMARS_HOMEWARE,
  },
  CAVIAR: {
    level: 127,
    kp: 4,
    name: "Caviar",
    seller: markets.JANESSAS_DELICACIES,
    buyer: markets.BOGGS_ANTIQUES,
  },
  BATH_SALTS: {
    level: 132,
    kp: 8,
    name: "BathSalts",
    seller: markets.SOAP_SHOP,
    buyer: markets.MONOCLE_MARKET,
  },
  RED_CABBAGE: {
    level: 124,
    kp: 8,
    name: "Cabbage",
    seller: markets.GREENGROCERS,
    buyer: markets.PEARL_STALL // TODO: Add pearl stall node
  },
  IVORY_SWIRL_PEARL: {
    level: 129,
    kp: 6,
    name: "SwirlPearl",
    seller: markets.PEARL_STALL, // TODO: Add pearl stall node
    buyer: markets.GREENGROCERS
  },
  TOMATOES: {
    level: 139,
    kp: 8,
    name: "Tomatoes",
    seller: markets.GREENGROCERS,
    buyer: markets.CHEF,
  },
  STEAK: {
    level: 144,
    kp: 7,
    name: "Steak",
    seller: markets.BUTCHERS_STALL,
    buyer: markets.HALLIGS_STREET_FOOD,
  },
  BURGER: {
    level: 153,
    kp: 5.3,
    name: "Burger",
    seller: markets.HALLIGS_STREET_FOOD,
    buyer: markets.JENNALERS_WINES,
  },
  HAM_LEG: {
    level: 158,
    kp: 6,
    name: "HamLeg",
    seller: markets.HENDERSONS_MEAT,
    buyer: markets.TOY_STALL,
  },
  CLOCKWORK_DRAGON: {
    level: 165,
    kp: 7.5,
    name: "ClockworkDragon",
    seller: markets.PENNYS_CLOCKWORK,
    buyer: markets.CHEESE_SHOP,
  },
  SNOW_GLOBE: {
    level: 170,
    kp: 8,
    name: "SnowGlobe",
    seller: markets.TOY_STALL,
    buyer: markets.TOMMY_SHOES_WINES,
  },
  CUPS: {
    level: 179,
    kp: 6.5,
    name: "Cups",
    seller: markets.HERMARS_HOMEWARE,
    buyer: markets.SOUVENIR_STALL,
  },
  POSTCARDS: {
    level: 184,
    kp: 5,
    name: "Postcards",
    seller: markets.SOUVENIR_STALL,
    buyer: markets.TEXTILES_STALL,
  },
  RHUBARB: {
    level: 191,
    kp: 8,
    name: "Rhubarb",
    seller: markets.FORTUNEHOLD_FARM,
    buyer: markets.SOAP_SHOP,
  },
  CURRY: {
    level: 196,
    kp: 9,
    name: "Curry",
    seller: markets.CHEF,
    buyer: markets.SNILCHS_WATCHES,
  },
  ORANGES: {
    level: 216,
    kp: 11.5,
    name: "Oranges",
    seller: markets.FRANCESCAS_FRUIT_STALL,
    buyer: markets.TEXTILES_STALL,
  },
  PRECISE_POCKET_WATCH: {
    level: 233,
    kp: 8.5,
    name: "PrecisePocketWatch",
    seller: markets.SNILCHS_WATCHES,
    buyer: markets.GREENGROCERS,
  },
  SILK: {
    level: 255,
    kp: 8,
    name: "Silk",
    seller: markets.TEXTILES_STALL,
    buyer: markets.HERMARS_HOMEWARE,
  },
  OLD_RARG: {
    level: 272,
    kp: 9,
    name: "OldRarg",
    seller: markets.CHEESE_SHOP,
    buyer: markets.CHEF,
  },
  FARGUST_WINE: {
    level: 300,
    kp: 6.8,
    name: "FargustWine",
    seller: markets.JENNALERS_WINES,
    buyer: markets.BERTS_GALLERY,
  },
  STRIPED_VASE: {
    level: 317,
    kp: 6.2,
    name: "StripedVase",
    seller: markets.VASE_STALL,
    buyer: markets.BERTS_GALLERY,
  },
  TEA_LIGHTS: {
    level: 339,
    kp: 7.5,
    name: "TeaLights",
    seller: markets.CANDICES_CANDLES,
    buyer: markets.FORTUNEHOLD_FARM,
  },
  UNICORN_HAIR: {
    level: 356,
    kp: 10,
    name: "UnicornHair",
    seller: markets.VICTOR_T_CYCLOPS,
    buyer: markets.SNILCHS_WATCHES,
  },
  PORTRAIT_PAINTING: {
    level: 384,
    kp: 6,
    name: "PortraitPainting",
    seller: markets.BERTS_GALLERY,
    buyer: markets.CANDICES_CANDLES,
  },
  PENDULUM_CLOCK: {
    level: 400,
    kp: 10.5,
    name: "PendulumClock",
    seller: markets.CLOCK_STALL,
    buyer: markets.FRANCESCAS_FRUIT_STALL,
  },
  MONOCLE: {
    level: 423,
    kp: 8.5,
    name: "Monocle",
    seller: markets.MONOCLE_MARKET,
    buyer: markets.VICTOR_T_CYCLOPS,
  },
  TOPHILL_WINE: {
    level: 439,
    kp: 7.5,
    name: "TophillWine",
    seller: markets.TOMMY_SHOES_WINES,
    buyer: markets.GREENGROCERS,
  },
  ANTIQUE_BOOK: {
    level: 467,
    kp: 6,
    name: "AntiqueBook",
    seller: markets.BOGGS_ANTIQUES,
    buyer: markets.BUTCHERS_STALL,
  },
  TRUFFLES: {
    level: 484,
    kp: 5,
    name: "Truffles",
    seller: markets.JANESSAS_DELICACIES,
    buyer: markets.MONOCLE_MARKET,
  },
};

// Precompute a lookup map for O(1) access
const bountyNameToKeyMap: Record<string, string> = Object.entries(bounties).reduce(
    (acc, [key, value]) => {
      acc[value.name] = key;
      return acc;
    },
    {} as Record<string, string>
);

/**
 * Gets the bounty key by its name in O(1) time.
 * @param {string} name - The bounty name (e.g., "Meat Wrap")
 * @returns {string | undefined} - The bounty key (e.g., "MEAT_WRAP"), or undefined if not found
 */
export function getBountyKeyByName(name: string): string | undefined {
  return bountyNameToKeyMap[name];
}

/**
 * The status of a bounty
 *
 * NOT_STARTED: The item still needs to be purchased
 * IN_PROGRESS: The item has been purchased but not yet sold
 * COMPLETED: The item has been purchased
 */
export const BountyStatus = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};
