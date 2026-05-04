// ============================================================================
// Supabase Client Configuration - Production Ready for Native & Web
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ============================================================================
// Environment Variable Handling
// ============================================================================

function isValidEnvVar(value: string | undefined): boolean {
  if (!value) return false
  if (value.length === 0) return false
  // Check for EAS placeholder strings that weren't resolved
  if (value.startsWith('${') && value.endsWith('}')) return false
  // Check for common placeholder patterns
  if (value === 'undefined' || value === 'null') return false
  return true
}

// Get environment variables - these MUST be set in EAS secrets or .env
const supabaseUrl = isValidEnvVar(process.env.EXPO_PUBLIC_SUPABASE_URL) 
  ? process.env.EXPO_PUBLIC_SUPABASE_URL! 
  : ''

const supabaseAnonKey = isValidEnvVar(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
  ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
  : ''

// Log warning if not configured (only in dev)
if (__DEV__) {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase] ⚠️ MISSING CONFIGURATION!')
    console.error('[Supabase] Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY')
    console.error('[Supabase] In .env file for local dev, or EAS Secrets for builds')
  } else {
    console.log('[Supabase] ✓ Configuration loaded')
  }
}

// ============================================================================
// Platform Detection - Lazy loaded to prevent crashes
// ============================================================================

let _Platform: typeof import('react-native').Platform | null = null
let _platformLoaded = false

function getPlatform() {
  if (!_platformLoaded) {
    _platformLoaded = true
    try {
      _Platform = require('react-native').Platform
    } catch {
      _Platform = null
    }
  }
  return _Platform
}

// ============================================================================
// URL Polyfill - Must be loaded before any network calls on native
// ============================================================================

let _urlPolyfillLoaded = false

function ensureUrlPolyfill() {
  if (_urlPolyfillLoaded) return
  _urlPolyfillLoaded = true
  
  try {
    const platform = getPlatform()
    if (platform && platform.OS !== 'web') {
      require('react-native-url-polyfill/auto')
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[Supabase] URL polyfill failed:', error)
    }
  }
}

// Load URL polyfill immediately for native platforms
ensureUrlPolyfill()

// ============================================================================
// Platform Helpers
// ============================================================================

function isWeb(): boolean {
  const platform = getPlatform()
  return platform?.OS === 'web'
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

// ============================================================================
// Storage Configuration
// ============================================================================

function getWebStorage() {
  if (!isBrowser()) return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const nativeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value)
    } catch {
      // Ignore storage errors
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key)
    } catch {
      // Ignore storage errors
    }
  },
}

// ============================================================================
// Deep Linking / Redirect URL
// ============================================================================

export const getRedirectUrl = (path: string = 'auth/callback') => {
  const platform = getPlatform()
  
  if (platform?.OS === 'web') {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin.trim()
      const cleanPath = path.trim().replace(/^\//, '')
      return `${origin}/${cleanPath}`
    }
    return `/${path.trim()}`
  }
  
  try {
    const Linking = require('expo-linking')
    return Linking.createURL(path.trim())
  } catch {
    return path
  }
}

// ============================================================================
// Supabase Client - Singleton Pattern
// ============================================================================

let _supabaseInstance: SupabaseClient | null = null

// Custom memory lock to prevent Web Locks API from hanging indefinitely on iOS Safari
// while still providing mutual exclusion within the same JS execution context.
const memoryLocks = new Map<string, Promise<any>>()

const memoryLock = async (name: string, acquireTimeout: number = 10000, fn: () => Promise<any>) => {
  const currentLock = memoryLocks.get(name) || Promise.resolve()
  
  let releaseLock: () => void
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  
  // Use .catch() to ensure the queue continues even if the previous lock failed
  const queuedLock = currentLock.then(() => nextLock).catch(() => nextLock)
  memoryLocks.set(name, queuedLock)
  
  let timerId: ReturnType<typeof setTimeout> | undefined;
  
  try {
    const racePromises: Promise<any>[] = [currentLock.catch(() => {})]
    
    // GoTrueClient passes -1 when no timeout should occur
    if (acquireTimeout > 0) {
      racePromises.push(
        new Promise((_, reject) => {
          timerId = setTimeout(() => {
            const err = new Error('Lock acquisition timeout') as any
            err.isAcquireTimeout = true
            reject(err)
          }, acquireTimeout)
        })
      )
    }
    
    // Wait for the previous lock to release, or timeout if stuck
    await Promise.race(racePromises)
    
    return await fn()
  } finally {
    if (timerId) clearTimeout(timerId)
    releaseLock!()
    // Cleanup if this is the last lock in the queue
    if (memoryLocks.get(name) === queuedLock) {
      memoryLocks.delete(name)
    }
  }
}

