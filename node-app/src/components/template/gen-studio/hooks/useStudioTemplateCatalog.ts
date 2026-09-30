"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PromptItemType } from "types/app";
import { runAfterCurrentRender } from "utils/common";
import { subscribePromptListChanged } from "utils/app/promptSync";
import { mergeStudioPromptPageItems } from "utils/app/genStudioHelpers";
import {
  normalizeStudioTemplateKeyList,
} from "utils/app/genStudioTemplateCatalog";
import { logger } from "utils/log";

export type StudioTemplateCatalogPage<T extends PromptItemType> = {
  items: T[];
  total?: number;
};

export type StudioTemplateCatalogFetchArgs = {
  q?: string;
  limit: number;
  skip: number;
};

export type UseStudioTemplateCatalogOptions<T extends PromptItemType> = {
  kind: "image" | "content";
  query: string;
  page: number;
  pageSize: number;
  enabled?: boolean;
  /** 이미지 그룹 allow-list가 해석되기 전처럼 목록 fetch를 잠시 미룰 때 사용한다. */
  defer?: boolean;
  /** 이미지의 allow-list 직접 조회만 활성화한다. 콘텐츠는 페이지 adapter만 사용한다. */
  allowListEnabled?: boolean;
  allowListKeys?: readonly unknown[];
  allowListIdentity?: string;
  preferredTemplateKeys?: readonly unknown[];
  fetchPage: (args: StudioTemplateCatalogFetchArgs) => Promise<StudioTemplateCatalogPage<T>>;
  fetchByKey?: (templateKey: string) => Promise<T | null>;
  normalizeItem?: (item: T) => T;
  sortAllowListItems?: (items: T[], keys: string[]) => T[];
};

export type UseStudioTemplateCatalogResult<T extends PromptItemType> = {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  isLoadingItems: boolean;
  templateTotal: number;
  allowListExhausted: boolean;
  reloadItems: () => void;
};

/**
 * 이미지·콘텐츠 템플릿 목록의 공통 orchestration.
 *
 * 검색/페이지 변경 중 이전 응답이 최신 목록을 덮어쓰지 않도록 요청 key를
 * 확인하고, 목록 변경 이벤트가 진행 중 fetch와 겹치면 pending reload로 합친다.
 * 생성 Job enqueue/watcher와 도메인별 검색 정책은 이 hook의 책임이 아니다.
 */
