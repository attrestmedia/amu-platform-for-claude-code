export type ItemType =
  | "amu"
  | "artifact"
  | "bag"
  | "bell"
  | "bomb"
  | "book"
  | "bread"
  | "candy"
  | "cheese"
  | "chicken"
  | "clock"
  | "clover"
  | "coin"
  | "dimension"
  | "donuts"
  | "eye"
  | "fish"
  | "heart"
  | "helper01"
  | "helper02"
  | "helper03"
  | "house"
  | "itemBox"
  | "jewel"
  | "jewelRed"
  | "key"
  | "liquid"
  | "liquidOrange"
  | "liquidRed"
  | "magicHat"
  | "map"
  | "meat"
  | "moneyBag"
  | "music"
  | "powerShield"
  | "pumpkin"
  | "ring"
  | "rocket"
  | "sheet"
  | "shield"
  | "shootingStar"
  | "slingshot"
  | "snowCrystal"
  | "specialKey"
  | "starFrame"
  | "sword"
  | "waterDrop"
  | "gear";

type ItemTypeData = Record<
  ItemType,
  {
    name: ItemType;
    path: string;
  }
>;

export const ITEM_TYPE_DATA: ItemTypeData = {
  amu: {
    name: "amu",
    path: "/assets/items/amu.png",
  },
  artifact: {
    name: "artifact",
    path: "/assets/items/artifact.png",
  },
  bag: {
    name: "bag",
    path: "/assets/items/bag.png",
  },
  bell: {
    name: "bell",
    path: "/assets/items/bell.png",
  },
  bomb: {
    name: "bomb",
    path: "/assets/items/bomb.png",
  },
  book: {
    name: "book",
    path: "/assets/items/book.png",
  },
  bread: {
    name: "bread",
    path: "/assets/items/bread.png",
  },
  candy: {
    name: "candy",
    path: "/assets/items/candy.png",
  },
  cheese: {
    name: "cheese",
    path: "/assets/items/cheese.png",
  },
  chicken: {
    name: "chicken",
    path: "/assets/items/chicken.png",
  },
  clock: {
    name: "clock",
    path: "/assets/items/clock.png",
  },
  clover: {
    name: "clover",
    path: "/assets/items/clover.png",
  },
  coin: {
    name: "coin",
    path: "/assets/items/coin.png",
  },
  dimension: {
    name: "dimension",
    path: "/assets/items/dimension.png",
  },
  donuts: {
    name: "donuts",
    path: "/assets/items/donuts.png",
  },
  eye: {
    name: "eye",
    path: "/assets/items/eye.png",
  },
  fish: {
    name: "fish",
    path: "/assets/items/fish.png",
  },
  heart: {
    name: "heart",
    path: "/assets/items/heart.png",
  },
  helper01: {
    name: "helper01",
    path: "/assets/items/helper01.png",
  },
  helper02: {
    name: "helper02",
    path: "/assets/items/helper02.png",
  },
  helper03: {
    name: "helper03",
    path: "/assets/items/helper03.png",
  },
  house: {
    name: "house",
    path: "/assets/items/house.png",
  },
  itemBox: {
    name: "itemBox",
    path: "/assets/items/itemBox.png",
  },
  jewel: {
    name: "jewel",
    path: "/assets/items/jewel.png",
  },
  jewelRed: {
    name: "jewelRed",
    path: "/assets/items/jewelRed.png",
  },
  key: {
    name: "key",
    path: "/assets/items/key.png",
  },
  liquid: {
    name: "liquid",
    path: "/assets/items/liquid.png",
  },
  liquidOrange: {
    name: "liquidOrange",
    path: "/assets/items/liquidOrange.png",
  },
  liquidRed: {
    name: "liquidRed",
    path: "/assets/items/liquidRed.png",
  },
  magicHat: {
    name: "magicHat",
    path: "/assets/items/magicHat.png",
  },
  map: {
    name: "map",
    path: "/assets/items/map.png",
  },
  meat: {
    name: "meat",
    path: "/assets/items/meat.png",
  },
  moneyBag: {
    name: "moneyBag",
    path: "/assets/items/moneyBag.png",
  },
  music: {
    name: "music",
    path: "/assets/items/music.png",
  },
  powerShield: {
    name: "powerShield",
    path: "/assets/items/powerShield.png",
  },
  pumpkin: {
    name: "pumpkin",
    path: "/assets/items/pumpkin.png",
  },
  ring: {
    name: "ring",
    path: "/assets/items/ring.png",
  },
  rocket: {
    name: "rocket",
    path: "/assets/items/rocket.png",
  },
  sheet: {
    name: "sheet",
    path: "/assets/items/sheet.png",
  },
  shield: {
    name: "shield",
    path: "/assets/items/shield.png",
  },
  shootingStar: {
    name: "shootingStar",
    path: "/assets/items/shootingStar.png",
  },
  slingshot: {
    name: "slingshot",
    path: "/assets/items/slingshot.png",
  },
  snowCrystal: {
    name: "snowCrystal",
    path: "/assets/items/snowCrystal.png",
  },
  specialKey: {
    name: "specialKey",
    path: "/assets/items/specialKey.png",
  },
  starFrame: {
    name: "starFrame",
    path: "/assets/items/starFrame.png",
  },
  sword: {
    name: "sword",
    path: "/assets/items/sword.png",
  },
  waterDrop: {
    name: "waterDrop",
    path: "/assets/items/waterDrop.png",
  },
  gear: {
    name: "gear",
    path: "/assets/items/gear.png",
  },
} as const;
