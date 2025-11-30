import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  type: 'search' | 'upload';
  message: string;
  created_at: string;
  read: boolean;
}

const getLastReadTimestamp = (userId: string): number => {
  const stored = localStorage.getItem(`notifications_last_read_${userId}`);
  return stored ? parseInt(stored, 10) : 0;
};

const setLastReadTimestamp = (userId: string, timestamp: number) => {
  localStorage.setItem(`notifications_last_read_${userId}`, timestamp.toString());
};

export const NotificationBell = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadTime, setLastReadTime] = useState<number>(0);

  const processNotifications = useCallback((
    searchNotifications: Omit<Notification, 'read'>[],
    uploadNotifications: Omit<Notification, 'read'>[],
    lastRead: number
  ) => {
    const allNotifications = [...searchNotifications, ...uploadNotifications]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15)
      .map(n => ({
        ...n,
        read: new Date(n.created_at).getTime() <= lastRead
      }));

    setNotifications(allNotifications);
    setUnreadCount(allNotifications.filter(n => !n.read).length);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Load last read timestamp from localStorage
    const storedLastRead = getLastReadTimestamp(user.id);
    setLastReadTime(storedLastRead);

    const fetchNotifications = async () => {
      try {
        // Fetch recent searches
        const { data: searches } = await supabase
          .from('job_searches')
          .select('id, created_at, total_candidates')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        // Fetch recent uploads
        const { data: uploads } = await supabase
          .from('profiles')
          .select('id, created_at, full_name')
          .eq('user_id', user.id)
          .not('resume_file_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10);

        const searchNotifications = (searches || []).map((s) => ({
          id: `search-${s.id}`,
          type: 'search' as const,
          message: `New search completed with ${s.total_candidates} candidates`,
          created_at: s.created_at,
        }));

        const uploadNotifications = (uploads || []).map((u) => ({
          id: `upload-${u.id}`,
          type: 'upload' as const,
          message: `Resume uploaded: ${u.full_name || 'Unknown'}`,
          created_at: u.created_at,
        }));

        processNotifications(searchNotifications, uploadNotifications, storedLastRead);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchNotifications();

    // Subscribe to real-time updates for searches
    const searchChannel = supabase
      .channel('search-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_searches',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    // Subscribe to real-time updates for uploads
    const uploadChannel = supabase
      .channel('upload-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(searchChannel);
      supabase.removeChannel(uploadChannel);
    };
  }, [user, processNotifications]);

  const markAllAsRead = () => {
    if (!user) return;
    
    const now = Date.now();
    setLastReadTimestamp(user.id, now);
    setLastReadTime(now);
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    
    toast({
      title: "All notifications marked as read",
      duration: 2000,
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-primary hover:text-primary-foreground transition-all duration-300"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-card/95 backdrop-blur-md border-border/50 shadow-[var(--shadow-premium)]" align="end">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-7 gap-1 text-xs hover:bg-primary hover:text-primary-foreground transition-all duration-300"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="p-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-300 mb-2 border border-transparent hover:border-primary/40 ${
                    !notification.read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        notification.type === 'search'
                          ? 'bg-primary'
                          : 'bg-secondary'
                      } ${!notification.read ? 'animate-pulse' : 'opacity-50'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'}`}>
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
