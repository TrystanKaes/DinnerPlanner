"use client";

import { useMemo } from "react";
import { api } from "~/trpc/react";

/**
 * Given an array of Clerk user IDs, returns a map of { userId: displayName }.
 * Uses tRPC query with automatic caching — same IDs won't re-fetch.
 *
 * Usage:
 *   const names = useUserNames(["user_abc123", "user_def456"]);
 *   names["user_abc123"] // "John Doe"
 */
export function useUserNames(userIds: string[]): Record<string, string> {
  // Deduplicate and sort for stable query keys
  const dedupedIds = useMemo(() => {
    const unique = [...new Set(userIds.filter(Boolean))];
    unique.sort();
    return unique;
  }, [userIds]);

  const { data } = api.user.resolveNames.useQuery(
    { userIds: dedupedIds },
    {
      enabled: dedupedIds.length > 0,
      staleTime: 5 * 60 * 1000, // cache for 5 minutes
    },
  );

  return data ?? {};
}
