import { useQuery } from "@tanstack/react-query";
import type { IWpCategory } from "types/thirdparty";
import { getCachedCategories } from "libs/api/wp";

/**
 * @docHint
 * @purpose useCachedCategories 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain wp-category
 * @scope client
 */

interface GroupedCategories {
  depth1: IWpCategory[];
  depth2: Record<number, IWpCategory[]>;
}

// 워드프레스 카테고리 목록을 캐시에서 불러오고, 1/2단계(depth1/2)로 그룹화하여 반환
const useCachedCategories = () => {
  // 캐시된 카테고리 데이터를 가져오는 fetch 함수
  const fetchCategories = async (): Promise<IWpCategory[]> => {
    return getCachedCategories();
  };

  // 카테고리를 그룹화하는 함수
  const groupCategories = (categories: IWpCategory[]): GroupedCategories => {
    // 1단계 카테고리 (부모가 0인 카테고리)
    const depth1 = categories.filter((cat: IWpCategory) => cat.parent === 0);

    // 2단계 카테고리를 부모 ID로 그룹화
    const depth2: Record<number, IWpCategory[]> = {};

    depth1.forEach((parent: IWpCategory) => {
      depth2[parent.id] = categories.filter((cat: IWpCategory) => cat.parent === parent.id);
    });

    return { depth1, depth2 };
  };

  // react-query를 사용해 데이터 fetch
  const { data: rawCategories, ...rest } = useQuery({
    queryKey: ["cachedCategories"],
    queryFn: fetchCategories,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // 카테고리 데이터가 있으면 그룹화
  const groupedCategories = rawCategories ? groupCategories(rawCategories) : { depth1: [], depth2: {} };

  return {
    rawCategories,
    groupedCategories,
    ...rest,
  };
};

export default useCachedCategories;
