"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import { BottomSheetDialog, Button, Input, Preloader, Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";
import { AvatarThumbnail } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import {
  acceptFriend,
  declineFriend,
  listFriends,
  requestFriend,
  searchFriends,
  type FriendshipItem,
  type FriendUserSearchItem,
} from "libs/api/social/friends";
import { cn } from "utils/common";
import { Check, ChevronRight, Search, UserPlus, Users, X } from "lucide-react";
import { logger } from "utils/log";

type FriendsPanelProps = {
  open?: boolean;
  hideTrigger?: boolean;
  triggerClassName?: string;
  triggerVariant?: ComponentProps<typeof Button>["variant"];
  triggerSize?: ComponentProps<typeof Button>["size"];
  triggerContent?: ReactNode;
  onOpenChange?: (open: boolean) => void;
};

function friendLabel(item: Pick<FriendshipItem | FriendUserSearchItem, "displayName" | "emailHint">) {
  return item.displayName || item.emailHint || lang({ ko: "사용자", en: "User" });
}

function sortFriends(rows: FriendshipItem[]) {
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

function FriendAvatar({
  item,
}: {
  item: Pick<FriendshipItem | FriendUserSearchItem, "displayName" | "emailHint" | "profileImageUrl">;
}) {
  if (item.profileImageUrl) {
    return (
      <AvatarThumbnail
        src={item.profileImageUrl}
        alt={friendLabel(item)}
        size="sm"
        className="shrink-0 border-border"
      />
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
      <Users className="h-4 w-4" />
    </span>
  );
}

export function FriendsPanel({
  open: controlledOpen,
  hideTrigger = false,
  triggerClassName,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerContent,
  onOpenChange,
}: FriendsPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [tab, setTab] = useState("friends");
  const [query, setQuery] = useState("");
  const [friends, setFriends] = useState<FriendshipItem[]>([]);
  const [results, setResults] = useState<FriendUserSearchItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [busyId, setBusyId] = useState("");

  const incomingRequests = useMemo(
    () => friends.filter((item) => item.status === "pending" && item.direction === "incoming"),
    [friends],
  );
  const acceptedFriends = useMemo(() => friends.filter((item) => item.status === "accepted"), [friends]);

  const setPanelOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const resetSearchState = useCallback(() => {
    setResults([]);
    setHasSearched(false);
  }, []);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      setTab(nextTab);
      if (nextTab === "search") resetSearchState();
    },
    [resetSearchState],
  );

  const handleSearchQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      resetSearchState();
    },
    [resetSearchState],
  );

  const refreshFriends = useCallback(async () => {
    setLoadingFriends(true);
    try {
      setFriends(sortFriends(await listFriends()));
    } catch (error) {
      logger.error("[FriendsPanel] listFriends 실패:", error);
      toast.error(lang({ ko: "친구 목록을 불러오지 못했습니다.", en: "Could not load friends." }));
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void refreshFriends();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, refreshFriends]);

  const executeSearch = useCallback(async () => {
    const q = query.trim();
    if (!open || tab !== "search" || q.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    try {
      setResults(await searchFriends(q, { deep: true }));
    } catch (error) {
      logger.error("[FriendsPanel] searchFriends 실패:", error);
      setResults([]);
      setHasSearched(false);
      toast.error(lang({ ko: "친구 검색에 실패했습니다.", en: "Friend search failed." }));
    } finally {
      setSearching(false);
    }
  }, [open, query, tab]);

  const handleRequest = async (actorId: string) => {
    setBusyId(actorId);
    try {
      await requestFriend(actorId);
      toast.success(lang({ ko: "친구 요청을 보냈습니다.", en: "Friend request sent." }));
      await refreshFriends();
      const q = query.trim();
      if (q.length >= 2 && hasSearched) setResults(await searchFriends(q, { deep: true }));
    } catch (error) {
      logger.error("[FriendsPanel] requestFriend 실패:", error);
      toast.error(lang({ ko: "친구 요청에 실패했습니다.", en: "Friend request failed." }));
    } finally {
      setBusyId("");
    }
  };

  const handleAccept = async (friendshipId: string) => {
    setBusyId(friendshipId);
    try {
      await acceptFriend(friendshipId);
      toast.success(lang({ ko: "친구 요청을 승낙했습니다.", en: "Friend request accepted." }));
      await refreshFriends();
    } catch (error) {
      logger.error("[FriendsPanel] acceptFriend 실패:", error);
      toast.error(lang({ ko: "친구 요청 승낙에 실패했습니다.", en: "Could not accept friend request." }));
    } finally {
      setBusyId("");
    }
  };

  const handleDecline = async (friendshipId: string) => {
    setBusyId(friendshipId);
    try {
      await declineFriend(friendshipId);
      toast.success(lang({ ko: "친구 요청을 거절했습니다.", en: "Friend request declined." }));
      await refreshFriends();
    } catch (error) {
      logger.error("[FriendsPanel] declineFriend 실패:", error);
      toast.error(lang({ ko: "친구 요청 거절에 실패했습니다.", en: "Could not decline friend request." }));
    } finally {
      setBusyId("");
    }
  };

  const renderFriendRow = (item: FriendshipItem, mode: "friend" | "request") => (
    <div
      key={item.friendshipId}
      className="flex min-h-14 items-center justify-between gap-3 border-b border-border/60 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <FriendAvatar item={item} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-primary-text">{friendLabel(item)}</p>
          {item.emailHint ? <p className="truncate text-xs text-secondary-text">{item.emailHint}</p> : null}
        </div>
      </div>
      {mode === "request" ? (
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => void handleAccept(item.friendshipId)}
            disabled={busyId === item.friendshipId}
            aria-label={lang({ ko: "친구 요청 승낙", en: "Accept friend request" })}
          >
            <Check className="icon-xs text-secondary" />
          </Button>
          <Button
            size="icon-sm"
            variant="outlineDestructive"
            onClick={() => void handleDecline(item.friendshipId)}
            disabled={busyId === item.friendshipId}
            aria-label={lang({ ko: "친구 요청 거절", en: "Decline friend request" })}
          >
            <X className="icon-xs text-danger" />
          </Button>
        </div>
      ) : (
        <span className="shrink-0 rounded-full bg-secondary/10 px-2 py-1 text-xxs font-semibold text-secondary">
          <Lang text={{ ko: "친구", en: "Friend" }} />
        </span>
      )}
    </div>
  );

  const renderSearchRow = (item: FriendUserSearchItem) => {
    const relationship = item.friendship;
    const disabled =
      relationship?.status === "pending" || relationship?.status === "accepted" || busyId === item.actorId;
    const label =
      relationship?.status === "accepted"
        ? { ko: "친구", en: "Friend" }
        : relationship?.status === "pending"
          ? relationship.direction === "incoming"
            ? { ko: "요청 받음", en: "Requested" }
            : { ko: "요청 보냄", en: "Sent" }
          : { ko: "친구 요청", en: "Request" };

    return (
      <div
        key={item.actorId}
        className="flex min-h-14 items-center justify-between gap-3 border-b border-border/60 py-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FriendAvatar item={item} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary-text">{friendLabel(item)}</p>
            {item.emailHint ? <p className="truncate text-xs text-secondary-text">{item.emailHint}</p> : null}
          </div>
        </div>
        <Button size="xs" variant="outline" disabled={disabled} onClick={() => void handleRequest(item.actorId)}>
          <UserPlus className="icon-xs" />
          <Lang text={label} />
        </Button>
      </div>
    );
  };

  return (
    <>
      {!hideTrigger ? (
        <Button
          size={triggerSize}
          variant={triggerVariant}
          className={cn("gap-2", triggerClassName)}
          onClick={() => setPanelOpen(true)}
        >
          {triggerContent || (
            <>
              <Users className="h-4 w-4" />
              <Lang text={{ ko: "친구", en: "Friends" }} />
            </>
          )}
        </Button>
      ) : null}

      <BottomSheetDialog
        open={open}
        onClose={() => setPanelOpen(false)}
        title={lang({ ko: "친구", en: "Friends" })}
        rootClassName="!z-[95]"
        panelClassName="max-w-xl"
        bodyClassName="p-4"
      >
        <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="w-full" scrollable>
            <TabsTrigger value="friends">
              <Lang text={{ ko: "친구", en: "Friends" }} />
            </TabsTrigger>
            <TabsTrigger value="requests">
              <Lang text={{ ko: "요청", en: "Requests" }} />
              {incomingRequests.length ? <span className="ml-1 text-xs">({incomingRequests.length})</span> : null}
            </TabsTrigger>
            <TabsTrigger value="search">
              <Lang text={{ ko: "찾기", en: "Search" }} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="mt-4">
            {loadingFriends ? (
              <div className="flex justify-center py-10">
                <Preloader variant="spin" />
              </div>
            ) : acceptedFriends.length ? (
              <div>{acceptedFriends.map((item) => renderFriendRow(item, "friend"))}</div>
            ) : (
              <div className="py-10 text-center text-sm text-secondary-text">
                <Lang text={{ ko: "등록된 친구가 없습니다.", en: "No friends yet." }} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            {loadingFriends ? (
              <div className="flex justify-center py-10">
                <Preloader variant="spin" />
              </div>
            ) : incomingRequests.length ? (
              <div>{incomingRequests.map((item) => renderFriendRow(item, "request"))}</div>
            ) : (
              <div className="py-10 text-center text-sm text-secondary-text">
                <Lang text={{ ko: "받은 친구 요청이 없습니다.", en: "No friend requests." }} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="search" className="mt-4">
            <Input
              value={query}
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void executeSearch();
              }}
              placeholder={lang({ ko: "이름 또는 이메일로 찾으세요.", en: "Find by name or email." })}
              after={
                <Button
                  variant="blank"
                  size="icon-md"
                  disabled={searching || query.trim().length < 2}
                  onClick={() => void executeSearch()}
                >
                  <Search className="icon-xs" />
                  <Lang text={{ ko: "검색", en: "Search" }} className="sr-only" />
                </Button>
              }
            />
            {searching ? (
              <div className="flex justify-center py-10">
                <Preloader variant="spin" />
              </div>
            ) : results.length ? (
              <div className="mt-3">{results.map(renderSearchRow)}</div>
            ) : hasSearched ? (
              <div className="py-10 text-center text-sm text-secondary-text">
                <Lang text={{ ko: "검색 결과가 없습니다.", en: "No results." }} />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </BottomSheetDialog>
    </>
  );
}

const FRIENDS_MENU_ROW_CLASS =
  "w-full px-4 py-3 flex items-center justify-between text-primary-text hover:bg-muted/60 transition-colors";

function friendsMenuRowContent() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Users className="w-4 h-4 text-secondary-text" />
        <span className="text-sm font-medium">
          <Lang text={{ ko: "친구", en: "Friends" }} />
        </span>
      </div>
      <ChevronRight className="w-4 h-4 text-secondary-text/70" />
    </>
  );
}

export function FriendsMenuRow({
  onOpenChange,
  onClick,
}: {
  onOpenChange?: (open: boolean) => void;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <Button variant="blank" className={FRIENDS_MENU_ROW_CLASS} onClick={onClick}>
        {friendsMenuRowContent()}
      </Button>
    );
  }

  return (
    <FriendsPanel
      triggerVariant="blank"
      triggerClassName={FRIENDS_MENU_ROW_CLASS}
      onOpenChange={onOpenChange}
      triggerContent={friendsMenuRowContent()}
    />
  );
}
