import * as React from "react"
import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'participante' | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, role: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'participante' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        console.log("Auth: User logged in as:", currentUser.email, "| UID:", currentUser.uid);
        // Hardcode admin for the app owner
        if (currentUser.email === 'cristian.colpas@logisticos.co') {
          setRole('admin');
        }

        // Listen to user profile for roles
        const unsubscribeProfile = onSnapshot(doc(db, 'usuarios', currentUser.uid), (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            if (data.role) {
              setRole(data.role);
            }
          }
          setLoading(false);
        }, (error) => {
          console.error("Auth profile error:", error);
          setLoading(false);
        });
        return () => unsubscribeProfile();
      } else {
        setRole(null);
        setLoading(false);
      }
    }, (error) => {
      console.error("Auth state error:", error);
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
