import { Injectable, inject, signal, computed } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, map, of, throwError } from 'rxjs';

import {
  User,
  AuthToken,
  LoginResponse,
  ChangeCredentialsPayload,
} from '../models/auth.model';

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    Login(
      loginInput: {
        email: $email
        password: $password
      }
    ) {
      accessToken
      refreshToken
      expiresIn
      user {
        id
        email
        role
        isActive
        isTempPassword
      }
    }
  }
`;

const REFRESH_TOKEN_MUTATION = gql`
  mutation RefreshToken($refreshToken: String!) {
    RefreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
      expiresIn
      user {
        id
        email
        role
        isActive
        isTempPassword
      }
    }
  }
`;

const CHANGE_CREDENTIALS_MUTATION = gql`
  mutation ChangeCredentials(
    $currentEmail: String!
    $currentPassword: String!
    $newEmail: String!
    $newPassword: String!
  ) {
    ChangeCredentials(
      input: {
        currentEmail: $currentEmail
        currentPassword: $currentPassword
        newEmail: $newEmail
        newPassword: $newPassword
      }
    ) {
      id
      email
      role
      isActive
      isTempPassword
    }
  }
`;

const VERIFY_SESSION_QUERY = gql`
  query VerifySession {
    VerifySession {
      id
      email
      role
      isActive
      isTempPassword
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly REFRESH_TOKEN_KEY = 'auth_refresh_token';
  private readonly USER_KEY = 'user_data';

  private router = inject(Router);
  private apollo = inject(Apollo);

  private userSignal = signal<User | null>(null);
  private userSubject = new BehaviorSubject<User | null>(null);
  private accessTokenSignal = signal<string | null>(null);
  private refreshTokenSignal = signal<string | null>(null);
  private tokenExpirySignal = signal<number | null>(null);

  user$ = this.userSubject.asObservable();
  isAuthenticated = computed(() => {
    const token = this.accessTokenSignal();
    return !!token && !this.isTokenExpired(token);
  });

  constructor() {
    this.loadSessionFromStorage();
  }

  login(email: string, password: string): Observable<User> {
    this.clearSession();

    return this.apollo
      .mutate<{ Login: LoginResponse }>({
        mutation: LOGIN_MUTATION,
        variables: { email, password },
      })
      .pipe(
        map((result) => {
          const data = result.data?.Login;
          if (!data || !data.user) {
            throw new Error('Credenciales inválidas');
          }

          if (data.user.isTempPassword) {
            return data.user;
          }

          if (!data.accessToken) {
            throw new Error('Credenciales inválidas');
          }

          const tokenData: AuthToken = {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: this.getTokenExpiry(data.accessToken, data.expiresIn),
          };

          this.saveSession(tokenData, data.user);
          return data.user;
        }),
        catchError((err) => throwError(() => err))
      );
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  changeCredentials(payload: ChangeCredentialsPayload): Observable<User> {
    return this.apollo
      .mutate<{ ChangeCredentials: User }>({
        mutation: CHANGE_CREDENTIALS_MUTATION,
        variables: payload,
      })
      .pipe(
        map((result) => {
          const data = result.data?.ChangeCredentials;
          if (!data) {
            throw new Error('No se pudo actualizar credenciales');
          }
          this.logout();
          return data;
        }),
        catchError((err) => throwError(() => err))
      );
  }

  getAccessToken(): string | null {
    return this.accessTokenSignal();
  }

  getRefreshToken(): string | null {
    return this.refreshTokenSignal();
  }

  verifySession(): Observable<User | null> {
    const token = this.getAccessToken();

    if (!token) {
      return of(null);
    }

    return this.apollo
      .query<{ VerifySession: User }>({
        query: VERIFY_SESSION_QUERY,
        fetchPolicy: 'no-cache',
      })
      .pipe(
        map((result) => {
          const user = result.data?.VerifySession;

          if (!user || !user.isActive || user.isTempPassword) {
            this.clearSession();
            return null;
          }

          this.cacheUser(user);
          return user;
        }),
        catchError((err) => {
          if (this.isSessionValidationError(err)) {
            this.clearSession();
            return of(null);
          }

          return throwError(() => err);
        })
      );
  }

  refreshAccessToken(): Observable<string> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      this.logout();
      return throwError(() => new Error('No hay refresh token disponible'));
    }

    return this.apollo
      .mutate<{ RefreshToken: LoginResponse }>({
        mutation: REFRESH_TOKEN_MUTATION,
        variables: { refreshToken },
      })
      .pipe(
        map((result) => {
          const data = result.data?.RefreshToken;
          if (!data?.accessToken || !data?.user) {
            throw new Error('Errores en refresh token');
          }

          const tokenData: AuthToken = {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: this.getTokenExpiry(data.accessToken, data.expiresIn),
          };

          this.saveSession(tokenData, data.user);
          return data.accessToken;
        }),
        catchError((err) => {
          this.logout();
          return throwError(() => err);
        })
      );
  }

  getCurrentUser(): User | null {
    return this.userSignal();
  }

  private saveSession(token: AuthToken, user: User): void {
    try {
      localStorage.setItem(this.TOKEN_KEY, token.accessToken);
      if (token.refreshToken) {
        localStorage.setItem(this.REFRESH_TOKEN_KEY, token.refreshToken);
      }
      this.cacheUser(user);
      localStorage.setItem('token_expiry', token.expiresAt.toString());

      this.accessTokenSignal.set(token.accessToken);
      this.refreshTokenSignal.set(token.refreshToken || null);
      this.tokenExpirySignal.set(token.expiresAt);
    } catch {
      this.clearSession();
    }
  }

  private clearSession(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('token_expiry');

    this.accessTokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    this.tokenExpirySignal.set(null);
    this.userSignal.set(null);
    this.userSubject.next(null);
  }

  private loadSessionFromStorage(): void {
    const storedUser = localStorage.getItem(this.USER_KEY);
    const storedToken = localStorage.getItem(this.TOKEN_KEY);
    const storedRefresh = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    const storedExpiry = Number(localStorage.getItem('token_expiry')) || null;

    if (storedUser && storedToken) {
      try {
        const user: User = JSON.parse(storedUser);
        if (user.isTempPassword) {
          this.clearSession();
          return;
        }
        const isExpired = storedExpiry ? Date.now() / 1000 >= storedExpiry : this.isTokenExpired(storedToken);

        this.cacheUser(user);
        this.accessTokenSignal.set(storedToken);
        this.refreshTokenSignal.set(storedRefresh || null);
        this.tokenExpirySignal.set(storedExpiry ?? null);

        if (isExpired) {
          this.refreshAccessToken().subscribe({
            next: () => undefined,
            error: () => undefined,
          });
        }
      } catch {
        this.clearSession();
      }
    }
  }

  private getTokenExpiry(token: string, expiresIn?: number): number {
    const payload = this.getJwtPayload(token);
    if (payload && payload['exp']) {
      return Number(payload['exp']);
    }

    const defaultExpiry = Math.floor(Date.now() / 1000) + (expiresIn ?? 3600);
    return defaultExpiry;
  }

  private getJwtPayload(token: string): { [key: string]: any } | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(payload)));
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.getJwtPayload(token);
    if (!payload || !payload['exp']) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return Number(payload['exp']) <= now;
  }

  private cacheUser(user: User): void {
    const normalizedUser: User = {
      ...user,
      isTempPassword: user.isTempPassword ?? false,
    };

    localStorage.setItem(this.USER_KEY, JSON.stringify(normalizedUser));
    this.userSignal.set(normalizedUser);
    this.userSubject.next(normalizedUser);
  }

  private isSessionValidationError(error: unknown): boolean {
    const gqlErr = (error as any)?.graphQLErrors?.[0];

    if (!gqlErr) {
      return false;
    }

    const code = String(gqlErr?.extensions?.code ?? '').toUpperCase();
    const message = String(gqlErr?.message ?? '').toLowerCase();

    return (
      code === 'UNAUTHENTICATED' ||
      code === 'UNAUTHORIZED' ||
      message.includes('unauthorized') ||
      message.includes('token invalido') ||
      message.includes('credenciales invalidas') ||
      message.includes('cuenta inactiva')
    );
  }

  parseAuthError(error: unknown): {
    message: string;
    title: string;
    style: 'danger' | 'warning' | 'info';
    lockoutSeconds?: number;
  } {
    const gqlErr = (error as any)?.graphQLErrors?.[0];
    const networkErr = (error as any)?.networkError;
    const message = gqlErr?.message?.toString?.() || (error as any)?.message?.toString?.() || '';

    if (gqlErr || message) {
      const code = gqlErr?.extensions?.code?.toString?.().toUpperCase() || '';
      const lockoutMatch = message.match(/(?:en\s+)?(\d+)\s+segundos?(?:[.!?]*|$)/i);
      if (lockoutMatch) {
        return {
          message: 'Cuenta bloqueada temporalmente.',
          title: 'Cuenta bloqueada',
          style: 'danger',
          lockoutSeconds: Number(lockoutMatch[1]),
        };
      }
      if (code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED' || message.toLowerCase().includes('credenciales')) {
        return {
          message: 'Verifica tu correo y contraseña.',
          title: 'Credenciales inválidas',
          style: 'warning',
        };
      }

      return {
        message: message || 'Error en el proceso de autenticación. Intenta de nuevo.',
        title: 'Error de autenticación',
        style: 'danger',
      };
    }

    if (networkErr) {
      return {
        message: 'No se pudo conectar al backend. Comprueba tu red o el servidor e intenta de nuevo.',
        title: 'Error de conexión',
        style: 'danger',
      };
    }

    return {
      message: 'Revisa tus datos e intenta nuevamente.',
      title: 'Error de autenticación',
      style: 'warning',
    };
  }
}
