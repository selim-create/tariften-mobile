import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMemberBlocks } from '../lib/member-blocks';
import { filterBlockedComments, filterBlockedRecipes, recipeAuthorId } from '../lib/report-block-api';

/**
 * Local hiding of blocked members (Core 1.0.67). Lists are often served from
 * token-less caches, so every recipe list and comment list runs through this.
 * Guests get pass-through helpers and nothing is fetched.
 */
export function useBlockFilter() {
  const { user, token } = useAuth();
  const memberToken = user && token ? token : null;
  const blocks = useMemberBlocks(memberToken, user?.id ?? null);
  return useMemo(() => ({
    blocks,
    blockedIds: blocks.ids,
    listReady: blocks.status === 'ready',
    isBlocked: (authorId: number | null | undefined) => authorId != null && blocks.ids.has(Number(authorId)),
    isRecipeHidden: (recipe: unknown) => {
      const id = recipeAuthorId(recipe);
      return id !== null && blocks.ids.has(id);
    },
    visibleRecipes: <T,>(recipes: readonly T[] | null | undefined): T[] => filterBlockedRecipes(recipes, blocks.ids),
    visibleComments: <T extends { id: number }>(comments: readonly T[] | null | undefined): T[] =>
      filterBlockedComments(comments, blocks.ids, blocks.hiddenComments),
  }), [blocks]);
}
