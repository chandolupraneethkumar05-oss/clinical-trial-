import { useState, useRef, useEffect } from 'react';
import type { FC } from 'react';
import type { AuthUser } from '../types/auth';
import { User, LogOut, ChevronDown, Shield, Sparkles } from 'lucide-react';

interface UserMenuProps {
  user: AuthUser | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onSwitchPersona?: () => void;
}

export const UserMenu: FC<UserMenuProps> = ({
  user,
  onOpenAuth,
  onSignOut,
  onSwitchPersona,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <button
        onClick={onOpenAuth}
        className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white border border-linen-300 hover:bg-linen-100 text-charcoal-900 transition-colors shadow-2xs"
      >
        <User className="h-3.5 w-3.5 text-terracotta-600" />
        <span>Sign In</span>
      </button>
    );
  }

  // Get initials
  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-1 pl-2 pr-2.5 rounded-full bg-white border border-linen-300 hover:bg-linen-100 transition-all text-left shadow-2xs"
      >
        <div className="h-6 w-6 rounded-full bg-charcoal-900 text-white text-[10px] font-mono font-bold flex items-center justify-center">
          {initials || 'U'}
        </div>
        <div className="hidden sm:block text-left">
          <span className="text-xs font-semibold text-charcoal-900 block leading-tight max-w-[120px] truncate">
            {user.name}
          </span>
        </div>
        <ChevronDown className="h-3 w-3 text-charcoal-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-xl border border-linen-300 rounded-2xl shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
          {/* User Info Header */}
          <div className="px-4 py-2.5 border-b border-linen-200">
            <p className="font-semibold text-charcoal-900 truncate">{user.name}</p>
            <p className="text-[11px] text-charcoal-500 font-mono truncate">{user.email}</p>
            <div className="mt-1.5 flex items-center space-x-1 text-[10px] text-sage-700 bg-sage-50 px-2 py-0.5 rounded-full border border-sage-200 w-fit">
              <Shield className="h-3 w-3" />
              <span className="truncate max-w-[180px]">{user.role}</span>
            </div>
            <p className="text-[10px] text-charcoal-500 font-mono mt-1 truncate">
              {user.organization}
            </p>
          </div>

          {/* Menu Actions */}
          <div className="p-1 space-y-0.5">
            {onSwitchPersona && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onSwitchPersona();
                }}
                className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-charcoal-700 hover:bg-linen-100 hover:text-charcoal-900 transition-colors text-left"
              >
                <Sparkles className="h-3.5 w-3.5 text-terracotta-500" />
                <span>{import.meta.env.DEV ? 'Switch Account / Persona' : 'Switch Account'}</span>
              </button>
            )}

            <button
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 transition-colors text-left"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
