import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'success';
  message: string;
}

interface ProcessingContextType {
  isProcessing: boolean;
  isMinimized: boolean;
  logs: LogEntry[];
  progress: number;
  status: string;
  isComplete: boolean;
  hasError: boolean;
  estimatedTimeRemaining: number | null;
  startProcessing: (type: 'resume' | 'matching') => void;
  stopProcessing: () => void;
  minimize: () => void;
  expand: () => void;
  addLog: (log: LogEntry) => void;
  updateProgress: (progress: number) => void;
  updateStatus: (status: string) => void;
  setComplete: (complete: boolean) => void;
  setError: (error: boolean) => void;
  setEstimatedTime: (time: number | null) => void;
  clearLogs: () => void;
  processingType: 'resume' | 'matching' | null;
}

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

export const ProcessingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [processingType, setProcessingType] = useState<'resume' | 'matching' | null>(null);

  const startProcessing = (type: 'resume' | 'matching') => {
    setIsProcessing(true);
    setProcessingType(type);
    setIsMinimized(false);
    setIsComplete(false);
    setHasError(false);
    setProgress(0);
    setLogs([]);
    setStatus('');
  };

  const stopProcessing = () => {
    setIsProcessing(false);
    setIsMinimized(false);
    setProcessingType(null);
  };

  const minimize = () => setIsMinimized(true);
  const expand = () => setIsMinimized(false);

  const addLog = (log: LogEntry) => {
    setLogs(prev => [...prev, log]);
  };

  const updateProgress = (newProgress: number) => setProgress(newProgress);
  const updateStatus = (newStatus: string) => setStatus(newStatus);
  const setComplete = (complete: boolean) => setIsComplete(complete);
  const setError = (error: boolean) => setHasError(error);
  const setEstimatedTime = (time: number | null) => setEstimatedTimeRemaining(time);
  const clearLogs = () => setLogs([]);

  return (
    <ProcessingContext.Provider
      value={{
        isProcessing,
        isMinimized,
        logs,
        progress,
        status,
        isComplete,
        hasError,
        estimatedTimeRemaining,
        startProcessing,
        stopProcessing,
        minimize,
        expand,
        addLog,
        updateProgress,
        updateStatus,
        setComplete,
        setError,
        setEstimatedTime,
        clearLogs,
        processingType,
      }}
    >
      {children}
    </ProcessingContext.Provider>
  );
};

export const useProcessing = () => {
  const context = useContext(ProcessingContext);
  if (context === undefined) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return context;
};
