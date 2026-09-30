import type { IPersonaAbility, IPersonaItem } from "./ai";
import type { LanguageType } from "./language";
import type { UserRoles, UserAccountType } from "consts/auth";
import type { AccountStatus, AccountPolicyId, PolicyConsentMethod } from "consts/legal/accountPolicy";
import type { VoicePurposeConsentRecord } from "consts/legal/voiceDataConsent";

interface ILoginStats {
  firstLogin?: Date;
  lastLogin?: Date;
  lastIp?: string;
  lastUserAgent?: string;
  lastDevice?: string;
  totalLogins?: number;
  consecutiveDays?: number;
  lastLoginDate?: Date;
  recentLoginDates?: Date[];
}

export interface IUserInfo {
  name: string;
  birthdate: string;
  age?: number;
  gender?: string;
  interests?: string;
  language?: LanguageType;
  profileImageUrl?: string;
}

export interface IProviders {
  provider: string;
  providerAccountId: string;
  uid: string;
  linkedAt?: Date;
}

export interface IUpdateUserData {
  // 고유 사용자 ID
  uid: string;

  // 사용자 이메일 정보
  userEmail: string;

  // 완전 비교를 위한 소문자 변환 이메일 정보
  userEmailLower?: string;

  // 소셜 로그인 프로바이더 정보
  providers?: IProviders[];

  accountStatus?: AccountStatus;
  deletionRequestedAt?: Date;
  policyConsents?: Array<{
    policyId: AccountPolicyId;
    version: string;
    agreedAt: Date;
    method: PolicyConsentMethod;
    provider?: string;
  }>;
  purposeConsents?: VoicePurposeConsentRecord[];

  // 로그인 통계
  loginStats?: ILoginStats;

  // 사용자 프로필 정보
  userInfo?: IUserInfo;

  // 유니버스별로 선택된 페르소나의 ID 저장
  selectedPersonas?: {
    [universe: string]: string;
  };

  // 대화를 한 번 이상 진행한 페르소나들
  // 유저와 만난 페르소나들의 목록이며 아직 친밀도가 쌓이지 않은 페르소나들로, 유저는 해당 페르소나들의 artifact를 가지고 있지 않음
  personas?: {
    [universe: string]: IPersonaItem[];
  };

  // 유저와 친밀도가 쌓인 페르소나들
  // 유저와 어느 정도의 친밀도가 쌓인 페르소나들로, 유저는 해당 페르소나들의 artifact를 가지고 있음
  userPersonas?: {
    [universe: string]: IPersonaItem[];
  };

  // 게임 내 유저 능력치: 레벨, 경험치, 친밀도 등
  gameStats?: {
    [universe: string]: IPersonaAbility;
  };

  // 소유 아이템 정보
  inventory?: {
    coins?: number;
    diamonds?: number;
    items?: Array<{ itemId: string; quantity: number }>;
  };

  wallet?: {
    bonus?: { coins: number };
    membership: { coins: number; expiresAt?: Date; lastChargedAt?: Date; billingMode?: "calendar" | "anniversary" };
    charged: { coins: number };
    usageReceipts?: Array<{
      operationId: string;
      sourceOperationId?: string;
      kind: "deduction" | "compensation";
      coins: number;
      walletDebit: { bonusCoins: number; membershipCoins: number; chargedCoins: number };
      appliedAt: Date;
    }>;
  };

  subscription?: {
    active?: boolean;
    stageCount?: number;
    planAmount?: number;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    lastPaidAt?: Date;
    cancelAtPeriodEnd?: boolean;
  };

  roles?: UserRoles[];

  // ⚠ 계정 등급 - user API는 read-only, 결제/지갑 로직과 관리자 채널만 변경 가능
  accountType?: UserAccountType;

  // NPC 이용 관련 통계
  npcStats?: {
    totalInteractions?: number;
    uniqueNpcsInteracted?: number;
    lastInteractedNpcId?: string;
  };

  // 마지막으로 접속한 유니버스 정보
  lastAccessedUniverse?: string;
  studioPreferences?: {
    imagePromptBookmarks?: string[];
    contentPromptBookmarks?: string[];
    imageExtraPromptBookmarks?: Array<{
      id: string;
      templateKey: string;
      text: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  update?: boolean;
}
