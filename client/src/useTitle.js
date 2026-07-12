import { useEffect } from 'react'

const SITE = 'SquareSZN'
const DEFAULT_TITLE = `${SITE} — NFL Squares Pools with Live Scores`

// Per-page titles keep SPA navigation friendly to search engines and tabs.
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : DEFAULT_TITLE
    return () => { document.title = DEFAULT_TITLE }
  }, [title])
}
