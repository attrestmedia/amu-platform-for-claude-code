"use client";

import { useState, useMemo, useEffect } from "react";
import { CredentialPanel } from "./CredentialPanel";
import { useUniverseData } from "hooks/game/core";
import { Button, Input, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, dialog } from "@amu-labs/ui";
import { toast } from "sonner";
import { logger } from "utils/log";
import { GitBranch, GitCommit } from "lucide-react";
import { getGitlabCommits } from "libs/api/thirdparty/gitlab/gitlabConnector";
import { Lang } from "components/module/i18n";
import { extractApiErrorMessage, pickArray, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

type GitlabCommitView = {
  id: string;
  shortId: string;
  title: string;
  message: string;
  authorName: string;
  authoredAt: string;
  webUrl?: string;
  branch?: string;
};

type Props = {
  onApply?: (commits: GitlabCommitView[]) => void;
  panelId?: string;
};

type ProjectOption = {
  key: string;
  projectId: string;
  defaultBranch?: string;
};

export default function GitlabCommitImporter({ onApply, panelId }: Props) {
  const { universeInfo } = useUniverseData({ enableStageQuery: false });
  const universeId = universeInfo?.data?.id;

  const [credReady, setCredReady] = useState(false);
  const [branch, setBranch] = useState<string>(""); // 빈 값이면 defaultBranch
  const [days, setDays] = useState<string>("1"); // 최근 1일 기본
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [commits, setCommits] = useState<GitlabCommitView[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // Gitlab 커밋 선택
  const [previewOpen, setPreviewOpen] = useState(false);
  const [formattedContent, setFormattedContent] = useState("");

  // 프로젝트 목록 + 선택된 projectKey
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectKey, setProjectKey] = useState<string>("");

  // 패널별로 다른 localStorage 키 사용 (universe + panelId)
  const storageKey = universeId ? `amu:gitlabImporter:${universeId}${panelId ? `:${panelId}` : ""}` : null;

  const summary = useMemo(() => {
    if (!commits.length) return "커밋 없음";

    const parts: string[] = [`${commits.length}개 커밋`];
    if (projectKey) parts.push(`프로젝트: ${projectKey}`);
    if (branch) parts.push(`브랜치: ${branch}`);
    return parts.join(" · ");
  }, [commits.length, projectKey, branch]);

  const run = async () => {
    if (!universeId) {
      void dialog.alert("유니버스를 먼저 선택하세요.");
      return;
    }

    // projects가 정의되어 있으면 projectKey도 선택하도록 강제
    if (projects.length > 0 && !projectKey) {
      void dialog.alert("조회할 GitLab 프로젝트를 먼저 선택하세요.");
      return;
    }

    try {
      setLoading(true);
      const daysNum = Number(days || "0") || undefined;
      const resp = await getGitlabCommits({
        universeId,
        projectKey: projectKey || undefined,
        branch: branch || undefined,
        days: daysNum,
        search: search || undefined,
        perPage: 50,
      });

      const list: GitlabCommitView[] = resp.commits.map((c) => ({
        id: c.id,
        shortId: c.shortId,
        title: c.title,
        message: c.message,
        authorName: c.authorName,
        authoredAt: c.authoredAt,
        webUrl: c.webUrl,
        branch: c.branch || resp.branch,
      }));

      setCommits(list);
      setSelectedIds(new Set());
      setOpen(true);
      logger.log("[GitLab] commits fetched:", list.length);

      // 성공 시 마지막 설정 저장
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            projectKey: projectKey || undefined,
            branch,
            days,
            search,
          }),
        );
      }
    } catch (e) {
      logger.error("[GitLab] fetch error:", e);
      void dialog.alert({ variant: "danger", message: extractApiErrorMessage(e, "커밋 가져오기에 실패했습니다.") });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const handleApply = () => {
    if (!selectedIds.size) {
      void dialog.alert("선택된 커밋이 없습니다.");
      return;
    }

    const target = commits.filter((c) => selectedIds.has(c.id));

    // 포맷팅된 내용 생성
    const formatted = formatCommitsForPreview(target);
    setFormattedContent(formatted);

    // 미리보기 Dialog 열기
    setPreviewOpen(true);

    // 기존 Dialog는 닫기
    setOpen(false);
  };

  // 미리보기에서 최종 확인 시 부모 컴포넌트에 전달
  const handleConfirmApply = () => {
    const target = commits.filter((c) => selectedIds.has(c.id));
    onApply?.(target);
    setPreviewOpen(false);
    setSelectedIds(new Set());
  };

  // CredentialPanel에서 전달받은 extras를 기반으로 projects/state 세팅
  const handleExtrasChange = (extras?: UnknownRecord) => {
    try {
      const rawProjects = pickArray(extras?.projects);
      const list: ProjectOption[] = rawProjects
        .map((entry) => {
          const p = toUnknownRecord(entry);
          return {
            key: p.key ? String(p.key) : "",
            projectId: p.projectId ? String(p.projectId) : "",
            defaultBranch: p.defaultBranch ? String(p.defaultBranch) : undefined,
          };
        })
        .filter((p) => p.key && p.projectId);

      setProjects(list);

      // 아직 선택된 projectKey가 없으면 기본값 적용
      if (!projectKey) {
        const defaultKey =
          (typeof extras?.defaultProjectKey === "string" && extras.defaultProjectKey.trim()) || (list[0]?.key ?? "");
        if (defaultKey) {
          setProjectKey(defaultKey);
          // branch가 비어 있고 프로젝트 기본 브랜치가 있으면 같이 세팅
          const matched = list.find((p) => p.key === defaultKey);
          if (!branch && matched?.defaultBranch) {
            setBranch(matched.defaultBranch);
          }
        }
      }
    } catch (e) {
      logger.error("[GitLab] extras 파싱 실패:", e);
    }
  };

  // 선택된 커밋들을 마크다운 형식으로 포맷팅
  const formatCommitsForPreview = (selectedCommits: GitlabCommitView[]): string => {
    if (!selectedCommits.length) return "";

    // 날짜별로 그룹핑
    const byDate = selectedCommits.reduce(
      (acc, commit) => {
        const date = new Date(commit.authoredAt).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        if (!acc[date]) acc[date] = [];
        acc[date].push(commit);
        return acc;
      },
      {} as Record<string, GitlabCommitView[]>,
    );

    // 마크다운 형식으로 변환
    let content = `# 개발 로그\n\n`;

    if (projectKey) {
      content += `**프로젝트**: ${projectKey}\n`;
    }
    if (branch) {
      content += `**브랜치**: ${branch}\n`;
    }
    content += `**커밋 수**: ${selectedCommits.length}개\n\n`;
    content += `---\n\n`;

    Object.entries(byDate).forEach(([date, commits]) => {
      content += `## 📅 ${date}\n\n`;

      commits.forEach((commit) => {
        content += `### ${commit.title}\n`;
        content += `- **커밋**: \`${commit.shortId}\`\n`;
        content += `- **작성자**: ${commit.authorName}\n`;
        content += `- **시간**: ${new Date(commit.authoredAt).toLocaleTimeString("ko-KR")}\n`;

        if (commit.message !== commit.title) {
          const detailMessage = commit.message
            .replace(commit.title, "")
            .trim()
            .split("\n")
            .filter((line) => line.trim())
            .join("\n");

          if (detailMessage) {
            content += `\n${detailMessage}\n`;
          }
        }

        if (commit.webUrl) {
          content += `\n[GitLab에서 보기](${commit.webUrl})\n`;
        }

        content += `\n---\n\n`;
      });
    });

    return content;
  };

  // 포맷팅된 내용을 클립보드에 복사
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formattedContent);
      toast.success("클립보드에 복사되었습니다!");
    } catch (error) {
      logger.error("[GitLab] 클립보드 복사 실패:", error);
      void dialog.alert({ variant: "danger", message: "복사에 실패했습니다. 브라우저 권한을 확인해주세요." });
    }
  };

  // universeId / panelId 기준으로 마지막 설정 복원
  useEffect(function restoreSavedConfigFromLocalStorage() {
    if (!universeId || !storageKey) return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const saved = JSON.parse(raw) as {
        projectKey?: string;
        branch?: string;
        days?: string;
        search?: string;
      };

      // localStorage(외부 시스템)에서 복원한 값으로 폼 state를 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved.projectKey) setProjectKey(saved.projectKey);
      if (typeof saved.branch === "string") setBranch(saved.branch);
      if (typeof saved.days === "string") setDays(saved.days);
      if (typeof saved.search === "string") setSearch(saved.search);
    } catch (e) {
      logger.error("[GitLab] 커밋 조회 설정 불러오기 실패:", e);
    }
  }, [universeId, storageKey]);

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
      {/* 자격증명 패널 */}
      {universeId && (
        <div className="mb-3">
          <CredentialPanel
            universeId={universeId}
            provider="gitlab"
            onReadyChange={setCredReady}
            onExtrasChange={handleExtrasChange}
          />
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <GitCommit className="text-slate-700" size={18} />
        <span className="font-semibold text-slate-800">GitLab 커밋 가져오기</span>
      </div>

      <p className="text-xs text-slate-600 mb-4">
        저장된 GitLab 자격증명(프로젝트/토큰)을 사용해 선택한 기간의 커밋 내역을 조회합니다. 이후 커밋 메시지를 기반으로
        개발/일상 공유용 콘텐츠를 자동 생성하는 데 활용할 수 있습니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        {/* 프로젝트 선택 */}
        <div>
          <label className="block text-sm mb-1">프로젝트</label>
          {projects.length > 0 ? (
            <Select value={projectKey} onValueChange={(v) => setProjectKey(v as string)}>
              <SelectTrigger>
                <SelectValue placeholder="프로젝트 선택" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.key}{" "}
                    <span className="text-xxs text-slate-500">
                      ({p.projectId}
                      {p.defaultBranch ? ` · ${p.defaultBranch}` : ""})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-xxs text-slate-500 bg-white border border-dashed rounded px-2 py-2">
              GitLab 자격증명에서 projects 목록을 먼저 설정하세요.
            </div>
          )}
        </div>

        {/* 기존 branch / days / search 그대로 유지, 컬럼 위치만 변경 */}
        <div>
          <label className="block text-sm mb-1">브랜치 (선택)</label>
          <div className="flex items-center gap-1">
            <GitBranch size={14} className="text-slate-500" />
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="비우면 defaultBranch 사용" />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">최근 N일</label>
          <Input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="1"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">검색어 (옵션)</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="커밋 메시지 내 검색어" />
        </div>
      </div>

      <Button
        size="sm"
        onClick={run}
        disabled={loading || !credReady || !universeId}
        className="mt-1"
        title={!credReady ? "먼저 GitLab 자격증명을 저장하세요" : undefined}
      >
        {loading ? "가져오는 중..." : "커밋 조회"}
      </Button>

      {loading && (
        <div className="mt-3 p-3 bg-white border rounded text-center">
          <Preloader variant="spin" size="sm" text="GitLab에서 커밋을 가져오는 중..." />
        </div>
      )}

      {/* 미리보기 다이얼로그 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>GitLab 커밋 미리보기 ({summary})</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-3 max-h-[calc(100vh-20rem)] overflow-y-auto">
              {commits.map((c) => {
                const isSelected = selectedIds.has(c.id);

                return (
                  <div
                    key={c.id}
                    className={
                      "border rounded-lg p-3 bg-slate-50 cursor-pointer transition-colors " +
                      (isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200")
                    }
                    onClick={() => toggleSelect(c.id)} // 카드 전체를 클릭해도 토글되게
                  >
                    <div className="flex justify-between items-center text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation(); // 카드 클릭 이벤트와 중첩 방지
                            toggleSelect(c.id);
                          }}
                        />
                        <span className="font-mono text-slate-700">{c.shortId}</span>
                      </div>

                      {c.branch && (
                        <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded bg-slate-200 text-xxs">
                          <GitBranch size={12} /> {c.branch}
                        </span>
                      )}
                    </div>

                    <div className="font-semibold text-sm mb-1">{c.title}</div>
                    <div className="text-xs text-slate-600 whitespace-pre-line">{c.message}</div>

                    <div className="mt-2 text-xxs text-slate-500 flex justify-between">
                      <span>
                        {c.authorName} · {new Date(c.authoredAt).toLocaleString()}
                      </span>
                      {c.webUrl && (
                        <a
                          href={c.webUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 text-slate-600"
                        >
                          GitLab에서 보기
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-3 border-t">
              {onApply && (
                <Button className="flex-1" onClick={handleApply} disabled={!selectedIds.size}>
                  {selectedIds.size}개 커밋 선택
                </Button>
              )}
              <Button variant="outline" onClick={() => setOpen(false)}>
                닫기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 미리보기 Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCommit className="text-purple-600" size={20} />
              <Lang text={{ ko: "개발 로그 미리보기", en: "Development Log Preview" }} />
              <span className="text-sm font-normal text-slate-500">
                ({selectedIds.size}
                <Lang text={{ ko: "개 커밋", en: " commits" }} />)
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* 스크롤 가능한 내용 영역 */}
          <div className="flex-1 overflow-y-auto border rounded-lg bg-slate-50 p-4 max-h-[calc(100vh-20rem)]">
            <pre className="text-sm leading-relaxed whitespace-pre-wrap font-mono text-slate-800">
              {formattedContent}
            </pre>
          </div>

          {/* 하단 버튼 영역 */}
          <div className="flex gap-2 pt-3 border-t">
            <Button variant="outline" onClick={handleCopyToClipboard} disabled={!formattedContent}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <Lang text={{ ko: "복사하기", en: "Copy" }} />
            </Button>

            {onApply && (
              <Button onClick={handleConfirmApply} className="flex-1">
                <Lang
                  text={{
                    ko: "확인",
                    en: "OK",
                  }}
                />
              </Button>
            )}

            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              <Lang text={{ ko: "닫기", en: "Close" }} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
