import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loginApi, signupApi } from "../api/auth";
import { getProfileApi, updateProfileApi } from "../api/profile";
import { logActivityApi } from "../api/activity";
import { ApiError } from "../api/client";
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
  UserProfile,
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
  setRole: (role: UserRole) => Promise<void>;
  setPurposes: (purposes: UserPurpose[]) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mergeUserWithProfile(
  user: { id: string; fullName: string; email: string; organization?: string },
  profile?: UserProfile | null,
): AuthUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    organization: user.organization,
    role: profile?.role ?? undefined,
    purposes: profile?.purposes ?? [],
  };
}

function buildSession(
  user: AuthUser,
  token: string,
  rememberMe: boolean,
  createdAt?: string,
): AuthSession {
  return {
    user,
    token,
    rememberMe,
    createdAt: createdAt ?? new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistSession = useCallback((nextSession: AuthSession) => {
    setSession(nextSession);
    writeStoredSession(nextSession);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      const stored = readStoredSession();

      if (!stored?.token) {
        if (!cancelled) {
          setSession(stored);
          setIsLoading(false);
        }
        return;
      }

      try {
        const profile = await getProfileApi(stored.token);
        if (cancelled) return;

        const nextSession = buildSession(
          mergeUserWithProfile(stored.user, profile),
          stored.token,
          stored.rememberMe,
          stored.createdAt,
        );
        persistSession(nextSession);
      } catch {
        if (!cancelled) {
          clearStoredSession();
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [persistSession]);

  const login = useCallback(
    async ({ email, password, rememberMe }: LoginCredentials) => {
      setIsLoading(true);
      setError(null);

      try {
        if (!email.trim() || !password.trim()) {
          setError("Enter your email and password to continue.");
          return null;
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
          setError("Enter a valid institutional email address.");
          return null;
        }

        const response = await loginApi(email, password);
        const user = mergeUserWithProfile(response.user, response.profile);
        const nextSession = buildSession(user, response.token, rememberMe);
        persistSession(nextSession);
        void logActivityApi(response.token, {
          action: "login",
          resourceType: "user",
          resourceId: response.user.id,
        });
        return user;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "Unable to sign in. Please try again.";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [persistSession],
  );

  const signup = useCallback(
    async ({ fullName, email, password, organization }: SignupCredentials) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await signupApi({ fullName, email, password, organization });
        const user = mergeUserWithProfile(response.user, {
          role: null,
          purposes: [],
          onboardingComplete: false,
        });
        persistSession(buildSession(user, response.token, true));
        void logActivityApi(response.token, {
          action: "signup",
          resourceType: "user",
          resourceId: response.user.id,
        });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "Unable to create account. Please try again.";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    if (session?.token) {
      void logActivityApi(session.token, {
        action: "logout",
        resourceType: "user",
        resourceId: session.user.id,
      });
    }
    setSession(null);
    setError(null);
    clearStoredSession();
  }, [session]);

  const setRole = useCallback(
    async (role: UserRole) => {
      if (!session) return;

      await updateProfileApi(session.token, { role });
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
    async (purposes: UserPurpose[]) => {
      if (!session) return;

      await updateProfileApi(session.token, {
        purposes,
        onboardingComplete: true,
      });
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
      isAuthenticated: Boolean(session?.token),
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
