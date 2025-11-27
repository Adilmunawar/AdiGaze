import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Server, Wifi, Clock, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ServerStatus {
  online: boolean;
  latency: number;
  lastCheck: Date;
}

export const ServerHealthCheck = () => {
  const [status, setStatus] = useState<ServerStatus>({
    online: false,
    latency: 0,
    lastCheck: new Date()
  });
  const [checking, setChecking] = useState(false);
  const [uptime, setUptime] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  // Server last reboot: November 14th, 2025
  const LAST_REBOOT = new Date('2025-11-14T00:00:00Z');

  const calculateUptime = () => {
    const now = new Date();
    const diff = now.getTime() - LAST_REBOOT.getTime();
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    setUptime({ days, hours, minutes, seconds });
  };

  const checkServerHealth = async () => {
    setChecking(true);
    const startTime = performance.now();
    
    try {
      // Ping the Supabase database to check connectivity
      const { error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      setStatus({
        online: !error,
        latency: latency,
        lastCheck: new Date()
      });
    } catch (error) {
      setStatus({
        online: false,
        latency: 0,
        lastCheck: new Date()
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    // Initial health check
    checkServerHealth();

    // Update uptime every second
    const uptimeInterval = setInterval(calculateUptime, 1000);
    calculateUptime();

    // Auto health check every 30 seconds
    const healthInterval = setInterval(checkServerHealth, 30000);

    return () => {
      clearInterval(uptimeInterval);
      clearInterval(healthInterval);
    };
  }, []);

  return (
    <Card className="p-4 bg-gradient-to-br from-card/80 to-muted/30 backdrop-blur-md border-2 border-primary/30 shadow-[var(--shadow-premium)]">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-base">Server Health</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={checkServerHealth}
            disabled={checking}
            className="gap-2 h-8"
          >
            <Activity className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Ping Server'}
          </Button>
        </div>

        {/* Status Bar */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3 bg-background/60 rounded-lg border border-border/50">
            <div className="flex items-center gap-2">
              <Wifi className={`h-4 w-4 ${status.online ? 'text-accent' : 'text-destructive'}`} />
              <span className="text-sm font-medium">Status</span>
            </div>
            <Badge 
              variant={status.online ? "default" : "destructive"}
              className="text-xs"
            >
              {status.online ? 'Online' : 'Offline'}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-background/60 rounded-lg border border-border/50">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-secondary" />
              <span className="text-sm font-medium">Latency</span>
            </div>
            <span className="text-sm font-mono font-bold text-foreground">
              {status.latency}ms
            </span>
          </div>
        </div>

        {/* Uptime Counter */}
        <div className="p-4 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-lg border border-primary/30">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              System Uptime
            </span>
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {uptime.days}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {uptime.hours}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Hours</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {uptime.minutes}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Min</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {uptime.seconds}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Sec</div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border/30">
            <p className="text-xs text-muted-foreground text-center">
              Last reboot: <span className="font-medium text-foreground">November 14, 2025</span>
            </p>
            <p className="text-xs text-accent text-center mt-1">
              Last checked: {status.lastCheck.toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};
