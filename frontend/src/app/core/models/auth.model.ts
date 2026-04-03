export interface User {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  isTempPassword: boolean;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ChangeCredentialsPayload {
  currentEmail: string;
  currentPassword: string;
  newEmail: string;
  newPassword: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  user: User;
}
