import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Maximize2, X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'success';
  message: string;
}

interface ProcessingToastProps {
  logs: LogEntry[];
  progress: number;
  status: string;
  isComplete: boolean;
  hasError: boolean;
  onExpand: () => void;
  onClose: () => void;
  estimatedTimeRemaining?: number | null;
}

export const ProcessingToast: React.FC<ProcessingToastProps> = ({
  logs,
  progress,
  status,
  isComplete,
  hasError,
  onExpand,
  onClose,
  estimatedTimeRemaining,
}) => {
  const latestLog = logs[logs.length - 1];

  const getStatusIcon = () => {
    if (hasError) return <XCircle className="h-4 w-4 text-destructive" />;
    if (isComplete) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-2xl border-2 z-50 bg-background/95 backdrop-blur-sm animate-in slide-in-from-bottom-5">
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getStatusIcon()}
            <span className="text-sm font-medium truncate">Processing Resumes</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onExpand}
              className="h-7 w-7 p-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            {(isComplete || hasError) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 w-7 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate flex-1">{Math.round(progress)}%</span>
            {estimatedTimeRemaining && estimatedTimeRemaining > 0 && !isComplete && (
              <span className="text-muted-foreground whitespace-nowrap">
                ~{estimatedTimeRemaining}s
              </span>
            )}
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <div className="text-xs text-muted-foreground truncate">
          {status}
        </div>

        <ScrollArea className="h-20 rounded border bg-muted/30 p-2">
          <div className="space-y-1 font-mono text-xs">
            {logs.slice(-5).map((log, index) => (
              <div
                key={index}
                className={`flex items-start gap-1.5 ${
                  log.level === 'error'
                    ? 'text-destructive'
                    : log.level === 'success'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-foreground/80'
                }`}
              >
                <span className="text-muted-foreground text-[10px] flex-shrink-0">
                  {log.timestamp.split(':').slice(0, 2).join(':')}
                </span>
                <span className="truncate">{log.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
};
