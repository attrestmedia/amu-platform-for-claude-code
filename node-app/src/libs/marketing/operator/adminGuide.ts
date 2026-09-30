type LocalizedText = {
  ko: string;
  en: string;
};

export const MARKETING_QUEUE_SCHEDULE_HINT: LocalizedText = {
  ko: "예약 시각은 최종 발행만 늦추는 값이 아니라, worker가 해당 job 전체 처리를 시작하는 시점을 늦춥니다.",
  en: "The scheduled time delays the whole job start, not only the final publish step.",
};
