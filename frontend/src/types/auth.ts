export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  avatarUrl?: string;
  provider: 'email' | 'google';
}

export type AuthModalView = 'signin' | 'signup' | 'forgot_password';
