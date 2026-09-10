// Game-day push notifications. On iPhone these only work once the site is
// installed to the Home Screen (iOS 16.4+), which the install banner
// already pushes people toward.

import { apiFetch } from './api'

export function pushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

function base64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)))
}

// null = can't offer push here; true/false = currently subscribed
export async function getPushState() {
  if (!pushSupported()) return null
  const { ok, data } = await apiFetch('/api/push/config')
  if (!ok || !data.publicKey) return null
  if (Notification.permission === 'denied') return null
  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    return !!existing
  } catch (err) {
    return false
  }
}

export async function enablePush() {
  const { ok, data } = await apiFetch('/api/push/config')
  if (!ok || !data.publicKey) throw new Error('Push is not configured on the server')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed')

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(data.publicKey)
  })

  const saved = await apiFetch('/api/me/push-subscriptions', {
    method: 'POST',
    body: JSON.stringify({ subscription })
  })
  if (!saved.ok) throw new Error(saved.data.error || 'Failed to save subscription')
  return true
}
