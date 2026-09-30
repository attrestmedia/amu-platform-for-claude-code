import type { TextProviderType } from "types/ai";

export type SchoolLunchDishRoleType =
  | "rice"
  | "soup"
  | "main"
  | "side_a"
  | "side_b"
  | "kimchi_or_pickles"
  | "dessert_or_drink"
  | "extra_1"
  | "extra_2";

export type SchoolLunchHotspotShapeType = "rounded-rect" | "circle";

export type SchoolLunchNeisSchoolItemType = {
  officeCode: string;
  schoolCode: string;
  schoolName: string;
  schoolType: string;
  region: string;
  address: string;
};

export type SchoolLunchDishType = {
  id: string;
  name: string;
  role: SchoolLunchDishRoleType;
  benefitTitle: string;
  benefitBody: string;
  whyEat: string;
  tasteNote: string;
  allergyCodes: number[];
};

export type SchoolLunchHotspotType = {
  dishId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: SchoolLunchHotspotShapeType;
};

export type SchoolLunchLayoutType = {
  templateKey: string;
  imageRatio: string;
  hotspots: SchoolLunchHotspotType[];
};

export type SchoolLunchDailyDataType = {
  school: SchoolLunchNeisSchoolItemType;
  mealDate: string;
  rawMenu: string[];
  allergyCodes: number[];
  dishes: SchoolLunchDishType[];
  layout: SchoolLunchLayoutType;
  trayImage: {
    status: "not_generated" | "generated";
    previewUrl: string | null;
    templateKey: string;
  };
  allergyGuide: Array<{
    code: number;
    label: string;
  }>;
};

export type SchoolLunchRenderDishInputType = Pick<SchoolLunchDishType, "id" | "name" | "role">;

export type SchoolLunchRenderRequestType = {
  schoolName: string;
  mealDate: string;
  dishes: SchoolLunchRenderDishInputType[];
  style?: string;
  templateKey?: string;
};

export type SchoolLunchRenderResponseType = {
  imageUrl: string;
  templateKey: string;
  layout: SchoolLunchLayoutType;
  billing: {
    coinsUsed: number;
  };
};

export type SchoolLunchAssistRequestType = {
  schoolName: string;
  mealDate: string;
  dishName: string;
  dishRole: SchoolLunchDishRoleType;
  rawMenu?: string[];
  allergyCodes?: number[];
  modelName?: string;
  provider?: TextProviderType;
};

export type SchoolLunchAssistResponseType = {
  title: string;
  benefitTitle: string;
  benefitBody: string;
  whyEat: string;
  tasteNote: string;
  tryTip: string;
  caution: string;
  billing: {
    coinsUsed: number;
  };
};
