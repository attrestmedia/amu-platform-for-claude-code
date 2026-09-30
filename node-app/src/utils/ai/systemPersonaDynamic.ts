import { listSystemPersonas } from "libs/api/universe";
import type { SystemPersonaUsageType } from "types/ai";
import { normalizeSystemPersonaUsageType } from "types/ai";
import { toUnknownRecord, pickArray, pickString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose systemPersonaDynamic 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain persona
 * @scope client
 */

type PersonaRow = {
  key: string;
  enabled: boolean;
  forUniverses?: SystemPersonaUsageType;
  universeId?: string | null;
  personaPid?: string | null;
};

let _cache: { rows: PersonaRow[]; ts: number } | null = null;
const TTL = 10 * 60 * 1000;

export function invalidateSystemPersonaClientCache() {
  _cache = null;
}

async function ensureLoaded(): Promise<PersonaRow[]> {
  const now = Date.now();
  if (_cache && now - _cache.ts < TTL) return _cache.rows;

  const rows = pickArray<unknown>(await listSystemPersonas({ enabled: true }));

  const norm: PersonaRow[] = rows
    .map((row) => {
      const r = toUnknownRecord(row);
      return {
        key: pickString(r.key),
        enabled: !!r.enabled,
        forUniverses: normalizeSystemPersonaUsageType(
          typeof r.forUniverses === "string" ? r.forUniverses : undefined,
        ),
        universeId: typeof r.universeId === "string" ? r.universeId : null,
        personaPid: typeof r.personaPid === "string" ? r.personaPid : null,
      };
    })
    .filter((r) => r.key && r.enabled);

  _cache = { rows: norm, ts: now };
  return norm;
}

export async function getEnabledPersonaKeys(filter?: {
  forUniverses?: SystemPersonaUsageType;
  universeId?: string;
  personaPid?: string;
}) {
  const rows = await ensureLoaded();
  const f = normalizeSystemPersonaUsageType(filter?.forUniverses);

  let filtered = rows;

  if (f !== "all") {
    filtered = filtered.filter((r) => r.forUniverses === "all" || r.forUniverses === f);
  }

  if (filter?.universeId) {
    filtered = filtered.filter((r) => !r.universeId || r.universeId === filter.universeId);
  }

  if (filter?.personaPid) {
    filtered = filtered.filter((r) => !r.personaPid || r.personaPid === filter.personaPid);
  }

  return filtered.map((r) => r.key);
}
