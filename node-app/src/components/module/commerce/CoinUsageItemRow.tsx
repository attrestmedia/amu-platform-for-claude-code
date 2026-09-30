import {
  CreditCard,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import type {
  CoinUsageActivity,
  CoinUsageLedgerItem,
  CoinUsagePurpose,
  CoinUsageSource,
} from "types/payment";

const ACTIVITY_META: Record<
  CoinUsageActivity,
  { icon: typeof FileText; ko: string; en: string }
> = {
  image_generation: { icon: ImageIcon, ko: "이미지 생성·편집", en: "Image generation & editing" },
  content_generation: { icon: FileText, ko: "콘텐츠 생성", en: "Content generation" },
  conversation: { icon: MessageCircle, ko: "AI 대화", en: "AI conversation" },
  audio: { icon: Mic, ko: "음성 생성·변환", en: "Voice generation & processing" },
  ai_task: { icon: Sparkles, ko: "AI 작업", en: "AI task" },
  coin_charge: { icon: CreditCard, ko: "코인 충전", en: "Coin charge" },
  subscription_grant: { icon: RefreshCw, ko: "구독 코인 지급", en: "Subscription grant" },
};

const PURPOSE_META: Partial<Record<CoinUsagePurpose, { ko: string; en: string }>> = {
  "image.remove_background": { ko: "이미지 배경 제거", en: "Image background removal" },
  "audio.synthesize": { ko: "음성 생성", en: "Speech synthesis" },
  "audio.transcribe": { ko: "음성 받아쓰기", en: "Speech transcription" },
  "audio.analyze": { ko: "발음·음성 분석", en: "Speech analysis" },
  "marketing.proofread": { ko: "마케팅 콘텐츠 오탈자 교정", en: "Marketing content correction" },
  "marketing.independent_proofread": {
    ko: "마케팅 콘텐츠 독립 오탈자 검수",
    en: "Independent marketing content proofread",
  },
  "marketing.strategy_fit": { ko: "마케팅 전략 적합도 분석", en: "Marketing strategy fit analysis" },
  "tutors.persona_generate": { ko: "튜터 페르소나 생성", en: "Tutor persona generation" },
  "tutors.profile_image_generate": { ko: "튜터 프로필 이미지 생성", en: "Tutor profile image generation" },
  "mini_app.assist": { ko: "미니앱 AI 작성 보조", en: "Mini-app AI writing assist" },
};

const SOURCE_META: Partial<Record<CoinUsageSource, { ko: string; en: string }>> = {
  local_agent: { ko: "로컬 에이전트 산출물", en: "Local agent output" },
  agent_api: { ko: "에이전트 API", en: "Agent API" },
  server_worker: { ko: "서버 자동화", en: "Server automation" },
  user_action: { ko: "사용자 요청", en: "User action" },
};

export function CoinUsageItemRow({
  item,
  dateFormatter,
}: {
  item: CoinUsageLedgerItem;
  dateFormatter: Intl.DateTimeFormat;
}) {
  const activityMeta = ACTIVITY_META[item.activity];
  const purposeMeta = PURPOSE_META[item.purpose] || activityMeta;
  const sourceMeta = SOURCE_META[item.source];
  const ActivityIcon = item.kind === "refund" ? RotateCcw : activityMeta.icon;
  const isCredit = item.amount > 0;

  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-3" role="listitem">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex-center icon-md shrink-0 rounded-full bg-muted/20">
          <ActivityIcon className="icon-xs text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {item.kind === "refund" ? (
              <Lang text={{ ko: `${purposeMeta.ko} 환불`, en: `${purposeMeta.en} refund` }} />
            ) : (
              <Lang text={purposeMeta} />
            )}
          </span>
          {(item.context?.channel || sourceMeta) && (
            <span className="block truncate text-xxs text-muted-foreground">
              {item.context?.channel ? item.context.channel : null}
              {item.context?.channel && sourceMeta ? " · " : null}
              {sourceMeta ? <Lang text={sourceMeta} /> : null}
            </span>
          )}
          <time className="mt-0.5 block text-xxs text-muted-foreground" dateTime={item.createdAt}>
            {dateFormatter.format(new Date(item.createdAt))}
          </time>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 text-sm font-bold tabular-nums",
          isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
        )}
      >
        {isCredit ? "+" : ""}
        {item.amount.toLocaleString()}
        <span className="ml-1 text-xs font-normal">
          <Lang text={{ ko: "코인", en: "coins" }} />
        </span>
      </span>
    </div>
  );
}
