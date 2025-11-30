import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Home,
  User,
  Shield,
  Code,
  Users,
  Clock,
  Bookmark,
  History,
  Menu,
  LogOut,
  Scale,
  Inbox,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface AppSidebarLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', icon: Home, href: '/' },
  { label: 'Candidates', icon: Users, href: '/candidates' },
  { label: 'Received Resumes', icon: Inbox, href: '/external-submissions' },
  { label: 'Recent Resumes', icon: Clock, href: '/recent-resumes' },
  { label: 'Bookmarks', icon: Bookmark, href: '/bookmarks' },
  { label: 'Search History', icon: History, href: '/history' },
];

const settingsNavItems: NavItem[] = [
  { label: 'Profile', icon: User, href: '/profile-settings' },
  { label: 'Security', icon: Shield, href: '/security' },
  { label: 'Dev Options', icon: Code, href: '/developer-settings' },
  { label: 'Legal', icon: Scale, href: '/legal' },
];

const SIDEBAR_STORAGE_KEY = 'sidebar-expanded';

export const AppSidebarLayout: React.FC<AppSidebarLayoutProps> = ({ children }) => {
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  });
  const [pendingCount, setPendingCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  // Persist sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(expanded));
  }, [expanded]);

  // Fetch pending external submissions count
  useEffect(() => {
    if (!user) return;

    const fetchPendingCount = async () => {
      const { count } = await supabase
        .from('external_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('admin_user_id', user.id)
        .eq('status', 'pending');
      
      setPendingCount(count || 0);
    };

    fetchPendingCount();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('external-submissions-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'external_submissions',
        },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const currentPath = location.pathname;

  const handleNavigate = (href: string) => {
    if (currentPath !== href) {
      navigate(href);
    }
  };

  // Add pending count badge to Received Resumes nav item
  const navItemsWithBadge = mainNavItems.map(item => ({
    ...item,
    badge: item.href === '/external-submissions' ? pendingCount : undefined
  }));

  const renderNavGroup = (
    items: NavItem[],
    groupLabel?: string
  ) => (
    <div className="w-full space-y-0.5 lg:space-y-1">
      {groupLabel && expanded && (
        <div className="px-3 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase animate-fade-in">
          {groupLabel}
        </div>
      )}
      {items.map((item, index) => {
        const Icon = item.icon;
        const isActive =
          currentPath === item.href ||
          (item.href !== '/' && currentPath.startsWith(item.href));
        const badgeCount = item.badge;

        const button = (
          <Button
            key={item.href}
            variant="ghost"
            size="sm"
            onClick={() => handleNavigate(item.href)}
            className={cn(
              'w-full justify-start gap-3 px-3 text-xs rounded-2xl group relative overflow-hidden',
              'transition-all duration-300 ease-out',
              !expanded && 'justify-center',
              isActive
                ? 'bg-gradient-to-r from-primary/20 to-secondary/10 text-primary shadow-[var(--shadow-card)] border border-primary/30 scale-[1.02]'
                : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground hover:scale-[1.02] hover:shadow-sm'
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Hover gradient overlay */}
            <span className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <Icon className={cn(
              "h-4 w-4 shrink-0 relative z-10 transition-all duration-300",
              isActive ? "text-primary scale-110" : "group-hover:scale-110 group-hover:text-primary"
            )} />
            <span className={cn(
              "truncate text-xs font-medium relative z-10 transition-all duration-300 text-left origin-left",
              expanded ? "opacity-100 scale-x-100 w-auto" : "opacity-0 scale-x-0 w-0 absolute"
            )}>
              {item.label}
            </span>
            
            {/* Badge for pending count */}
            {badgeCount !== undefined && badgeCount > 0 && (
              <Badge 
                className={cn(
                  "h-5 min-w-5 px-1.5 text-[10px] font-bold relative z-10 ml-auto",
                  "bg-primary text-primary-foreground animate-pulse"
                )}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </Badge>
            )}
            
            {/* Active indicator dot */}
            {isActive && !expanded && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            )}
          </Button>
        );

        return expanded ? (
          <div key={item.href} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
            {button}
          </div>
        ) : (
          <Tooltip key={item.href} delayDuration={0}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs z-50 animate-scale-in flex items-center gap-2">
              {item.label}
              {badgeCount !== undefined && badgeCount > 0 && (
                <Badge className="h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </Badge>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );

  return (
    <div className="h-screen flex bg-gradient-to-br from-background via-background to-muted/20 text-foreground overflow-hidden">
      {/* Background mesh effect */}
      <div className="fixed inset-0 bg-mesh pointer-events-none" />
      <div className="fixed top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-float pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-float-delayed pointer-events-none" />
      
      {/* Sidebar - Curved only on right side */}
      <aside
        className={cn(
          'relative flex flex-col justify-between py-2 lg:py-4 backdrop-blur-xl shadow-[var(--shadow-premium)] transition-all duration-500 ease-out z-20',
          'bg-gradient-to-br from-card via-card/95 to-background/90',
          'rounded-tr-[2.5rem] rounded-br-[2.5rem]',
          'border-y border-r border-border/20',
          expanded ? 'w-60' : 'w-16'
        )}
      >
        <div className="flex flex-col items-center gap-2 lg:gap-4 px-2 pt-2 flex-1">
          {/* Toggle button with animation */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(prev => !prev)}
            className={cn(
              "self-start rounded-2xl bg-background/60 hover:bg-primary/10 hover:text-primary shadow-[var(--shadow-card)] ml-1 border border-border/30",
              "transition-all duration-300 hover:scale-105 hover:shadow-[var(--shadow-elegant)]",
              !expanded && "rotate-180"
            )}
            aria-label="Toggle sidebar"
          >
            <Menu className={cn("h-4 w-4 transition-transform duration-300", !expanded && "rotate-180")} />
          </Button>

          <nav className="mt-1 lg:mt-2 flex flex-col gap-2 lg:gap-4 w-full">
            {renderNavGroup(navItemsWithBadge, 'Overview')}
            <div className="mx-3 border-t border-border/20" />
            {renderNavGroup(settingsNavItems, 'Admin')}
          </nav>
        </div>

        {/* Sign out at bottom */}
        <div className="flex flex-col items-stretch gap-1 lg:gap-2 px-2 pb-2 lg:pb-4">
          <div className={cn(
            "w-full rounded-2xl border border-border/20 bg-background/30 py-1.5 text-center mb-1 text-[10px] text-muted-foreground backdrop-blur-sm transition-all duration-300 overflow-hidden",
            expanded ? "opacity-100 max-h-10" : "opacity-0 max-h-0 py-0 mb-0 border-transparent"
          )}>
            Account
          </div>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={expanded ? 'default' : 'icon'}
                onClick={() => signOut()}
                className={cn(
                  "w-full gap-2 px-3 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:shadow-md",
                  expanded ? "justify-start" : "justify-center"
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className={cn(
                  "truncate text-left transition-all duration-300 origin-left",
                  expanded ? "opacity-100 scale-x-100 w-auto" : "opacity-0 scale-x-0 w-0 absolute"
                )}>Sign Out</span>
              </Button>
            </TooltipTrigger>
            {!expanded && (
              <TooltipContent side="right" className="text-xs z-50">
                Sign Out
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 relative overflow-y-auto z-10">
        {children}
      </main>
    </div>
  );
};

export default AppSidebarLayout;