export function useStudioTemplateCatalog<T extends PromptItemType>(
  options: UseStudioTemplateCatalogOptions<T>,
): UseStudioTemplateCatalogResult<T> {
  const {
    kind,
    query,
    page,
    pageSize,
    enabled = true,
    defer = false,
    allowListEnabled = false,
    allowListIdentity = "",
    fetchPage,
    fetchByKey,
    normalizeItem,
    sortAllowListItems,
  } = options;
  const normalizedAllowListKeys = useMemo(
    () => normalizeStudioTemplateKeyList(options.allowListKeys),
    [options.allowListKeys],
  );
  const normalizedPreferredTemplateKeys = useMemo(
    () => normalizeStudioTemplateKeyList(options.preferredTemplateKeys),
    [options.preferredTemplateKeys],
  );
  const effectiveAllowListIdentity = allowListIdentity || normalizedAllowListKeys.join("\u0000");
  const requestKey = useMemo(
    () =>
      [
        kind,
        query.trim(),
        page,
        pageSize,
        enabled ? "enabled" : "disabled",
        defer ? "deferred" : "ready",
        allowListEnabled ? "allow-list" : "page-list",
        effectiveAllowListIdentity,
        normalizedAllowListKeys.join("\u0000"),
        normalizedPreferredTemplateKeys.join("\u0000"),
      ].join("\u0001"),
    [
      allowListEnabled,
      defer,
      effectiveAllowListIdentity,
      enabled,
      kind,
      normalizedAllowListKeys,
      normalizedPreferredTemplateKeys,
      page,
      pageSize,
      query,
    ],
  );
  const [items, setItems] = useState<T[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [templateTotal, setTemplateTotal] = useState(0);
  const [exhaustedAllowListIdentity, setExhaustedAllowListIdentity] = useState("");
  const isLoadingRef = useRef(false);
  const pendingReloadRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const activeRequestKeyRef = useRef("");
  const latestRequestKeyRef = useRef(requestKey);
  const loadItemsRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    latestRequestKeyRef.current = requestKey;
  }, [requestKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadItemsRef.current = null;
    };
  }, []);

  const loadItems = useCallback(async () => {
    latestRequestKeyRef.current = requestKey;
    if (!enabled || defer) {
      if (mountedRef.current && !isLoadingRef.current) setIsLoadingItems(false);
      return;
    }

    if (isLoadingRef.current) {
      pendingReloadRef.current = true;
      return;
    }

    const requestSequence = ++requestSequenceRef.current;
    const currentRequestKey = requestKey;
    const querySnapshot = query.trim();
    const pageSnapshot = page;
    const isCurrentRequest = () =>
      mountedRef.current &&
      requestSequence === requestSequenceRef.current &&
      latestRequestKeyRef.current === currentRequestKey;

    isLoadingRef.current = true;
    activeRequestKeyRef.current = currentRequestKey;
    setIsLoadingItems(true);

    try {
      if (allowListEnabled && normalizedAllowListKeys.length && fetchByKey) {
        const allowedItems = await Promise.all(
          normalizedAllowListKeys.map((key) => fetchByKey(key).catch(() => null)),
        );
        if (!isCurrentRequest()) return;

        const nextItems = (sortAllowListItems
          ? sortAllowListItems(
              allowedItems.filter(Boolean).map((item) => normalizeItem?.(item as T) || (item as T)),
              normalizedAllowListKeys,
            )
          : allowedItems.filter(Boolean).map((item) => normalizeItem?.(item as T) || (item as T))) as T[];

        if (nextItems.length > 0) {
          setExhaustedAllowListIdentity("");
          setItems(nextItems);
          setTemplateTotal(nextItems.length);
          return;
        }

        // allow-list의 모든 원격 fetch가 실패하면 도메인 기존 fail-soft 정책으로 일반 목록을 표시한다.
        setExhaustedAllowListIdentity(effectiveAllowListIdentity);
      } else {
        setExhaustedAllowListIdentity("");
      }

      const pageResult = await fetchPage({
        q: querySnapshot || undefined,
        limit: pageSize,
        skip: (pageSnapshot - 1) * pageSize,
      });
      if (!isCurrentRequest()) return;

      let nextItems = pageResult.items.map((item) => normalizeItem?.(item) || item);
      if (pageSnapshot === 1 && normalizedPreferredTemplateKeys.length && fetchByKey) {
        const existingKeys = new Set(nextItems.map((item) => item.key));
        const preferredItems = await Promise.all(
          normalizedPreferredTemplateKeys
            .filter((key) => !existingKeys.has(key))
            .map((key) => fetchByKey(key).catch(() => null)),
        );
        if (!isCurrentRequest()) return;

        const normalizedPreferredItems = preferredItems
          .filter(Boolean)
          .map((item) => normalizeItem?.(item as T) || (item as T));
        nextItems = mergeStudioPromptPageItems(normalizedPreferredItems, nextItems);
      }

      if (!isCurrentRequest()) return;
      setItems(nextItems);
      setTemplateTotal(pageResult.total || nextItems.length);
    } catch (error) {
      if (isCurrentRequest()) logger.warn(error);
    } finally {
      if (activeRequestKeyRef.current !== currentRequestKey) return;
      activeRequestKeyRef.current = "";
      isLoadingRef.current = false;
      if (!mountedRef.current) return;
      setIsLoadingItems(false);

      if (pendingReloadRef.current) {
        pendingReloadRef.current = false;
        runAfterCurrentRender(() => void loadItemsRef.current?.());
      }
    }
  }, [
    allowListEnabled,
    effectiveAllowListIdentity,
    enabled,
    fetchByKey,
    fetchPage,
    normalizedAllowListKeys,
    normalizedPreferredTemplateKeys,
    page,
    pageSize,
    query,
    requestKey,
    defer,
    normalizeItem,
    sortAllowListItems,
  ]);

  const reloadItems = useCallback(() => {
    void loadItemsRef.current?.();
  }, []);

  useEffect(() => {
    loadItemsRef.current = loadItems;
  }, [loadItems]);

  useEffect(() => {
    const off = subscribePromptListChanged((change) => {
      if (change.kind === kind) reloadItems();
    });
    return off;
  }, [kind, reloadItems]);

  useEffect(() => {
    let cancelled = false;
    runAfterCurrentRender(() => {
      if (!cancelled) reloadItems();
    });
    return () => {
      cancelled = true;
    };
  }, [loadItems, reloadItems]);

  return {
    items,
    setItems,
    isLoadingItems,
    templateTotal,
    allowListExhausted:
      Boolean(effectiveAllowListIdentity) && exhaustedAllowListIdentity === effectiveAllowListIdentity,
    reloadItems,
  };
}
