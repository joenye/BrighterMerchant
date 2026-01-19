// Application constants
export const WINDOW_TITLE = "Brighter Shores";
export const SCREENSHOT_INTERVAL_MS = 1000;      // Full OCR when board is open
export const BOARD_CHECK_INTERVAL_MS = 300;      // Fast check for board open state
export const ACTIVE_BOUNTY_INTERVAL_MS = 1000;   // Slower check for active bounties when board closed

// Bounty names for OCR detection
export const BOUNTY_NAMES = new Set([
  "Carrots", "Soap", "Ribs", "MeatWrap", "BeefJoint", "ClockworkSheep",
  "PorcelainDoll", "Plates", "PinBadge", "Pumpkin", "Pizza", "Bananas",
  "TinPocketWatch", "HomespunCloth", "RainbowCheese", "ArganianWine", "OakPatternedVase",
  "ScentedCandle", "UnicornDust", "Painting", "CarriageClock", "Spectacles",
  "SharpseedWine", "Rug", "Caviar", "BathSalts", "Cabbage", "SwirlPearl", "Tomatoes", "Steak", "Burger",
  "HamLeg", "ClockworkDragon", "SnowGlobe", "Cups", "Postcards", "Rhubarb", "Curry",
  "Oranges", "PrecisePocketWatch", "Silk", "OldRarg", "FargustWine", "StripedVase",
  "TeaLights", "UnicornHair", "PortraitPainting", "PendulumClock",
  "TophillWine", "AntiqueBook", "Truffles"
]);
