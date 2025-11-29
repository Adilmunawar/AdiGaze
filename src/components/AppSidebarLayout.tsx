import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Home,
  Settings,
  DatabaseBackup,
  Users,
  Clock,
  Bookmark,
  History,
  Menu,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface AppSidebarLayoutProps {
  children: React.ReactNode;
}

const mainNavItems = [
  { label: 'Dashboard', icon: Home, href: '/' },
  { label: 'Candidates', icon: Users, href: '/candidates' },
  { label: 'Recent Resumes', icon: Clock, href: '/recent-resumes' },
  { label: 'Bookmarks', icon: Bookmark, href: '/bookmarks' },
  { label: 'Search History', icon: History, href: '/history' },
];

const settingsNavItems = [
  { label: 'Settings', icon: Settings, href: '/settings' },
  { label: 'Dev Settings', icon: DatabaseBackup, href: '/developer-settings' },
];

export const AppSidebarLayout: React.FC<AppSidebarLayoutProps> = ({ children }) => {
  const [expanded, setExpanded] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const currentPath = location.pathname;

  const handleNavigate = (href: string) => {
    if (currentPath !== href) {
      navigate(href);
    }
  };

  const renderNavGroup = (
    items: typeof mainNavItems,
    groupLabel?: string
  ) => (
    <div className="w-full space-y-1">
      {groupLabel && expanded && (
        <div className="px-3 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
          {groupLabel}
        </div>
      )}
      {items.map(item => {
        const Icon = item.icon;
        const isActive =
          currentPath === item.href ||
          (item.href !== '/' && currentPath.startsWith(item.href));

        const button = (
          <Button
            key={item.href}
            variant="ghost"
            size={expanded ? 'default' : 'icon'}
            onClick={() => handleNavigate(item.href)}
            className={cn(
              'w-full justify-start gap-3 px-3 text-xs transition-all duration-200 rounded-xl',
              isActive
                ? 'bg-primary/10 text-primary shadow-[var(--shadow-card)] border border-primary/40'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {expanded && <span className="truncate text-xs font-medium">{item.label}</span>}
          </Button>
        );

        return expanded ? (
          <div key={item.href}>{button}</div>
        ) : (
          <Tooltip key={item.href} delayDuration={0}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );

  return (
    <div className="h-screen flex bg-gradient-to-br from-background via-muted/10 to-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col justify-between py-4 border-r border-border/60 bg-card/95 backdrop-blur-md shadow-[var(--shadow-elegant)] transition-[width] duration-300',
          expanded ? 'w-60' : 'w-16'
        )}
      >
        <div className="flex flex-col items-center gap-4 px-2">
          {/* Toggle button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(prev => !prev)}
            className="self-start rounded-full bg-background/60 hover:bg-accent hover:text-accent-foreground shadow-[var(--shadow-card)] ml-1"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <nav className="mt-4 flex flex-col gap-4 w-full">
            {renderNavGroup(mainNavItems, 'Overview')}
            <div className="border-t border-border/40" />
            {renderNavGroup(settingsNavItems, 'Admin')}
          </nav>
        </div>

        {/* Sign out at bottom */}
        <div className="flex flex-col items-center gap-2 px-2 pb-1">
          {expanded && (
            <div className="w-full rounded-full border border-border/50 bg-background/40 py-1 text-center mb-1 text-[10px] text-muted-foreground">
              Account
            </div>
          )}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={expanded ? 'default' : 'icon'}
                onClick={() => signOut()}
                className="w-full justify-start gap-2 px-3 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs rounded-xl"
              >
                <LogOut className="h-4 w-4" />
                {expanded && <span className="truncate">Sign Out</span>}
              </Button>
            </TooltipTrigger>
            {!expanded && (
              <TooltipContent side="right" className="text-xs">
                Sign Out
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 relative overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default AppSidebarLayout;
