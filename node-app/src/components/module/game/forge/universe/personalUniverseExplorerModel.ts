import type {
  CanonPayload,
  CanonReferenceEntityType,
  IPersonalUniverseCanonRevisionDoc,
} from "types/game";
import type { PersonalUniverseOverviewData } from "libs/api/game/personalUniverseClient";

export type PersonalUniverseExplorerTab = "overview" | "focus" | "timeline" | "threads";

export type ExplorerCharacter = {
  id: string;
  title: string;
  summary: string;
  speciesId?: string;
  sourceImageRef?: string;
};

export type ExplorerEvent = {
  id: string;
  title: string;
  summary: string;
  eventType: string;
  characterIds: string[];
  regionId: string;
  order: number;
  createdAt?: string | Date;
};

export type ExplorerRelation = {
  id: string;
  sourceCharacterId: string;
  targetRefType: CanonReferenceEntityType;
  targetRefId: string;
  relationTypes: string[];
  reason: string;
  sinceEventId: string;
  visibility: "public" | "internal";
  relatedEvents: ExplorerEvent[];
};

export type ExplorerThread = {
  id: string;
  title: string;
  summary: string;
  status: "open" | "advancing" | "resolved";
  relatedEventIds: string[];
  characterIds: string[];
};

export type PersonalUniverseExplorerModel = {
  universeName: string;
  premise: string;
  universeVisibility: "private" | "link" | "public";
  characters: ExplorerCharacter[];
  events: ExplorerEvent[];
  relations: ExplorerRelation[];
  threads: ExplorerThread[];
  entityTitle: (type: string, id: string) => string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function payloadOf(revision: IPersonalUniverseCanonRevisionDoc) {
  return revision.payload as CanonPayload;
}

function titleOf(revision: IPersonalUniverseCanonRevisionDoc) {
  const payload = payloadOf(revision);
  return text(payload.title) || text(payload.worldName) || revision.entityId;
}

function stableEntityTitle(revision: IPersonalUniverseCanonRevisionDoc | undefined, id: string) {
  return revision ? titleOf(revision) : id;
}

export function buildPersonalUniverseExplorerModel(data: PersonalUniverseOverviewData): PersonalUniverseExplorerModel {
  const revisions = data.canon || [];
  const byKey = new Map<string, IPersonalUniverseCanonRevisionDoc>(revisions.map((revision) => [`${revision.entityType}:${revision.entityId}`, revision] as const));
  const apiCharacters = new Map((data.characters || []).map((character) => [character.characterId, character] as const));

  const characters = revisions
    .filter((revision) => revision.entityType === "character")
    .map((revision) => {
      const payload = payloadOf(revision);
      const apiCharacter = apiCharacters.get(revision.entityId);
      return {
        id: revision.entityId,
        title: apiCharacter?.name || titleOf(revision),
        summary: text(payload.summary) || text(payload.description),
        speciesId: apiCharacter?.speciesId || text(payload.speciesId) || undefined,
        sourceImageRef: apiCharacter?.sourceImageRef || undefined,
      } satisfies ExplorerCharacter;
    });

  apiCharacters.forEach((character, id) => {
    if (characters.some((item) => item.id === id)) return;
    characters.push({ id, title: character.name || id, summary: "", speciesId: character.speciesId, sourceImageRef: character.sourceImageRef });
  });

  const events = revisions
    .filter((revision) => revision.entityType === "event")
    .map((revision, index) => {
      const payload = payloadOf(revision);
      return {
        id: revision.entityId,
        title: titleOf(revision),
        summary: text(payload.summary) || text(payload.description),
        eventType: text(payload.eventType),
        characterIds: textList(payload.characterIds),
        regionId: text(payload.regionId),
        order: numberValue(payload.startOrder, numberValue(payload.endOrder, index)),
        createdAt: revision.createdAt,
      } satisfies ExplorerEvent;
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const entityTitle = (type: string, id: string) => {
    if (type === "character") return characters.find((character) => character.id === id)?.title || id;
    return stableEntityTitle(byKey.get(`${type}:${id}`), id);
  };

  const relations = revisions
    .filter((revision) => revision.entityType === "relation")
    .map((revision) => {
      const payload = payloadOf(revision);
      const sourceCharacterId = text(payload.sourceCharacterId);
      const targetRefType = text(payload.targetRefType) as CanonReferenceEntityType;
      const targetRefId = text(payload.targetRefId);
      const relationEvents = events.filter((event) => {
        if (event.id === text(payload.sinceEventId)) return true;
        if (targetRefType === "character") return event.characterIds.includes(sourceCharacterId) && event.characterIds.includes(targetRefId);
        return event.characterIds.includes(sourceCharacterId) && event.regionId === targetRefId;
      }).slice(0, 3);

      return {
        id: revision.entityId,
        sourceCharacterId,
        targetRefType,
        targetRefId,
        relationTypes: textList(payload.relationTypes),
        reason: text(payload.reason),
        sinceEventId: text(payload.sinceEventId),
        visibility: payload.visibility === "internal" ? "internal" : "public",
        relatedEvents: relationEvents,
      } satisfies ExplorerRelation;
    })
    .filter((relation) => Boolean(relation.sourceCharacterId && relation.targetRefType && relation.targetRefId));

  const threads = revisions
    .filter((revision) => revision.entityType === "open-loop")
    .map((revision) => {
      const payload = payloadOf(revision);
      const status = payload.status === "advancing" || payload.status === "resolved" ? payload.status : "open";
      return {
        id: revision.entityId,
        title: titleOf(revision),
        summary: text(payload.summary) || text(payload.description),
        status,
        relatedEventIds: textList(payload.relatedEventIds),
        characterIds: textList(payload.characterIds),
      } satisfies ExplorerThread;
    });

  return {
    universeName: text(revisions.find((revision) => revision.entityType === "core-law")?.payload.worldName)
      || text(revisions.find((revision) => revision.entityType === "core-law")?.payload.title)
      || "나의 Personal Universe",
    premise: text(revisions.find((revision) => revision.entityType === "core-law")?.payload.premise)
      || text(revisions.find((revision) => revision.entityType === "core-law")?.payload.summary),
    universeVisibility: data.universe?.visibility || "private",
    characters,
    events,
    relations,
    threads,
    entityTitle,
  };
}

export function relationTargetLabel(model: PersonalUniverseExplorerModel, relation: ExplorerRelation) {
  return model.entityTitle(relation.targetRefType, relation.targetRefId);
}

export function relationCharacterLabel(model: PersonalUniverseExplorerModel, characterId: string) {
  return model.entityTitle("character", characterId);
}

export function relatedEventsForThread(model: PersonalUniverseExplorerModel, thread: ExplorerThread) {
  const eventIds = new Set(thread.relatedEventIds);
  return model.events.filter((event) => eventIds.has(event.id));
}

export function getFocusRelations(model: PersonalUniverseExplorerModel, characterId: string) {
  return model.relations.filter((relation) => relation.sourceCharacterId === characterId || (relation.targetRefType === "character" && relation.targetRefId === characterId));
}

export function getLatestEvents(model: PersonalUniverseExplorerModel, limit = 4) {
  return [...model.events].sort((a, b) => b.order - a.order).slice(0, limit);
}
