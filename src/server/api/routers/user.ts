import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const userRouter = createTRPCRouter({
  /**
   * Resolve an array of Clerk user IDs to display names.
   * Returns a map of { userId: displayName }.
   */
  resolveNames: protectedProcedure
    .input(z.object({ userIds: z.array(z.string()).max(50) }))
    .query(async ({ input }) => {
      if (input.userIds.length === 0) return {};

      const clerk = await clerkClient();
      const results: Record<string, string> = {};

      // Fetch users in parallel (Clerk supports up to 100 per call)
      const users = await clerk.users.getUserList({
        userId: input.userIds,
        limit: 50,
      });

      for (const user of users.data) {
        const name =
          user.fullName ??
          user.firstName ??
          user.username ??
          user.emailAddresses[0]?.emailAddress ??
          user.id.slice(0, 8);
        results[user.id] = name;
      }

      return results;
    }),
});
