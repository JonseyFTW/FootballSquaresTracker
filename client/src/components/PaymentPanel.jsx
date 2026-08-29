import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { apiFetch } from '../api'

const TYPE_LABELS = { venmo: 'Venmo', paypal: 'PayPal', zelle: 'Zelle', cashapp: 'Cash App', other: 'Other' }

// Best-effort deep link for a handle; Zelle (and plain emails/phones) have
// no universal URL, so the QR falls back to the raw handle text.
export function paymentLink(method) {
  const handle = method.handle.trim()
  if (/^https?:\/\//i.test(handle)) return handle
  const bare = handle.replace(/^@/, '')
  if (method.type === 'venmo') return `https://venmo.com/u/${encodeURIComponent(bare)}`
  if (method.type === 'cashapp') return `https://cash.app/${encodeURIComponent(handle.startsWith('$') ? handle : '$' + bare)}`
  if (method.type === 'paypal' && !handle.includes('@')) return `https://paypal.me/${encodeURIComponent(bare)}`
  return null
}

function Qr({ text }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (canvasRef.current && text) {
      QRCode.toCanvas(canvasRef.current, text, {
        width: 168,
        margin: 1,
        color: { dark: '#0b1120', light: '#ffffff' }
      }).catch(() => {})
    }
  }, [text])
  return <canvas ref={canvasRef} className="pay-qr" aria-label="Payment QR code" />
}

// Shown to a member holding squares: how much they owe and exactly where
// to send it. "Don't show again" is remembered on their account per league.
function PaymentPanel({ payment, user, onHidden, compact = false }) {
  const [hideChecked, setHideChecked] = useState(false)
  const methods = payment?.methods || []
  if (methods.length === 0) return null

  const primary = methods[0]
  const qrText = paymentLink(primary) || primary.handle

  const toggleHide = async (checked) => {
    setHideChecked(checked)
    await apiFetch('/api/me/prefs', {
      method: 'PUT',
      body: JSON.stringify({ hidePaymentInfo: { [payment.leagueId]: checked } })
    })
    if (checked && onHidden) onHidden()
  }

  return (
    <div className={`pay-panel ${compact ? 'compact' : ''}`}>
      {payment.amountOwed > 0 && (
        <p className="pay-owe">You owe <strong>${payment.amountOwed}</strong> for your squares</p>
      )}
      <div className="pay-body">
        <div className="pay-qr-tile">
          <Qr text={qrText} />
          <span className="pay-qr-label">{TYPE_LABELS[primary.type] || primary.type}</span>
        </div>
        <div className="pay-methods">
          {methods.map((method, idx) => {
            const link = paymentLink(method)
            return (
              <div key={idx} className="pay-method">
                <span className="pay-method-type">{TYPE_LABELS[method.type] || method.type}</span>
                {link ? (
                  <a href={link} target="_blank" rel="noreferrer">{method.handle}</a>
                ) : (
                  <span>{method.handle}</span>
                )}
              </div>
            )
          })}
          <p className="live-hint" style={{ marginTop: '8px' }}>
            Scan the code or tap a handle — pay {payment.leagueName ? `the ${payment.leagueName} commissioner` : 'the commissioner'} directly.
          </p>
        </div>
      </div>
      {user && (
        <label className="pay-hide">
          <input type="checkbox" checked={hideChecked} onChange={(e) => toggleHide(e.target.checked)} />
          Don't show payment info for this league again — I know where to send it
        </label>
      )}
    </div>
  )
}

export default PaymentPanel
