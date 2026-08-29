import { useEffect, useState } from 'react'

const DISMISS_KEY = 'fst-install-banner-dismissed'

// iOS's own share glyph (box with an up arrow) so the steps are recognizable
const ShareGlyph = () => (
  <svg
    className="share-glyph"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 15V3" />
    <path d="M8.5 6.5 12 3l3.5 3.5" />
    <path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 10H17" />
  </svg>
)

// Only iPhones get the banner: Android has a native install prompt, and on
// iPad the browser chrome moves around too much for one set of instructions.
function detectBrowser() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (!/iPhone|iPod/.test(ua)) return null

  // Already running from the Home Screen
  const standalone =
    window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  if (standalone) return null

  if (/CriOS/i.test(ua)) return 'chrome'
  // Other iOS browsers (Firefox, Edge, in-app webviews) hide the share
  // button in different places — better no banner than wrong instructions
  if (/FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram/i.test(ua)) return null
  if (/Safari/i.test(ua)) return 'safari'
  return null
}

function InstallBanner() {
  const [browser, setBrowser] = useState(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return
    } catch {
      // Private mode can block storage — still fine to show the banner
    }
    setBrowser(detectBrowser())
  }, [])

  if (!browser) return null

  const dismiss = () => {
    setBrowser(null)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Nothing to do — the banner just reappears next visit
    }
  }

  return (
    <div className="install-banner" role="dialog" aria-label="Add SquareSZN to your Home Screen">
      <span className="install-banner-icon" aria-hidden="true">🏈</span>
      <div className="install-banner-text">
        <span className="install-banner-title">Get the SquareSZN app</span>
        <p>
          {browser === 'chrome' ? (
            <>
              Tap <ShareGlyph /> at the top of the screen, then <strong>Add to Home Screen</strong>.
            </>
          ) : (
            <>
              Tap <ShareGlyph /> below, then <strong>Add to Home Screen</strong>.
            </>
          )}
        </p>
      </div>
      <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}

export default InstallBanner
