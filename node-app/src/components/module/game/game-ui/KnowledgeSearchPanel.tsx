"use client";

import { useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { Button, Input, ScrollArea, Badge } from "@amu-labs/ui";
import { usePostSearch, usePostDetail, useSearchSuggestions, useLatestPosts, useRandomPosts } from "hooks/thirdparty";
import { requestCacheUpdate } from "libs/api/wp";
import { Search, BookOpen, X, File, ExternalLink, Minimize2, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { useUserDataStore } from "store/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import type { IKnowledgeContextSource } from "types/ai";
import type { IWpPost } from "types/thirdparty/wp";
import "styles/modules/knowledge.scss";

type KnowledgeDetailType = IKnowledgeContextSource & {
  sourcePost?: IWpPost;
};

// ref를 통해 노출할 메서드들의 타입
interface KnowledgeSearchPanelRef {
  minimize: () => void;
  maximize: () => void;
}

interface KnowledgeSearchPanelProps {
  isVisible: boolean;
  onToggle: () => void;
  onKnowledgeAdd: (knowledge: IKnowledgeContextSource) => void | Promise<void>;
  onDiscuss?: () => void;
  className?: string;
  hasKnowledgeContext?: boolean;
}

const getRenderedText = (field: string | { rendered?: string } | undefined): string => {
  if (typeof field === "string") return field;
  return String(field?.rendered || "");
};

const getWpPostUrl = (post: IWpPost): string => String(post.link || post.guid?.rendered || "").trim();

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toWpKnowledgeDetail = (post: IWpPost): KnowledgeDetailType => ({
  id: `wp-post:${post.id}`,
  sourceType: "wp-post",
  sourceLabel: "WordPress",
  title: getRenderedText(post.title),
  content: getRenderedText(post.content),
  contentHtml: getRenderedText(post.content),
  url: getWpPostUrl(post),
  wpPostId: post.id,
  sourcePost: post,
});

const KnowledgeSearchPanel = forwardRef<KnowledgeSearchPanelRef, KnowledgeSearchPanelProps>(
  ({ isVisible, onToggle, onKnowledgeAdd, onDiscuss, className = "", hasKnowledgeContext = false }, ref) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const [isMinimized, setIsMinimized] = useState(false);

    // 지식 직접 추가
    const [activeTab, setActiveTab] = useState<"search" | "direct">("search");
    const [directKnowledge, setDirectKnowledge] = useState("");

    // 직접 입력 지식에 대한 상세 정보 상태
    const [directKnowledgeDetail, setDirectKnowledgeDetail] = useState<KnowledgeDetailType | null>(null);

    const userData = useUserDataStore((state) => state.userData);
    const userAccountType = userData?.accountType || "free";

    // 최신 섹션용 데이터 가져오기
    const { data: latestPosts = [], isLoading: isLoadingLatest } = useLatestPosts({
      count: 6,
      enabled: isVisible, // 패널이 열릴 때만 데이터 로드
    });

    // 랜덤 섹션용 데이터 가져오기
    const { data: randomPosts = [], isLoading: isLoadingRandom } = useRandomPosts({
      count: 6,
      enabled: isVisible,
    });

    // WP 포스트 검색 데이터 가져오기
    const {
      data: searchResults,
      isLoading: isSearching,
      error,
    } = usePostSearch({
      query: searchQuery,
      page: 1,
      perPage: 10,
      enabled: searchQuery.length >= 2,
      debounceMs: GC.INTERVALS.SEARCH_DEBOUNCE,
    });

    // 자동완성 훅 사용
    const { data: suggestions = [] } = useSearchSuggestions(searchQuery, {
      enabled: searchQuery.length >= 1 && showSuggestions,
      debounceMs: GC.INTERVALS.SEARCH_DEBOUNCE, // 디바운스 시간
    });

    // 캐싱된 데이터에서 카테고리 데이터 가져오기
    // const { groupedCategories } = useCachedCategories();

    // 최신 섹션용 데이터와 랜덤 섹션용 데이터 중복 체크 후 중복 제거된 데이터 생성
    const uniqueRandomPosts = useMemo(() => {
      if (!latestPosts || !randomPosts) return [];

      // 최신 포스트의 ID들을 Set으로 만들어서 빠른 검색이 가능하도록 함
      const latestPostIds = new Set(latestPosts.map((post: IWpPost) => post.id));

      // 랜덤 포스트에서 최신 포스트와 겹치지 않는 것들만 필터링
      return randomPosts.filter((post: IWpPost) => !latestPostIds.has(post.id));
    }, [latestPosts, randomPosts]);

    // HTML 콘텐츠를 안전하게 자르는 헬퍼 함수
    const truncateHtmlContent = useCallback((htmlContent: string, maxLength: number): string => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, "text/html");

        let currentLength = 0;
        let truncated = false;

        // 재귀적으로 노드를 순회하면서 텍스트 길이 계산 및 자르기
        const processNode = (node: Node): void => {
          if (truncated) return;

          if (node.nodeType === Node.TEXT_NODE) {
            const textContent = node.textContent || "";
            if (currentLength + textContent.length <= maxLength) {
              currentLength += textContent.length;
            } else {
              // 텍스트를 자르고 ... 추가
              const remainingLength = maxLength - currentLength;
              node.textContent = textContent.substring(0, remainingLength) + "...";
              truncated = true;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 자식 노드들을 순회
            const childNodes = Array.from(node.childNodes);
            for (let i = 0; i < childNodes.length; i++) {
              if (truncated) {
                // 남은 자식 노드들 제거
                for (let j = i; j < childNodes.length; j++) {
                  node.removeChild(childNodes[j]);
                }
                break;
              }
              processNode(childNodes[i]);
            }
          }
        };

        processNode(doc.body);
        return doc.body.innerHTML;
      } catch (error) {
        // 에러 발생 시 단순하게 문자열로 자르기 (덜 안전하지만 폴백)
        logger.warn("HTML truncate 실패, 단순 문자열 자르기:", error);
        return htmlContent.substring(0, maxLength) + "...";
      }
    }, []);

    // 콘텐츠 src에 도메인 자동 추가 헬퍼 함수
    const processImageSrc = useCallback(
      (htmlContent: string): string => {
        if (!htmlContent) return htmlContent;

        try {
          // DOMParser를 사용해서 HTML을 안전하게 파싱
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, "text/html");
          const images = doc.querySelectorAll("img");

          // 모든 img 태그를 순회하면서 src 속성 확인
          images.forEach((img) => {
            const src = img.getAttribute("src");
            if (src && src.startsWith("/wp-resource")) {
              // /wp-resource로 시작하는 경우 앞에 도메인 추가
              img.setAttribute("src", `https://allmyuniverse.com${src}`);
            }
          });

          let processedContent = doc.body.innerHTML;

          // free 계정인 경우 500자 제한
          if (userAccountType === "free") {
            const textContent = doc.body.textContent || "";
            if (textContent.length > 500) {
              processedContent = truncateHtmlContent(processedContent, 500);
            }
          }

          return processedContent;
        } catch (error) {
          // DOMParser 실패 시 정규식으로 폴백
          logger.warn("DOMParser 실패, 정규식으로 폴백:", error);
          let processedContent = htmlContent.replace(
            /(<img[^>]+src=["'])\/wp-resource([^"']*["'][^>]*>)/gi,
            "$1https://allmyuniverse.com/wp-resource$2",
          );

          // free 계정인 경우 500자 제한 (폴백 시에도 적용)
          if (userAccountType === "free") {
            // HTML 태그를 제거하고 텍스트 길이 확인
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = processedContent;
            const textContent = tempDiv.textContent || "";
            if (textContent.length > 500) {
              processedContent = truncateHtmlContent(processedContent, 500);
            }
          }

          return processedContent;
        }
      },
      [truncateHtmlContent, userAccountType],
    );

    // 패널이 열릴 때 백그라운드 캐시 업데이트 트리거
    useEffect(() => {
      if (isVisible) {
        // 백그라운드에서 포스트 캐시 업데이트 (비동기, UI 블로킹 없음)
        requestCacheUpdate("posts").catch((error) => {
          logger.warn("백그라운드 캐시 업데이트 실패:", error);
          // 실패해도 기존 캐시로 동작하므로 사용자에게 영향 없음
        });

        logger.log("🔄 지식 검색 패널 열림 - 백그라운드 캐시 업데이트 시작");
      }
    }, [isVisible]);

    // 선택된 포스트 상세 정보
    const { data: postDetail } = usePostDetail({
      postId: selectedPostId || undefined,
      enabled: !!selectedPostId,
    });

    // 검색 입력 핸들러
    const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;

      // 한글 입력 디버깅
      logger.log("🔍 입력된 검색어:", {
        original: inputValue,
        trimmed: inputValue.trim(),
        length: inputValue.length,
        charCodes: [...inputValue].map((char) => char.charCodeAt(0)),
      });

      setSearchQuery(inputValue);
      setShowSuggestions(true);
      setSelectedSuggestionIndex(-1);
    }, []);

    // 포스트 선택 핸들러
    const handlePostSelect = useCallback((postId: number) => {
      setSelectedPostId(postId);
    }, []);

    // 직접 입력 지식 추가 핸들러
    const handleDirectKnowledgeAdd = useCallback(() => {
      if (!directKnowledge.trim()) {
        return; // 내용이 비어있으면 추가하지 않음
      }

      const trimmed = directKnowledge.trim();
      const customKnowledge: KnowledgeDetailType = {
        id: `direct:${Date.now()}`,
        sourceType: "direct",
        sourceLabel: lang({ ko: "직접 입력", en: "Direct input" }),
        title: trimmed.substring(0, 20) + (trimmed.length > 20 ? "..." : ""),
        content: trimmed,
      };

      // 직접 입력한 내용을 detail 레이어로 표시
      setDirectKnowledgeDetail(customKnowledge);
      setSelectedPostId(null); // 기존 선택된 포스트 해제
    }, [directKnowledge]);

    // 직접 입력 지식 추가 확정 핸들러
    const handleConfirmDirectKnowledge = useCallback(() => {
      if (!directKnowledgeDetail) return;

      void onKnowledgeAdd(directKnowledgeDetail);

      // 상태 초기화
      setDirectKnowledgeDetail(null);
      setDirectKnowledge("");
      setActiveTab("search"); // 검색 탭으로 돌아가기
    }, [directKnowledgeDetail, onKnowledgeAdd]);

    // 직접 입력 지식 detail 닫기 핸들러
    const handleCloseDirectDetail = useCallback(() => {
      setDirectKnowledgeDetail(null);
      setIsMinimized(false);
    }, []);

    // 현재 표시할 detail 데이터 (postDetail 또는 directKnowledgeDetail)
    const currentDetail = useMemo<KnowledgeDetailType | null>(() => {
      if (directKnowledgeDetail) return directKnowledgeDetail;
      return postDetail ? toWpKnowledgeDetail(postDetail) : null;
    }, [directKnowledgeDetail, postDetail]);

    // detail 타입 확인
    const isDirectKnowledge = useMemo(() => {
      return currentDetail?.sourceType === "direct";
    }, [currentDetail]);

    // ref로 minimize 메서드 노출
    useImperativeHandle(
      ref,
      () => ({
        minimize: () => {
          setIsMinimized(true);
        },
        maximize: () => {
          setIsMinimized(false);
        },
      }),
      [],
    );

    // 섹션 리스트 렌더링 함수
    const renderKnowledgeSection = (
      posts: IWpPost[],
      isLoading: boolean,
      emptyMessage: { ko: string; en: string },
      title?: { ko: string; en: string },
    ) => (
      <>
        {title && (
          <h4 className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <File className="icon-xxs" />
            <Lang text={title} />
          </h4>
        )}

        <div>
          {isLoading ? (
            <div className="flex flex-col">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 py-3 border-b border-border/60">
                  <div className="h-4 flex-1 rounded bg-muted/40 animate-pulse" />
                </div>
              ))}
            </div>
          ) : posts.length > 0 ? (
            <div className="flex flex-col">
              {posts.map((post: IWpPost) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex justify-between items-center gap-2 py-3 border-b border-border cursor-pointer transition-colors",
                    selectedPostId === post.id ? "text-primary" : "text-foreground hover:text-primary",
                  )}
                  onClick={() => handlePostSelect(post.id)}
                >
                  <h5
                    className="font-medium text-sm line-clamp-1"
                    dangerouslySetInnerHTML={{
                      __html: post.title?.rendered || (typeof post.title === "string" ? post.title : ""),
                    }}
                  />

                  {/* 외부 링크 버튼 */}
                  {(post.link || post.guid?.rendered) && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-xs inline-flex gap-1 border-none bg-transparent p-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation(); // 부모 클릭 이벤트 방지
                        window.open(post.link || post.guid?.rendered, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <ExternalLink size={12} className="m-[2px]" />
                      <Lang text={{ ko: "자세히 보기", en: "View" }} className="sr-only" />
                    </Badge>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground text-sm">
              <Lang text={emptyMessage} />
            </div>
          )}
        </div>
      </>
    );

    // 토론하기
    const handleDiscuss = useCallback(() => {
      // 지식 프롬프트 전달
      if (currentDetail) {
        void onKnowledgeAdd(currentDetail);
      }

      // 입력창 포커스는 부모 컴포넌트에서 처리하도록 콜백 추가 필요
      if (onDiscuss) {
        onDiscuss();
      }
    }, [currentDetail, onKnowledgeAdd, onDiscuss]);

    const handleMinimize = useCallback(() => {
      setIsMinimized(true);
    }, []);

    const handleMaximize = useCallback(() => {
      setIsMinimized(false);
    }, []);

    const handleCloseDetail = useCallback(() => {
      setSelectedPostId(null);
      setIsMinimized(false);
    }, []);

    // 자동완성 선택 핸들러
    const handleSuggestionSelect = useCallback((suggestion: string) => {
      setSearchQuery(suggestion);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }, []);

    // 키보드 네비게이션 핸들러
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || suggestions.length === 0) return;

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedSuggestionIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
            break;
          case "ArrowUp":
            e.preventDefault();
            setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
            break;
          case "Enter":
            e.preventDefault();
            if (selectedSuggestionIndex >= 0) {
              handleSuggestionSelect(suggestions[selectedSuggestionIndex]);
            }
            break;
          case "Escape":
            setShowSuggestions(false);
            setSelectedSuggestionIndex(-1);
            break;
        }
      },
      [showSuggestions, suggestions, selectedSuggestionIndex, handleSuggestionSelect],
    );

    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cn(
              "fixed top-16 left-4 right-4 z-[80]",
              !isMinimized &&
                "bg-background/96 dark:bg-surface-2/96 backdrop-blur-xl rounded-2xl border border-border text-foreground shadow-xl",
              className,
            )}
          >
            <div className={cn("p-4", isMinimized && "w-0 h-0 overflow-hidden opacity-0")}>
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="icon-sm" />
                  <h3 className="font-semibold">
                    <Lang text={{ ko: "대화 주제 찾기", en: "Find a Topic" }} />
                  </h3>
                </div>
                <Button variant="ghost" rounded="full" size="icon-sm" onClick={onToggle}>
                  <X className="icon-sm" />
                </Button>
              </div>

              {/* 탭 네비게이션 */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={activeTab === "search" ? "accent" : "ghost"}
                  size="sm"
                  rounded="full"
                  onClick={() => setActiveTab("search")}
                >
                  <Lang text={{ ko: "주제 검색", en: "Search" }} />
                </Button>
                <Button
                  variant={activeTab === "direct" ? "accent" : "ghost"}
                  size="sm"
                  rounded="full"
                  onClick={() => setActiveTab("direct")}
                >
                  <Lang text={{ ko: "직접 입력", en: "Direct Input" }} />
                </Button>
              </div>

              {/* 검색 모드 */}
              {activeTab === "search" && (
                <div className="relative mb-4">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10"
                  />
                  <Input
                    value={searchQuery}
                    onChange={handleSearch}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={lang({
                      ko: "검색어를 입력하세요 (최소 2글자)",
                      en: "Please enter your search term (at least 2 characters)",
                    })}
                    className="pl-10 bg-surface"
                  />

                  {/* 자동완성 드롭다운 */}
                  <AnimatePresence>
                    {showSuggestions && suggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-1 bg-popover rounded-lg shadow-lg border border-border z-20 max-h-48 overflow-y-auto"
                      >
                        {suggestions.map((suggestion, index) => (
                          <div
                            key={suggestion}
                            className={cn(
                              "px-4 py-2 text-sm cursor-pointer transition-colors",
                              index === selectedSuggestionIndex
                                ? "bg-primary/10 text-primary"
                                : "text-popover-foreground hover:bg-muted/50",
                            )}
                            onMouseDown={() => handleSuggestionSelect(suggestion)}
                            onMouseEnter={() => setSelectedSuggestionIndex(index)}
                          >
                            {suggestion}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* 직접 입력 모드 */}
              {activeTab === "direct" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      <span className="sr-only">
                        <Lang text={{ ko: "지식 내용", en: "Knowledge Content" }} />
                      </span>
                    </label>
                    <textarea
                      value={directKnowledge}
                      onChange={(e) => setDirectKnowledge(e.target.value)}
                      placeholder={lang({
                        ko: "캐릭터와 공유하고 싶은 지식이나 정보를 자유롭게 입력하세요.\n예: 오늘 새로 배운 요리법, 흥미로운 사실, 개인적인 경험 등",
                        en: "Enter knowledge or information you want to share with the character.\nExample: A new recipe you learned today, interesting facts, personal experiences, etc.",
                      })}
                      className="w-full h-32 p-3 bg-input-bg text-foreground placeholder:text-muted-foreground border border-input rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      maxLength={5000}
                    />
                    <div className="flex justify-end items-center mt-1 px-1">
                      <div className="text-xs text-muted-foreground">{directKnowledge.length}/5000</div>
                    </div>
                  </div>

                  <Button onClick={handleDirectKnowledgeAdd} disabled={!directKnowledge.trim()} className="w-full">
                    <Lang text={{ ko: "지식 추가하기", en: "Add Knowledge" }} />
                  </Button>
                </div>
              )}

              {/* 검색 결과 */}
              {activeTab === "search" && (
                <div className="relative">
                  <ScrollArea className="knowledge-search-result max-h-[calc(100vh-30rem)] overflow-y-auto -mr-2 pr-2 scrollbar-ghost">
                    {searchQuery.length >= 2 ? (
                      <>
                        {isSearching && (
                          <div className="text-center py-4 text-muted-foreground">
                            <Lang text={{ ko: "검색 중...", en: "Searching..." }} />
                          </div>
                        )}

                        {error && (
                          <div className="text-center py-4 text-destructive text-sm">
                            <Lang
                              text={{ ko: "검색 중 오류가 발생했습니다.", en: "An error occurred during search." }}
                            />
                          </div>
                        )}

                        {searchResults?.posts && searchResults.posts.length > 0 && (
                          <div className="knowledge-item-container">
                            {searchResults.posts.map((post: IWpPost) => (
                              <motion.div
                                key={post.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={cn(
                                  "flex justify-between items-center gap-2 py-3 cursor-pointer transition-colors border-b border-border",
                                  selectedPostId === post.id ? "text-primary" : "text-foreground hover:text-primary",
                                )}
                                onClick={() => handlePostSelect(post.id)}
                              >
                                <h4
                                  className="font-medium text-sm line-clamp-1"
                                  dangerouslySetInnerHTML={{ __html: post.title.rendered }}
                                />

                                <div className="flex items-center gap-2">
                                  <div className="action-btns flex items-center gap-1">
                                    {/* 외부 링크 버튼 */}
                                    {(post.link || post.guid?.rendered) && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs inline-flex gap-1 border-none bg-transparent p-0 text-muted-foreground hover:text-foreground"
                                        onClick={(e) => {
                                          e.stopPropagation(); // 부모 클릭 이벤트 방지
                                          window.open(
                                            post.link || post.guid?.rendered,
                                            "_blank",
                                            "noopener,noreferrer",
                                          );
                                        }}
                                      >
                                        <ExternalLink size={12} className="m-[2px]" />
                                        <Lang text={{ ko: "자세히 보기", en: "View" }} className="sr-only" />
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* 최근 지식 목록 */}
                        {renderKnowledgeSection(
                          latestPosts,
                          isLoadingLatest,
                          {
                            ko: "최근 지식이 없습니다.",
                            en: "No recent knowledge available.",
                          },
                          { ko: "최근 추천 지식", en: "Recent Knowledge" },
                        )}

                        {/* 추천 지식 목록 */}
                        {renderKnowledgeSection(
                          uniqueRandomPosts,
                          isLoadingRandom,
                          {
                            ko: "추천 지식이 없습니다.",
                            en: "No recommended knowledge available.",
                          },
                          { ko: "추천 지식", en: "Recommended Knowledge" },
                        )}
                      </>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* 선택된 포스트 상세 정보 */}
            {currentDetail && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "post-detail-layer fixed z-10",
                  isMinimized
                    ? "top-4 right-4 w-8 h-8" // 최소화된 상태
                    : "-inset-2 flex flex-col justify-between h-[calc(100vh-15rem)]", // 일반 상태
                )}
              >
                {isMinimized ? (
                  // 최소화된 상태의 UI
                  <div
                    className="w-full h-full bg-surface-2 border border-border rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:shadow-xl transition-shadow"
                    onClick={handleMaximize}
                  >
                    <BookOpen size={16} className="text-foreground" />
                  </div>
                ) : (
                  // 일반 상태의 UI
                  <div className="bg-card rounded-xl border border-border text-card-foreground shadow-xl">
                    <div className="post-detail-body flex flex-col p-4">
                      <h4
                        className="text-lg font-semibold mb-2"
                        dangerouslySetInnerHTML={{ __html: currentDetail.title }}
                      />
                      <div
                        className="text-sm text-secondary-text mb-3 overflow-y-auto max-h-[calc(100vh-25rem)]"
                        dangerouslySetInnerHTML={{
                          __html: isDirectKnowledge
                            ? escapeHtml(currentDetail.content).replace(/\n/g, "<br/>") // 직접 입력 지식은 줄바꿈 처리
                            : processImageSrc(currentDetail.contentHtml || currentDetail.content), // 포스트는 이미지 처리
                        }}
                      />
                    </div>

                    {/* 하단 버튼 영역 */}
                    <div className="flex gap-2 p-4 pt-0">
                      <Button
                        variant="neutral"
                        className={cn(
                          "inline-flex justify-center items-center gap-1",
                          userAccountType !== "free" ? "w-12 p-0" : "flex-1",
                        )}
                        onClick={isDirectKnowledge ? handleCloseDirectDetail : handleCloseDetail}
                      >
                        <X size={16} />
                        <span className={cn(userAccountType !== "free" && "sr-only")}>
                          <Lang text={{ ko: "닫기", en: "Close" }} />
                        </span>
                      </Button>

                      {/* 외부 링크 버튼 - 직접 입력 지식이 아니고 링크가 있는 경우에만 표시 */}
                      {!isDirectKnowledge && currentDetail.url && (
                        <Button
                          onClick={() => {
                            window.open(currentDetail.url, "_blank", "noopener,noreferrer");
                          }}
                          variant="neutral"
                          className={cn(
                            "inline-flex justify-center items-center gap-1",
                            userAccountType !== "free" ? "w-12 p-0" : "flex-1",
                          )}
                        >
                          <ExternalLink size={16} />
                          <span className={cn(userAccountType !== "free" && "sr-only")}>
                            <Lang text={{ ko: "원문 보기", en: "View Original" }} />
                          </span>
                        </Button>
                      )}

                      {userAccountType !== "free" && (
                        <>
                          <Button
                            variant="secondary"
                            className="inline-flex justify-center items-center w-12 p-0"
                            onClick={handleMinimize}
                          >
                            <Minimize2 size={16} />
                            <span className="sr-only">
                              <Lang text={{ ko: "최소화", en: "Minimize" }} />
                            </span>
                          </Button>

                          {isDirectKnowledge ? (
                            // 직접 입력 지식용 버튼
                            <Button className="flex-1" onClick={handleConfirmDirectKnowledge}>
                              <MessageSquare size={16} className="mr-1" />
                              <Lang text={{ ko: "지식 추가", en: "Add Knowledge" }} />
                            </Button>
                          ) : (
                            // 일반 포스트용 버튼
                            <Button className="flex-1 gap-1" disabled={hasKnowledgeContext} onClick={handleDiscuss}>
                              <MessageSquare size={16} className="mr-1" />
                              <Lang text={{ ko: "토론하기", en: "Discuss" }} />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);
KnowledgeSearchPanel.displayName = "KnowledgeSearchPanel";

export default KnowledgeSearchPanel;
