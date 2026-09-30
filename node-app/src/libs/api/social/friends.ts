"use client";

import fetchClient from "libs/api/fetchClient";

export type FriendshipStatus = "pending" | "accepted" | "declined" | "cancelled" | "removed" | "blocked";
export type FriendshipDirection = "incoming" | "outgoing";

export type FriendshipItem = {
  friendshipId: string;
  actorId: string;
  displayName: string;
  emailHint: string;
  profileImageUrl?: string;
  requesterActorId: string;
  recipientActorId: string;
  status: FriendshipStatus;
  direction: FriendshipDirection;
  capabilities?: {
    giftTutors?: boolean;
    progressShare?: boolean;
    presence?: boolean;
    directChat?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type FriendUserSearchItem = {
  actorId: string;
  displayName: string;
  emailHint: string;
  profileImageUrl?: string;
  friendship?: FriendshipItem | null;
};

type Envelope<T> = { success?: boolean; data?: T; error?: string };

function unwrap<T>(body: Envelope<T>) {
  if (!body?.success) throw new Error(body?.error || "friends_api_failed");
  return body.data as T;
}

export async function searchFriends(q: string, options?: { deep?: boolean }) {
  const response = await fetchClient.get<Envelope<FriendUserSearchItem[]>>("/friends", {
    params: { q, ...(options?.deep ? { deep: "1" } : {}) },
    responseType: "auto",
  });
  return unwrap<FriendUserSearchItem[]>(response.data);
}

export async function listFriends() {
  const response = await fetchClient.get<Envelope<FriendshipItem[]>>("/friends", { responseType: "auto" });
  return unwrap<FriendshipItem[]>(response.data);
}

export async function requestFriend(actorId: string) {
  const response = await fetchClient.post<Envelope<FriendshipItem>>(
    "/friends",
    { action: "request", actorId },
    { responseType: "auto" },
  );
  return unwrap<FriendshipItem>(response.data);
}

export async function acceptFriend(friendshipId: string) {
  const response = await fetchClient.post<Envelope<FriendshipItem>>(
    "/friends",
    { action: "accept", friendshipId },
    { responseType: "auto" },
  );
  return unwrap<FriendshipItem>(response.data);
}

export async function declineFriend(friendshipId: string) {
  const response = await fetchClient.post<Envelope<FriendshipItem>>(
    "/friends",
    { action: "decline", friendshipId },
    { responseType: "auto" },
  );
  return unwrap<FriendshipItem>(response.data);
}
