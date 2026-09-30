import fetchClient from "libs/api/fetchClient";
import type {
  SchoolLunchAssistRequestType,
  SchoolLunchAssistResponseType,
  SchoolLunchDailyDataType,
  SchoolLunchNeisSchoolItemType,
  SchoolLunchRenderRequestType,
  SchoolLunchRenderResponseType,
} from "types/app";

export async function searchSchoolLunchNeisSchools(params: {
  search: string;
  schoolType?: string;
  limit?: number;
}): Promise<SchoolLunchNeisSchoolItemType[]> {
  const response = await fetchClient.get<{ ok: boolean; data?: { items?: SchoolLunchNeisSchoolItemType[] } }>(
    "/thirdparty/neis/schools",
    {
      params,
      timeout: 10000,
    },
  );

  if (!response.data?.ok) return [];
  return Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
}

export async function getSchoolLunchDaily(params: {
  officeCode: string;
  schoolCode: string;
  schoolName?: string;
  schoolType?: string;
  region?: string;
  address?: string;
  date: string;
}): Promise<SchoolLunchDailyDataType | null> {
  const response = await fetchClient.get<{ ok: boolean; data?: SchoolLunchDailyDataType }>(
    "/mini-apps/school-lunch-food-map/daily",
    {
      params,
      timeout: 15000,
    },
  );

  if (!response.data?.ok || !response.data?.data) return null;
  return response.data.data;
}

export async function renderSchoolLunchTray(body: SchoolLunchRenderRequestType): Promise<SchoolLunchRenderResponseType> {
  const response = await fetchClient.post<{ ok: boolean; data?: SchoolLunchRenderResponseType }>(
    "/mini-apps/school-lunch-food-map/render",
    body,
    {
      timeout: 120000,
    },
  );

  if (!response.data?.ok || !response.data?.data) {
    throw new Error("school_lunch_tray_render_failed");
  }

  return response.data.data;
}

export async function generateSchoolLunchDishAssist(
  body: SchoolLunchAssistRequestType,
): Promise<SchoolLunchAssistResponseType> {
  const response = await fetchClient.post<{ ok: boolean; data?: SchoolLunchAssistResponseType }>(
    "/mini-apps/school-lunch-food-map/assist",
    body,
    {
      timeout: 120000,
    },
  );

  if (!response.data?.ok || !response.data?.data) {
    throw new Error("school_lunch_dish_assist_failed");
  }

  return response.data.data;
}
