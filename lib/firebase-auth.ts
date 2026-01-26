/**
 * Firebase Authentication service
 * Platform-shared authentication - NO REGISTRATION ALLOWED
 */

import { 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser,
  AuthError as FirebaseAuthError
} from 'firebase/auth'
import { auth } from './firebase'

export interface User {
  uid: string
  email?: string
  displayName?: string
}

export interface AuthError {
  code: string
  message: string
  customData?: any
  name?: string
}

class FirebaseAuthService {
  private user: User | null = null
  private listeners: Array<(user: User | null) => void> = []

  constructor() {
    this.initializeAuth()
  }

  private initializeAuth() {
    if (!auth) return

    const unsubscribe = firebaseOnAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        this.user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || undefined,
          displayName: firebaseUser.displayName || undefined,
        }
      } else {
        this.user = null
      }
      this.notifyListeners()
    })

    // Store unsubscribe for cleanup if needed
    return unsubscribe
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.user))
  }

  private mapFirebaseError(error: any): AuthError {
    const errorCode = error?.code || 'unknown'
    let message = error?.message || 'An unknown error occurred'

    // Map common Firebase auth errors to platform-specific messages
    switch (errorCode) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        message = 'Invalid email or password'
        break
      case 'auth/user-disabled':
        message = 'This account has been disabled'
        break
      case 'auth/too-many-requests':
        message = 'Too many failed attempts. Please try again later'
        break
      case 'auth/network-request-failed':
        message = 'Network error. Please check your connection'
        break
    }

    return { code: errorCode, message }
  }

  onAuthStateChanged(callback: (user: User | null) => void) {
    this.listeners.push(callback)
    // Immediately call with current user
    callback(this.user)
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  async getCurrentUser(): Promise<User | null> {
    if (!auth) return null

    return new Promise((resolve) => {
      const unsubscribe = firebaseOnAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
        unsubscribe()
        if (firebaseUser) {
          resolve({
            uid: firebaseUser.uid,
            email: firebaseUser.email || undefined,
            displayName: firebaseUser.displayName || undefined,
          })
        } else {
          resolve(null)
        }
      })
    })
  }

  async getIdToken(): Promise<string | null> {
    if (!auth) return null

    const firebaseUser = auth.currentUser
    if (!firebaseUser) {
      return null
    }

    try {
      return await firebaseUser.getIdToken(true)
    } catch (error) {
      console.error('Error getting ID token:', error)
      return null
    }
  }

  /**
   * Sign in with email and password
   * Only allows existing users - NO REGISTRATION
   */
  async signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
    if (!auth) {
      return { user: null, error: { code: 'auth/not-initialized', message: 'Firebase not initialized' } }
    }

    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      
      if (result.user) {
        const user: User = {
          uid: result.user.uid,
          email: result.user.email || undefined,
          displayName: result.user.displayName || undefined,
        }
        return { user, error: null }
      }
      
      return { user: null, error: { code: 'unknown', message: 'Failed to sign in' } }
    } catch (error: any) {
      console.error('Error signing in with email:', error)
      return { user: null, error: this.mapFirebaseError(error) }
    }
  }

  /**
   * Sign in with Google OAuth
   * Only allows existing users - blocks new user creation
   */
  async signInWithGoogle(): Promise<{ user: User | null; error: AuthError | null }> {
    if (!auth) {
      return { user: null, error: { code: 'auth/not-initialized', message: 'Firebase not initialized' } }
    }

    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      
      if (result.user) {
        const user: User = {
          uid: result.user.uid,
          email: result.user.email || undefined,
          displayName: result.user.displayName || undefined,
        }
        return { user, error: null }
      }
      
      return { user: null, error: { code: 'unknown', message: 'Failed to sign in with Google' } }
    } catch (error: any) {
      console.error('Error signing in with Google:', error)
      
      // Check if this is a new user trying to sign up
      if (error.code === 'auth/account-exists-with-different-credential') {
        return { 
          user: null, 
          error: { 
            code: 'auth/account-exists-with-different-credential', 
            message: 'This account is not enabled for the platform.' 
          } 
        }
      }
      
      return { user: null, error: this.mapFirebaseError(error) }
    }
  }

  signOut(): Promise<{ error: AuthError | null }> {
    if (!auth) {
      return Promise.resolve({ error: { code: 'auth/not-initialized', message: 'Firebase not initialized' } })
    }

    return firebaseSignOut(auth)
      .then(() => ({ error: null }))
      .catch((error) => ({ error: this.mapFirebaseError(error) }))
  }
}

export const firebaseAuthService = new FirebaseAuthService()
