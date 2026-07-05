import { QueryClient } from '@tanstack/react-query'

/**
 * Module-level so non-hook code (e.g. logAction) can invalidate queries.
 * Provided to the app in main.tsx.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