// IMPORTANT: Do NOT wrap fetch in a custom timeout/Promise.race wrapper.
// iOS Safari/WebKit has issues when fetch() promises are wrapped with .then()
// handlers + Promise.race: it corrupts the HTTP/2 connection state, causing
// subsequent requests on the same connection to fail silently (the request
// never leaves the device). This was the root cause of profile fetch failures
// on iPhone/iPad where auth succeeded (200) but profile fetch never reached
// the server.
//
// Timeout protection is handled at the application level instead:
//   - withTimeout() on signIn (10s) and profile fetch (10s)
//   - Promise.race master timeout in AuthContext (35s web / 20s native)
//
// If you need to add fetch-level timeout in the future, use AbortController
// with signal — but test on iOS Safari first.

function createSupabaseClient(): SupabaseClient {
  const web = isWeb()
  const storage = web ? getWebStorage() : nativeStorage
  
  if (__DEV__) {
    console.log('[Supabase] Creating client for platform:', getPlatform()?.OS || 'unknown')
  }
  
  // If not configured, create a dummy client that will fail gracefully
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase] Cannot create client - missing configuration')
    // Return a client that will fail on any operation
    return createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { storage: nativeStorage, persistSession: false }
    })
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'sb-auth-token',
      flowType: web ? 'pkce' : 'implicit',
      lock: web ? memoryLock : undefined, // Bypass Web Locks on web/Safari
    },
    global: {
      // Using native fetch — do NOT add a custom fetch wrapper here.
      // See comment above for why fetchWithTimeout was removed (iOS Safari issue).
      headers: {
        'x-client-info': `fmc-app/${getPlatform()?.OS || 'unknown'}`,
      },
    },
  })
}

function getSupabaseClient(): SupabaseClient {
  if (!_supabaseInstance) {
    _supabaseInstance = createSupabaseClient()
  }
  return _supabaseInstance
}

export const supabase: SupabaseClient = getSupabaseClient()

// ============================================================================
// Global Refresh Lock — Prevents concurrent refreshSession() races
// ============================================================================

let _refreshPromise: Promise<{ data: { session: any }; error: any }> | null = null

/**
 * Thread-safe wrapper around supabase.auth.refreshSession().
 * Only ONE refresh can be in-flight at a time. Concurrent callers
 * receive the result of the already-running refresh instead of
 * firing a second one (which would revoke the first's token).
 */
export async function safeRefreshSession(): Promise<{ data: { session: any }; error: any }> {
  // Guard: don't attempt refresh if there's no session/refresh_token
  // This prevents 400 "Refresh Token Not Found" errors on iOS Safari
  // when the session was lost but storage still has stale data.
  try {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession?.refresh_token) {
      if (__DEV__) {
        console.log('[Supabase] safeRefreshSession: no refresh token, skipping')
      }
      return { data: { session: null }, error: { message: 'No refresh token available', name: 'AuthSessionMissingError', status: 400 } }
    }
  } catch {
    // If getSession itself fails, fall through and let refreshSession handle it
  }

  if (_refreshPromise) {
    if (__DEV__) {
      console.log('[Supabase] safeRefreshSession: waiting for in-flight refresh...')
    }
    return _refreshPromise
  }

  if (__DEV__) {
    console.log('[Supabase] safeRefreshSession: starting new refresh')
  }

  _refreshPromise = supabase.auth.refreshSession()
    .finally(() => {
      _refreshPromise = null
    })

  return _refreshPromise
}

// ============================================================================
// Helper Functions
// ============================================================================

export async function ensureValidSession(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) return false
    
    const expiresAt = session.expires_at
    if (expiresAt) {
      const now = Math.floor(Date.now() / 1000)
      if (expiresAt - now < 60) {
        // Use the global lock to prevent concurrent refresh races
        const { error: refreshError } = await safeRefreshSession()
        if (refreshError) return false
      }
    }
    return true
  } catch {
    return false
  }
}

export function getStoredSessionSync(): boolean {
  if (!isWeb() || !isBrowser()) return false
  try {
    const stored = window.localStorage.getItem('sb-auth-token')
    return stored !== null && stored !== ''
  } catch {
    return false
  }
}

export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && 
         supabaseAnonKey.length > 0 && 
         supabaseUrl.includes('supabase') &&
         supabaseAnonKey.startsWith('eyJ')
}

export function getSupabaseConfigStatus(): { url: boolean; key: boolean; valid: boolean } {
  return {
    url: supabaseUrl.length > 0 && supabaseUrl.includes('supabase'),
    key: supabaseAnonKey.length > 0 && supabaseAnonKey.startsWith('eyJ'),
    valid: isSupabaseConfigured()
  }
}

export default supabase

// Export URL and key for direct PostgREST calls that bypass SDK lock
// (used in auth.ts for profile fetch after login — see comments there)
export { supabaseUrl, supabaseAnonKey }
