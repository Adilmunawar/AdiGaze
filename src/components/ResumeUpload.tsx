import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ProcessingLogsDialog } from '@/components/ProcessingLogsDialog';
import { useProcessing } from '@/contexts/ProcessingContext';
import { supabase } from '@/integrations/supabase/client';

export const ResumeUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const processing = useProcessing();
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);
  const [droppedFiles, setDroppedFiles] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (level: 'info' | 'error' | 'success', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    processing.addLog({ timestamp, level, message });
  };

  const handleCancelUpload = () => {
    setIsCancelled(true);
    abortControllerRef.current?.abort();
    addLog('info', 'Upload cancelled by user');
  };

  const processFiles = async (files: FileList | File[]) => {
    const filesArray = Array.from(files);
    const validFiles: File[] = [];
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    const ALLOWED_TYPES = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    for (const file of filesArray) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File Too Large',
          description: `${file.name} exceeds 20MB limit`,
          variant: 'destructive',
        });
        continue;
      }
      
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|txt|doc|docx)$/i)) {
        toast({
          title: 'Invalid File Type',
          description: `${file.name} is not a supported format`,
          variant: 'destructive',
        });
        continue;
      }
      
      validFiles.push(file);
    }
    
    if (validFiles.length === 0) {
      toast({
        title: 'No Valid Files',
        description: 'Please upload PDF, TXT, DOC, or DOCX files under 20MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setShowLogsDialog(true);
    processing.startProcessing('resume');
    processing.clearLogs();
    processing.updateProgress(0);
    setTotalFiles(validFiles.length);
    setProcessedFiles(0);
    setDroppedFiles(0);
    setUploadedCount(0);
    processing.setEstimatedTime(null);
    setIsCancelled(false);
    abortControllerRef.current = new AbortController();
    const startTime = Date.now();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session found');

      // Process files in batches of 10 (5 parallel API keys × 2 resumes per batch)
      const BATCH_SIZE = 10;
      const batches: File[][] = [];
      for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
        batches.push(validFiles.slice(i, i + BATCH_SIZE));
      }

      let successCount = 0;
      let failedCount = 0;
      let batchIndex = 0;
      
      for (const batch of batches) {
        if (isCancelled || abortControllerRef.current?.signal.aborted) {
          break;
        }
        
        // Refresh session token before each batch to prevent timeout
        try {
          const { data: { session: refreshedSession } } = await supabase.auth.getSession();
          if (!refreshedSession?.access_token) {
            throw new Error('Session expired. Please log in again.');
          }
          session.access_token = refreshedSession.access_token;
        } catch (refreshError) {
          console.error('Session refresh error:', refreshError);
          addLog('error', 'Session expired. Please log in again and retry.');
          processing.setError(true);
          break;
        }
        
        // Create FormData with multiple files for batch processing
        const formData = new FormData();
        batch.forEach((file) => {
          formData.append('files', file); // Use 'files' key for all files
        });

        try {
          console.log(`Starting batch upload for ${batch.length} files:`, batch.map(f => f.name));
          
          batch.forEach(file => {
            addLog('info', `Uploading ${file.name}...`);
          });

          const response = await fetch(
            'https://olkbhjyfpdvcovtuekzt.supabase.co/functions/v1/parse-resume-batch',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: formData,
              signal: abortControllerRef.current?.signal,
            }
          );

          console.log(`Batch response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Batch upload failed:', errorText);
            
            // Handle authentication errors specifically
            if (response.status === 401) {
              addLog('error', 'Authentication expired. Please log in again and retry.');
              processing.setError(true);
              break;
            }
            
            batch.forEach(file => {
              addLog('error', `Failed: ${file.name} - ${errorText || response.statusText}`);
            });
            
            setDroppedFiles(prev => prev + batch.length);
            setProcessedFiles(prev => prev + batch.length);
            continue;
          }

          const result = await response.json();
          
          if (result.success) {
            addLog('success', `Batch complete - ${result.processed} processed successfully`);
            
            successCount += result.processed;
            setUploadedCount(successCount);
            
            if (result.failed > 0 && result.failedFiles) {
              result.failedFiles.forEach((failed: any) => {
                addLog('error', `Failed: ${failed.fileName} - ${failed.error}`);
              });
              failedCount += result.failed;
              setDroppedFiles(failedCount);
            }
          } else {
            throw new Error(result.error || 'Batch processing failed');
          }

        } catch (error) {
          console.error('Error uploading batch:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          batch.forEach(file => {
            addLog('error', `Failed: ${file.name} - ${errorMessage}`);
          });
          
          failedCount += batch.length;
          setDroppedFiles(failedCount);
        }
        
        batchIndex++;
        
        // Update progress with functional updates for real-time accuracy
        setProcessedFiles(prev => {
          const newProcessed = prev + batch.length;
          processing.updateProgress((newProcessed / validFiles.length) * 100);
          return newProcessed;
        });
        
        // Update time estimation using current batch index
        const elapsedTime = Date.now() - startTime;
        const avgTimePerBatch = elapsedTime / batchIndex;
        const remainingBatches = batches.length - batchIndex;
        if (remainingBatches > 0) {
          processing.setEstimatedTime(Math.ceil((avgTimePerBatch * remainingBatches) / 1000));
        } else {
          processing.setEstimatedTime(0);
        }
      }

      processing.setComplete(true);
      processing.setEstimatedTime(null);
      
      if (isCancelled || abortControllerRef.current?.signal.aborted) {
        toast({
          title: 'Upload Cancelled',
          description: `Processed ${successCount} resume(s) before cancellation`,
          variant: 'default',
        });
      } else {
        toast({
          title: failedCount === 0 ? 'Success!' : 'Partially Complete',
          description: failedCount === 0 
            ? `Successfully uploaded ${successCount} resume(s)`
            : `Uploaded ${successCount} resume(s), ${failedCount} failed`,
          variant: failedCount === 0 ? 'default' : 'destructive',
        });
      }
    } catch (error) {
      processing.setError(true);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
    const target = event.target as HTMLInputElement;
    target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  };

  return (
    <Card 
      className={`p-6 bg-gradient-to-br from-card/90 to-muted/20 backdrop-blur-sm border-2 border-dashed transition-all duration-300 ${
        isDragging 
          ? 'border-primary bg-primary/10 shadow-[var(--shadow-premium)] scale-[1.02]' 
          : 'border-primary/30 hover:border-primary/60 hover:shadow-[var(--shadow-premium)]'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
          <div className="relative p-6 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full ring-2 ring-primary/30 shadow-[var(--shadow-glow)]">
            <Upload className="h-12 w-12 text-primary animate-pulse" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-foreground">
            {isDragging ? 'Drop Files Here' : 'Upload Resumes'}
          </h3>
          <p className="text-muted-foreground max-w-md">
            {isDragging 
              ? 'Release to upload your resume files' 
              : 'Drag & drop resume files here or click to browse. PDF, TXT, DOC, or DOCX formats accepted.'
            }
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <label htmlFor="resume-upload" className="w-full">
            <Button
              disabled={uploading}
              className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-[var(--shadow-elegant)] hover:shadow-[var(--shadow-premium)] hover:scale-105 transition-all duration-300"
              asChild
            >
              <span className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                {uploading ? 'Processing...' : 'Select Resume Files'}
              </span>
            </Button>
            <input
              id="resume-upload"
              type="file"
              multiple
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>

          {uploadedCount > 0 && (
            <div className="flex items-center gap-2 text-accent animate-fade-in bg-accent/10 px-4 py-2 rounded-lg border border-accent/30">
              <CheckCircle className="h-5 w-5 animate-pulse" />
              <span className="font-medium">{uploadedCount} resumes uploaded successfully</span>
            </div>
          )}
        </div>
      </div>

      <ProcessingLogsDialog
        open={showLogsDialog && !processing.isMinimized}
        logs={processing.logs}
        progress={processing.progress}
        status={
          uploading 
            ? `Processing resumes... (${processedFiles}/${totalFiles} processed, ${droppedFiles} dropped)` 
            : `Upload complete - ${processedFiles} processed, ${uploadedCount} uploaded, ${droppedFiles} dropped`
        }
        isComplete={processing.isComplete}
        hasError={processing.hasError}
        onClose={() => {
          setShowLogsDialog(false);
          processing.stopProcessing();
        }}
        onCancel={uploading ? handleCancelUpload : undefined}
        onMinimize={processing.minimize}
        estimatedTimeRemaining={processing.estimatedTimeRemaining}
      />
    </Card>
  );
};