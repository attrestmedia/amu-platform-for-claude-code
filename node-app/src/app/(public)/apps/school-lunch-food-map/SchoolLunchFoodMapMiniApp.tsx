"use client";

import { startTransition, useEffect, useState } from "react";
import { ImagePlus, MapPin, Search, Sparkles } from "lucide-react";
import { Button, Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type {
  SchoolLunchAssistResponseType,
  SchoolLunchDailyDataType,
  SchoolLunchDishType,
  SchoolLunchNeisSchoolItemType,
  SchoolLunchRenderResponseType,
} from "types/app";
import {
  searchSchoolLunchNeisSchools,
  getSchoolLunchDaily,
  renderSchoolLunchTray,
  generateSchoolLunchDishAssist,
} from "libs/api/mini-app/schoolLunchFoodMap";
import { SCHOOL_LUNCH_TRAY_TEMPLATE_KEY } from "src/libs/apps/schoolLunchFoodMap";
import { toErrorMessage } from "utils/common";

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function TrayStage({
  daily,
  rendered,
  selectedDishId,
  onSelectDish,
}: {
  daily: SchoolLunchDailyDataType;
  rendered: SchoolLunchRenderResponseType | null;
  selectedDishId: string;
  onSelectDish: (dish: SchoolLunchDishType) => void;
}) {
  const activeImageUrl = rendered?.imageUrl || daily.trayImage.previewUrl || "";
  const hotspots = rendered?.layout.hotspots || daily.layout.hotspots;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:bg-slate-900/80">
      <div className="relative aspect-[4/3] w-full bg-[radial-gradient(circle_at_top,#fff7ed,transparent_42%),linear-gradient(135deg,#fef3c7_0%,#fde68a_28%,#f8fafc_65%,#e2e8f0_100%)] dark:bg-[radial-gradient(circle_at_top,#334155,transparent_40%),linear-gradient(135deg,#0f172a_0%,#1e293b_55%,#111827_100%)]">
        {activeImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activeImageUrl} alt="school-lunch-tray" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-800/80 dark:text-slate-100">
              <Lang text={{ ko: "예시 식판 이미지 생성 전", en: "Before tray image render" }} />
            </div>
          </div>
        )}

        {hotspots.map((hotspot) => {
          const selected = hotspot.dishId === selectedDishId;
          const dish = daily.dishes.find((item) => item.id === hotspot.dishId);
          if (!dish) return null;

          return (
            <button
              key={hotspot.dishId}
              type="button"
              aria-label={lang({ ko: `${hotspot.label} 설명 보기`, en: `View ${hotspot.label} info` })}
              className={`absolute rounded-[20px] border transition ${
                selected
                  ? "border-sky-500 bg-sky-500/15 shadow-[0_0_0_3px_rgba(14,165,233,0.18)]"
                  : "border-white/80 bg-white/12 hover:bg-white/20"
              }`}
              style={{
                left: `${hotspot.x * 100}%`,
                top: `${hotspot.y * 100}%`,
                width: `${hotspot.w * 100}%`,
                height: `${hotspot.h * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              onClick={() => onSelectDish(dish)}
            >
              <span className="sr-only">{hotspot.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SchoolLunchFoodMapMiniApp() {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState(todayText());
  const [status, setStatus] = useState("");
  const [schools, setSchools] = useState<SchoolLunchNeisSchoolItemType[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<SchoolLunchNeisSchoolItemType | null>(null);
  const [daily, setDaily] = useState<SchoolLunchDailyDataType | null>(null);
  const [rendered, setRendered] = useState<SchoolLunchRenderResponseType | null>(null);
  const [selectedDishId, setSelectedDishId] = useState("");
  const [assist, setAssist] = useState<SchoolLunchAssistResponseType | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isGeneratingAssist, setIsGeneratingAssist] = useState(false);

  const selectedDish = daily?.dishes.find((dish) => dish.id === selectedDishId) || daily?.dishes[0] || null;

  useEffect(
    function resetAssistOnSelectionChange() {
      // 외부 선택(요리/날짜/학교) 변경 시 추천 결과 초기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssist(null);
    },
    [selectedDishId, daily?.mealDate, selectedSchool?.schoolCode],
  );

  const handleSearch = () => {
    const search = query.trim();
    if (!search) {
      setStatus(lang({ ko: "학교 이름을 먼저 입력해주세요.", en: "Enter a school name first." }));
      return;
    }

    setIsSearching(true);
    setStatus(lang({ ko: "학교를 찾는 중입니다.", en: "Searching schools." }));

    startTransition(async () => {
      try {
        const items = await searchSchoolLunchNeisSchools({ search, limit: 8 });
        setSchools(items);
        setStatus(
          items.length
            ? lang({ ko: "학교를 선택하면 오늘 급식을 불러옵니다.", en: "Select a school to load today's lunch." })
            : lang({ ko: "검색 결과가 없습니다.", en: "No matching schools found." }),
        );
      } catch (error: unknown) {
        setSchools([]);
        setStatus(toErrorMessage(error, lang({ ko: "학교 검색에 실패했습니다.", en: "School search failed." })));
      } finally {
        setIsSearching(false);
      }
    });
  };

  const handleSelectSchool = (school: SchoolLunchNeisSchoolItemType) => {
    setSelectedSchool(school);
    setRendered(null);
    setAssist(null);
    setIsLoadingDaily(true);
    setStatus(lang({ ko: "오늘 급식을 불러오는 중입니다.", en: "Loading daily lunch." }));

    startTransition(async () => {
      try {
        const data = await getSchoolLunchDaily({
          ...school,
          date,
        });
        setDaily(data);
        setSelectedDishId(data?.dishes?.[0]?.id || "");
        setStatus(
          data?.dishes?.length
            ? lang({ ko: "음식을 눌러 설명을 확인해보세요.", en: "Tap a dish to view its info." })
            : lang({ ko: "해당 날짜 급식 정보가 없습니다.", en: "No lunch data for this date." }),
        );
      } catch (error: unknown) {
        setDaily(null);
        setSelectedDishId("");
        setStatus(toErrorMessage(error, lang({ ko: "급식 조회에 실패했습니다.", en: "Failed to load lunch." })));
      } finally {
        setIsLoadingDaily(false);
      }
    });
  };

  const handleRender = () => {
    if (!daily || !selectedSchool) return;

    setIsRendering(true);
    setStatus(lang({ ko: "템플릿 식판 이미지를 생성하는 중입니다.", en: "Rendering the tray image template." }));

    startTransition(async () => {
      try {
        const output = await renderSchoolLunchTray({
          schoolName: selectedSchool.schoolName,
          mealDate: daily.mealDate,
          dishes: daily.dishes.map((dish) => ({ id: dish.id, name: dish.name, role: dish.role })),
          templateKey: SCHOOL_LUNCH_TRAY_TEMPLATE_KEY,
        });
        setRendered(output);
        setStatus(lang({ ko: "식판 이미지가 생성되었습니다.", en: "Tray image generated." }));
      } catch (error: unknown) {
        setStatus(
          toErrorMessage(
            error,
            lang({
              ko: "이미지 생성에 실패했습니다. 로그인 상태와 템플릿 키를 확인해주세요.",
              en: "Tray render failed. Check login state and template key.",
            }),
          ),
        );
      } finally {
        setIsRendering(false);
      }
    });
  };

  const handleGenerateAssist = () => {
    if (!daily || !selectedDish || !selectedSchool) return;

    setIsGeneratingAssist(true);
    setStatus(lang({ ko: "AI가 음식 설명을 만드는 중입니다.", en: "AI is generating the food guide." }));

    startTransition(async () => {
      try {
        const output = await generateSchoolLunchDishAssist({
          schoolName: selectedSchool.schoolName,
          mealDate: daily.mealDate,
          dishName: selectedDish.name,
          dishRole: selectedDish.role,
          rawMenu: daily.rawMenu,
          allergyCodes: selectedDish.allergyCodes,
        });
        setAssist(output);
        setStatus(lang({ ko: "AI 음식 설명이 준비되었습니다.", en: "AI food guide is ready." }));
      } catch (error: unknown) {
        setStatus(
          toErrorMessage(
            error,
            lang({
              ko: "AI 설명 생성에 실패했습니다. 로그인 상태를 확인해주세요.",
              en: "AI guide generation failed. Check login state.",
            }),
          ),
        );
      } finally {
        setIsGeneratingAssist(false);
      }
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[linear-gradient(180deg,#fff7ed_0%,#fffbeb_28%,#f8fafc_70%,#e2e8f0_100%)] text-primary-text dark:bg-[linear-gradient(180deg,#0f172a_0%,#111827_55%,#020617_100%)]">
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_0.9fr] lg:items-start">
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600 dark:text-amber-300">
                AMU Mini App
              </p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl sm:leading-[1.04]">
                <Lang text={{ ko: "오늘 급식 푸드맵", en: "Today's Lunch Food Map" }} />
              </h1>
              <p className="max-w-2xl text-base leading-7 text-secondary-text sm:text-lg">
                <Lang
                  text={{
                    ko: "학교를 고르면 오늘 급식을 식판 푸드맵으로 보여주고, 음식마다 어디에 좋고 왜 먹으면 좋은지 쉽게 설명해줍니다.",
                    en: "Pick a school to see today's lunch as a tray map and tap each dish to learn why it matters.",
                  }}
                />
              </p>
            </div>

            <div className="rounded-[28px] border border-border/60 bg-white/78 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:bg-slate-900/78">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={lang({ ko: "학교 이름을 입력하세요", en: "Enter a school name" })}
                  className="bg-white/80 dark:bg-slate-950/40"
                />
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="sm:max-w-[13rem] bg-white/80 dark:bg-slate-950/40"
                />
                <Button className="sm:min-w-[8rem]" loading={isSearching} onClick={handleSearch}>
                  <Search className="mr-1.5 h-4 w-4" />
                  <Lang text={{ ko: "학교 찾기", en: "Search" }} />
                </Button>
              </div>

              <p className="mt-3 text-sm leading-6 text-secondary-text">{status}</p>

              {schools.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {schools.map((school) => (
                    <button
                      key={`${school.officeCode}-${school.schoolCode}`}
                      type="button"
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        selectedSchool?.officeCode === school.officeCode &&
                        selectedSchool?.schoolCode === school.schoolCode
                          ? "border-orange-400 bg-orange-50/90 dark:border-amber-300 dark:bg-amber-500/10"
                          : "border-border/70 bg-white/70 hover:border-orange-300 hover:bg-orange-50/60 dark:bg-slate-950/30 dark:hover:border-amber-200/60 dark:hover:bg-slate-900/70"
                      }`}
                      onClick={() => handleSelectSchool(school)}
                    >
                      <p className="text-sm font-semibold text-primary-text">{school.schoolName}</p>
                      <p className="mt-1 text-xs leading-5 text-secondary-text">
                        {school.schoolType} · {school.region}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {daily ? (
              <TrayStage
                daily={daily}
                rendered={rendered}
                selectedDishId={selectedDish?.id || ""}
                onSelectDish={(dish) => setSelectedDishId(dish.id)}
              />
            ) : (
              <div className="rounded-[28px] border border-dashed border-border/70 bg-white/60 px-6 py-12 text-center shadow-[0_16px_50px_rgba(15,23,42,0.05)] dark:bg-slate-900/50">
                <MapPin className="mx-auto h-8 w-8 text-orange-500 dark:text-amber-300" />
                <p className="mt-4 text-sm leading-6 text-secondary-text">
                  <Lang
                    text={{
                      ko: "학교를 선택하면 급식 식판 푸드맵 스캐폴드가 여기에서 열립니다.",
                      en: "Select a school to open the lunch tray map scaffold here.",
                    }}
                  />
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-border/60 bg-white/78 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:bg-slate-900/78">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary-text">
                <Sparkles className="h-4 w-4 text-orange-500 dark:text-amber-300" />
                <Lang text={{ ko: "템플릿 식판 이미지", en: "Template tray image" }} />
              </div>
              <p className="mt-3 text-sm leading-6 text-secondary-text">
                <Lang
                  text={{
                    ko: "식판 이미지는 Gen Studio 템플릿 키를 사용해 생성합니다. 현재 기본 키는 코드 상수로 연결되어 있어 추후 실제 키만 교체하면 됩니다.",
                    en: "The tray image uses a Gen Studio template key. The scaffold keeps the key in a constant so it can be swapped later.",
                  }}
                />
              </p>
              <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-secondary-text">
                <div>templateKey: {SCHOOL_LUNCH_TRAY_TEMPLATE_KEY}</div>
                <div>imageRatio: 4:3</div>
              </div>
              <Button
                className="mt-4 w-full"
                loading={isRendering || isLoadingDaily}
                onClick={handleRender}
                disabled={!daily}
              >
                <ImagePlus className="mr-1.5 h-4 w-4" />
                <Lang text={{ ko: "예시 식판 이미지 생성", en: "Render tray image" }} />
              </Button>
              <p className="mt-2 text-xs leading-5 text-secondary-text">
                <Lang
                  text={{
                    ko: "로그인 후 코인으로 생성됩니다. 템플릿이 없거나 권한이 없으면 서버가 에러를 반환합니다.",
                    en: "This uses login and coins. The server returns an error if the template is missing or inaccessible.",
                  }}
                />
              </p>
            </div>

            <div className="rounded-[28px] border border-border/60 bg-white/78 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:bg-slate-900/78">
              <p className="text-sm font-semibold text-primary-text">
                <Lang text={{ ko: "선택 음식 정보", en: "Selected dish info" }} />
              </p>
              {selectedDish ? (
                <div className="mt-3 space-y-3 text-sm leading-6 text-secondary-text">
                  <div>
                    <p className="text-base font-semibold text-primary-text">{selectedDish.name}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-orange-600 dark:text-amber-300">
                      {selectedDish.role}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="font-semibold text-primary-text">
                      {assist?.benefitTitle || selectedDish.benefitTitle}
                    </p>
                    <p className="mt-1">{assist?.benefitBody || selectedDish.benefitBody}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="font-semibold text-primary-text">
                      <Lang text={{ ko: "왜 먹으면 좋을까?", en: "Why eat this?" }} />
                    </p>
                    <p className="mt-1">{assist?.whyEat || selectedDish.whyEat}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="font-semibold text-primary-text">
                      <Lang text={{ ko: "맛 메모", en: "Taste note" }} />
                    </p>
                    <p className="mt-1">{assist?.tasteNote || selectedDish.tasteNote}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="font-semibold text-primary-text">
                      <Lang text={{ ko: "AI 한 입 가이드", en: "AI try tip" }} />
                    </p>
                    <p className="mt-1">
                      {assist?.tryTip ||
                        lang({
                          ko: "설명이 더 필요하면 AI 버튼으로 음식 설명을 생성할 수 있어요.",
                          en: "Generate an AI guide if you want a richer explanation.",
                        })}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="font-semibold text-primary-text">
                      <Lang text={{ ko: "주의 메모", en: "Caution note" }} />
                    </p>
                    <p className="mt-1">
                      {assist?.caution ||
                        lang({
                          ko: "알레르기나 강한 맛이 걱정되면 먼저 재료를 확인해보세요.",
                          en: "Check ingredients first if allergies or strong flavors are a concern.",
                        })}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="font-semibold text-primary-text">
                      <Lang text={{ ko: "알레르기 코드", en: "Allergy codes" }} />
                    </p>
                    <p className="mt-1">
                      {selectedDish.allergyCodes.length ? selectedDish.allergyCodes.join(", ") : "-"}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    loading={isGeneratingAssist}
                    onClick={handleGenerateAssist}
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    <Lang text={{ ko: "AI로 설명 보강", en: "Enhance with AI" }} />
                  </Button>
                  <p className="text-xs leading-5 text-secondary-text">
                    <Lang
                      text={{
                        ko: "음식 설명 보강은 텍스트 AI 모델을 사용하며 로그인 후 코인이 차감될 수 있어요.",
                        en: "This uses a text AI model and may consume coins after login.",
                      }}
                    />
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-secondary-text">
                  <Lang
                    text={{
                      ko: "음식을 선택하면 여기에서 설명을 보여줍니다.",
                      en: "Select a dish to view its details here.",
                    }}
                  />
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
