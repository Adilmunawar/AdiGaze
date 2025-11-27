import React, { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Info, Copy, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'success';
  message: string;
}

interface ProcessingLogsDialogProps {
  open: boolean;
  logs: LogEntry[];
  progress: number;
  status: string;
  isComplete: boolean;
  hasError: boolean;
}

interface ProcessingLogsDialogProps {
  open: boolean;
  logs: LogEntry[];
  progress: number;
  status: string;
  isComplete: boolean;
  hasError: boolean;
  onClose: () => void;
  onCancel?: () => void;
  estimatedTimeRemaining?: number | null;
}

export const ProcessingLogsDialog: React.FC<ProcessingLogsDialogProps> = ({
  open,
  logs,
  progress,
  status,
  isComplete,
  hasError,
  onClose,
  onCancel,
  estimatedTimeRemaining,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Info className="h-4 w-4 text-primary" />;
    }
  };

  const copyLogsToClipboard = () => {
    const logsText = logs.map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`).join('\n');
    navigator.clipboard.writeText(logsText);
    toast({
      title: 'Logs Copied',
      description: 'Processing logs copied to clipboard',
    });
  };

  const downloadLogs = () => {
    const logsText = logs.map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`).join('\n');
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `processing-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: 'Logs Downloaded',
      description: 'Processing logs downloaded successfully',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && (isComplete || hasError) && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            {!isComplete && !hasError && (
              <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
            )}
            {isComplete && !hasError && (
              <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
            )}
            {hasError && <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />}
            <span className="truncate">Processing Candidates</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {status}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-3 sm:space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <div className="flex justify-between text-xs sm:text-sm gap-2">
              <span className="text-muted-foreground">Progress</span>
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
                <span className="font-medium whitespace-nowrap">{Math.round(progress)}%</span>
                {estimatedTimeRemaining && estimatedTimeRemaining > 0 && !isComplete && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    ~{estimatedTimeRemaining}s remaining
                  </span>
                )}
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {hasError && (
            <Alert variant="destructive" className="text-xs sm:text-sm">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              <AlertDescription>
                An error occurred during processing. Check the logs below for details.
              </AlertDescription>
            </Alert>
          )}

          <div className="border rounded-lg bg-muted/50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-2 sm:p-3 border-b bg-muted/30 flex-shrink-0">
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">Processing Logs</span>
              <div className="flex gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyLogsToClipboard}
                  disabled={logs.length === 0}
                  className="h-7 sm:h-8 gap-1 sm:gap-2 text-xs"
                >
                  <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Copy</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadLogs}
                  disabled={logs.length === 0}
                  className="h-7 sm:h-8 gap-1 sm:gap-2 text-xs"
                >
                  <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[200px] sm:h-[250px] lg:h-[300px] p-3 sm:p-4" ref={scrollRef}>
              <div className="space-y-2 font-mono text-xs">
                {logs.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">
                    Waiting for processing to start...
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-2 p-2 rounded transition-colors ${
                        log.level === 'error'
                          ? 'bg-destructive/10'
                          : log.level === 'success'
                          ? 'bg-green-500/10'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span className="flex-shrink-0 mt-0.5">{getIcon(log.level)}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground">
                          [{log.timestamp}]
                        </span>{' '}
                        <span
                          className={`${
                            log.level === 'error'
                              ? 'text-destructive font-medium'
                              : log.level === 'success'
                              ? 'text-green-600 dark:text-green-400'
                              : ''
                          }`}
                        >
                          {log.message}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {(isComplete || hasError) ? (
            <div className="flex justify-end pt-3 sm:pt-4 border-t flex-shrink-0">
              <Button onClick={onClose} variant="default" className="w-full sm:w-auto">
                Close
              </Button>
            </div>
          ) : onCancel ? (
            <div className="flex justify-end pt-3 sm:pt-4 border-t flex-shrink-0">
              <Button onClick={onCancel} variant="destructive" className="w-full sm:w-auto">
                Cancel Upload
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
