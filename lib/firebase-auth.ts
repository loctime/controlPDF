/**
 * Firebase Authentication service
 */

declare global {
  interface Window {
    firebase?: any
  }
}

export interface User {
  uid: string
  email?: string
  displayName?: string
}

class FirebaseAuthService {
  private user: User | null = null
  private listeners: Array<(user: User | null) => void> = []

  constructor() {
    // Initialize Firebase if it's available
    if (typeof window !== 'undefined' && window.firebase) {
      this.initializeAuth()
    }
  }

  private initializeAuth() {
    if (!window.firebase) return

    window.firebase.auth().onAuthStateChanged((user: any) => {
      if (user) {
        this.user = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        }
      } else {
        this.user = null
      }
      this.notifyListeners()
    })
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.user))
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
    if (typeof window === 'undefined' || !window.firebase) {
      return null
    }

    return new Promise((resolve) => {
      const unsubscribe = window.firebase.auth().onAuthStateChanged((user: any) => {
        unsubscribe()
        if (user) {
          resolve({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          })
        } else {
          resolve(null)
        }
      })
    })
  }

  async getIdToken(): Promise<string | null> {
    if (typeof window === 'undefined' || !window.firebase) {
      return null
    }

    const user = window.firebase.auth().currentUser
    if (!user) {
      return null
    }

    try {
      return await user.getIdToken(true)
    } catch (error) {
      console.error('Error getting ID token:', error)
      return null
    }
  }

  async signInWithGoogle(): Promise<User | null> {
    if (typeof window === 'undefined' || !window.firebase) {
      return null
    }

    try {
      const provider = new window.firebase.auth.GoogleAuthProvider()
      const result = await window.firebase.auth().signInWithPopup(provider)
      
      if (result.user) {
        return {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
        }
      }
      return null
    } catch (error) {
      console.error('Error signing in with Google:', error)
      return null
    }
  }

  signOut(): Promise<void> {
    if (typeof window === 'undefined' || !window.firebase) {
      return Promise.resolve()
    }

    return window.firebase.auth().signOut()
  }
}

export const firebaseAuthService = new FirebaseAuthService()
