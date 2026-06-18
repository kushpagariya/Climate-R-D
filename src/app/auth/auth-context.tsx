import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./auth-storage";
import type {
  AuthSession,
  AuthUser,
  LoginCredentials,
  SignupCredentials,
  UserPurpose,
  UserRole,
} from "./auth-types";

interface AuthContextValue {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<AuthUser | null>;
  signup: (credentials: SignupCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setRole: (role: UserRole) => void;
  setPurposes: (purposes: UserPurpose[]) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createMockUser(email: string, fullName?: string, organization?: string): AuthUser {
  return {
    id: `mock-${email.toLowerCase()}`,
    fullName: fullName?.trim() || email.split("@")[0] || "Indravani User",
    email: email.trim().toLowerCase(),
    organization: organization?.trim() || undefined,
    purposes: [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(readStoredSession());
    setIsLoading(false);
  }, []);

  const persistSession = useCallback((nextSession: AuthSession) => {
    setSession(nextSession);
    writeStoredSession(nextSession);
  }, []);

  const login = useCallback(
    async ({ email, password, rememberMe }: LoginCredentials) => {
      setIsLoading(true);
      setError(null);

      await new Promise((resolve) => window.setTimeout(resolve, 450));

      if (!email.trim() || !password.trim()) {
        setError("Enter your email and password to continue.");
        setIsLoading(false);
        return null;
      }

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        setError("Enter a valid institutional email address.");
        setIsLoading(false);
        return null;
      }

      const existingSession = readStoredSession();
      const user = existingSession?.user?.email === email.trim().toLowerCase()
        ? existingSession.user
        : createMockUser(email);

      persistSession({
        user,
        rememberMe,
        createdAt: existingSession?.createdAt ?? new Date().toISOString(),
      });
      setIsLoading(false);
      return user;
    },
    [persistSession],
  );

  const signup = useCallback(
    async ({ fullName, email, password, organization }: SignupCredentials) => {
      setIsLoading(true);
      setError(null);

      await new Promise((resolve) => window.setTimeout(resolve, 550));

      persistSession({
        user: createMockUser(email, fullName, organization),
        rememberMe: true,
        createdAt: new Date().toISOString(),
      });
      setIsLoading(false);
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    setSession(null);
    setError(null);
    clearStoredSession();
  }, []);

  const setRole = useCallback(
    (role: UserRole) => {
      if (!session) return;
      persistSession({
        ...session,
        user: {
          ...session.user,
          role,
        },
      });
    },
    [persistSession, session],
  );

  const setPurposes = useCallback(
    (purposes: UserPurpose[]) => {
      if (!session) return;
      persistSession({
        ...session,
        user: {
          ...session.user,
          purposes,
        },
      });
    },
    [persistSession, session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      isAuthenticated: Boolean(session),
      isLoading,
      error,
      login,
      signup,
      logout,
      clearError: () => setError(null),
      setRole,
      setPurposes,
    }),
    [error, isLoading, login, logout, session, setPurposes, setRole, signup],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
