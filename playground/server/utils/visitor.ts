import type { H3Event } from 'h3'

// Stand-in for real auth: a long-lived signed-ish visitor cookie.
// In your app use the session you already have (nuxt-auth-utils, Supabase, ...).
export function useVisitor(event: H3Event): string {
  let id = getCookie(event, 'visitor')
  if (!id) {
    id = crypto.randomUUID()
    setCookie(event, 'visitor', id, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' })
  }
  return id
}
