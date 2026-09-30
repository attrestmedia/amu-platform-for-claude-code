"use client";

import { useEffect, useState } from "react";
import { fetchGenStudioModelCatalog, type GenStudioModelCatalogClientResult, type GenStudioModelCatalogClientType } from "libs/api/lab/modelCatalog";
import { logger } from "utils/log";

type CatalogState = {
  catalog: GenStudioModelCatalogClientResult | null;
  loadedType: GenStudioModelCatalogClientType | null;
};

export function useGenStudioModelCatalog(type: GenStudioModelCatalogClientType = "all") {
  const [state, setState] = useState<CatalogState>({ catalog: null, loadedType: null });

  useEffect(() => {
    let alive = true;
    fetchGenStudioModelCatalog(type)
      .then((nextCatalog) => {
        if (!alive) return;
        setState({ catalog: nextCatalog, loadedType: type });
      })
      .catch((error) => {
        logger.error("[useGenStudioModelCatalog] load failed", error);
        if (alive) setState((prev) => ({ catalog: prev.catalog, loadedType: type }));
      });

    return () => {
      alive = false;
    };
  }, [type]);

  // 요청 type과 적재된 type이 다르면 로딩 중으로 간주 → effect 내부의 setLoading(true) 제거
  const loading = state.loadedType !== type;
  return {
    catalog: state.catalog,
    loading,
    source: loading ? "loading" : state.catalog?.source || "fallback",
  } as const;
}
