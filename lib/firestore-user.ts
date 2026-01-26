/**
 * Firestore user metadata service for ControlPDF
 * Stores app-specific user data under /apps/controlpdf/users/{userId}
 */

import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore'
import { db } from './firebase'
import { type User } from './firebase-auth'

export interface UserMetadata {
  userId: string
  email?: string
  provider: 'email' | 'google' | 'unknown'
  firstLoginAt?: Timestamp | any
  lastLoginAt: Timestamp | any
}

class FirestoreUserService {
  /**
   * Create or update user metadata on successful login
   */
  async updateUserLogin(user: User, provider: 'email' | 'google' | 'unknown'): Promise<void> {
    if (!db) {
      console.error('Firestore not initialized')
      return
    }

    try {
      const userRef = doc(db, 'apps', 'controlpdf', 'users', user.uid)
      const userDoc = await getDoc(userRef)

      const now = serverTimestamp()

      if (userDoc.exists()) {
        // Update existing user
        await updateDoc(userRef, {
          lastLoginAt: now,
        })
      } else {
        // Create new user metadata
        const userMetadata: UserMetadata = {
          userId: user.uid,
          email: user.email,
          provider,
          firstLoginAt: now,
          lastLoginAt: now,
        }

        await setDoc(userRef, userMetadata)
      }
    } catch (error) {
      console.error('Error updating user metadata:', error)
      // Don't throw - this is for auditing only and shouldn't block login
    }
  }

  /**
   * Get user metadata
   */
  async getUserMetadata(userId: string): Promise<UserMetadata | null> {
    if (!db) {
      console.error('Firestore not initialized')
      return null
    }

    try {
      const userRef = doc(db, 'apps', 'controlpdf', 'users', userId)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        return userDoc.data() as UserMetadata
      }

      return null
    } catch (error) {
      console.error('Error getting user metadata:', error)
      return null
    }
  }
}

export const firestoreUserService = new FirestoreUserService()
