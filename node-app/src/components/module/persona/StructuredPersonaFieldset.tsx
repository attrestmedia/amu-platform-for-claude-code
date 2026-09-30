"use client";

import { Lang, lang } from "components/module/i18n";
import { Input, Textarea } from "@amu-labs/ui";
import type { StructuredPersonaGuide } from "utils/app/structuredPersona";

type StructuredPersonaFieldsetProps = {
  value: StructuredPersonaGuide;
  onChange: (next: StructuredPersonaGuide) => void;
  disabled?: boolean;
  className?: string;
  hintName?: string;
  hintJob?: string;
  hintLanguage?: string;
};

function patchGuide(
  value: StructuredPersonaGuide,
  onChange: (next: StructuredPersonaGuide) => void,
  key: keyof StructuredPersonaGuide,
  nextValue: string,
) {
  onChange({
    ...value,
    [key]: nextValue,
  });
}

export default function StructuredPersonaFieldset({
  value,
  onChange,
  disabled = false,
  className,
  hintName = "",
  hintJob = "",
  hintLanguage = "",
}: StructuredPersonaFieldsetProps) {
  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "이름", en: "Name" }} />
          </label>
          <Input
            value={value.name}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "name", event.target.value.slice(0, 80))}
            placeholder={hintName || lang({ ko: "예: 민아 하트", en: "e.g. Mina Hart" })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "직업/역할", en: "Job or role" }} />
          </label>
          <Input
            value={value.job}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "job", event.target.value.slice(0, 120))}
            placeholder={hintJob || lang({ ko: "예: 영어 회화 튜터", en: "e.g. English speaking tutor" })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "국적/문화권", en: "Nationality or cultural background" }} />
          </label>
          <Input
            value={value.nationality}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "nationality", event.target.value.slice(0, 80))}
            placeholder={lang({ ko: "예: 한국, 일본, 글로벌", en: "e.g. Korea, Japan, global" })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "성별 표현", en: "Gender expression" }} />
          </label>
          <Input
            value={value.gender}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "gender", event.target.value.slice(0, 32))}
            placeholder={lang({ ko: "예: 여성, 남성, 중성적", en: "e.g. feminine, masculine, androgynous" })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "사용 언어", en: "Language" }} />
          </label>
          <Input
            value={value.language}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "language", event.target.value.slice(0, 80))}
            placeholder={hintLanguage || lang({ ko: "예: English, Korean", en: "e.g. English, Korean" })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "가치관", en: "Values" }} />
          </label>
          <Input
            value={value.values}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "values", event.target.value.slice(0, 240))}
            placeholder={lang({ ko: "예: 정직함, 꾸준함, 실전 중심", en: "e.g. honesty, consistency, practical focus" })}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "외모", en: "Appearance" }} />
          </label>
          <Textarea
            rows={3}
            value={value.appearance}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "appearance", event.target.value.slice(0, 240))}
            placeholder={lang({
              ko: "예: 단정한 베이지 재킷, 짧은 흑갈색 머리, 또렷하지만 부드러운 인상",
              en: "e.g. Neat beige jacket, short dark brown hair, sharp but warm impression",
            })}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "성격", en: "Personality" }} />
          </label>
          <Textarea
            rows={3}
            value={value.personality}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "personality", event.target.value.slice(0, 240))}
            placeholder={lang({
              ko: "예: 차분하지만 단호하고, 먼저 칭찬한 뒤 짧고 정확하게 교정해주는 타입",
              en: "e.g. Calm but decisive, praises first and then corrects briefly and precisely",
            })}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "배경", en: "Background" }} />
          </label>
          <Textarea
            rows={3}
            value={value.background}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "background", event.target.value.slice(0, 400))}
            placeholder={lang({
              ko: "예: 실무 프로젝트와 시험 준비를 오래 도와온 학습 코치",
              en: "e.g. A learning coach who has guided practical projects and exam prep for years",
            })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "취미/선호", en: "Hobby or preference" }} />
          </label>
          <Input
            value={value.hobby}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "hobby", event.target.value.slice(0, 160))}
            placeholder={lang({ ko: "예: 재즈, 여행, 독서", en: "e.g. jazz, travel, reading" })}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "스타일/무드", en: "Style or mood" }} />
          </label>
          <Input
            value={value.style}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "style", event.target.value.slice(0, 160))}
            placeholder={lang({ ko: "예: 미니멀, 신뢰감, 따뜻함", en: "e.g. minimal, trustworthy, warm" })}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-primary-text">
            <Lang text={{ ko: "소개 한 줄", en: "Intro line" }} />
          </label>
          <Input
            value={value.tutorIntro}
            disabled={disabled}
            onChange={(event) => patchGuide(value, onChange, "tutorIntro", event.target.value.slice(0, 240))}
            placeholder={lang({
              ko: "예: 전략을 말랑하게 정리해주는 실전형 브랜드 튜터",
              en: "e.g. A practical brand tutor who makes strategy easy to digest",
            })}
          />
        </div>
      </div>
    </div>
  );
}
