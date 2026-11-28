export type UserRole = 'patient' | 'doctor' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  roleLabel?: string;
  organization?: string;
  token?: string;
  avatarUrl?: string;
  provider: 'email' | 'google';
}

export type AuthModalView = 'signin' | 'signup' | 'forgot_password';

export type PortalLoginRole = UserRole;
