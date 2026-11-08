import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { handleStaleChunkError } from "./lib/reload-stale-chunk";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultOnCatch: (error) => {
      handleStaleChunkError(error);
    },
  });

  return router;
};
