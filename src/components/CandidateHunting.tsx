import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Search, Sparkles, Award, MapPin, Download, X, Bookmark, Briefcase, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ProcessingLogsDialog } from '@/components/ProcessingLogsDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface CandidateMatch {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  job_title: string | null;
  location: string | null;
  years_of_experience: number | null;
  resume_file_url?: string;
  matchScore: number;
  reasoning: string;
  strengths: string[];
  concerns: string[];
}

interface MatchChunkResult {
  matches: CandidateMatch[];
  processed: number;
  totalInChunk: number;
}

export const CandidateHunting = () => {
  const [searchParams] = useSearchParams();
  const [jobDescription, setJobDescription] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<CandidateMatch[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkedEmails, setBookmarkedEmails] = useState<Set<string>>(new Set());
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState('');
  const [processingLogs, setProcessingLogs] = useState<Array<{
    timestamp: string;
    level: 'info' | 'error' | 'success';
    message: string;
  }>>([]);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [processingError, setProcessingError] = useState(false);
  const [availableJobTitles, setAvailableJobTitles] = useState<string[]>([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState<string[]>([]);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [filteredCandidateCount, setFilteredCandidateCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  
  const itemsPerPage = 10;

  // Fetch bookmarks, job titles, and load search based on URL parameter or last search
  useEffect(() => {
    fetchBookmarks();
    fetchJobTitles();
    const searchId = searchParams.get('search');
    if (searchId) {
      loadSpecificSearch(searchId);
    } else {
      loadLastSearch();
    }
  }, [searchParams]);

  // Update filtered candidate count when filters change
  useEffect(() => {
    fetchFilteredCandidateCount();
  }, [timeFilter, customDateRange, selectedJobTitles]);

  const fetchJobTitles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('job_title')
        .eq('user_id', user.id)
        .not('job_title', 'is', null);

      if (error) throw error;

      const uniqueTitles = [...new Set(data?.map(p => p.job_title).filter(Boolean) as string[])];
      setAvailableJobTitles(uniqueTitles.sort());
    } catch (error) {
      console.error('Error fetching job titles:', error);
    }
  };

  const fetchFilteredCandidateCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFilteredCandidateCount(null);
        return;
      }

      setLoadingCount(true);

      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Apply time filter
      if (timeFilter !== 'all') {
        if (timeFilter === 'custom' && customDateRange?.from) {
          const startDate = customDateRange.from;
          query = query.gte('created_at', startDate.toISOString());
          
          if (customDateRange.to) {
            const endDate = new Date(customDateRange.to);
            endDate.setHours(23, 59, 59, 999);
            query = query.lte('created_at', endDate.toISOString());
          }
        } else {
          const now = new Date();
          let cutoffDate: Date;

          switch (timeFilter) {
            case '1day':
              cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              break;
            case '3days':
              cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
              break;
            case '7days':
              cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              break;
            case '1month':
              cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              break;
            default:
              cutoffDate = new Date(0);
          }

          query = query.gte('created_at', cutoffDate.toISOString());
        }
      }

      // Apply job title filter
      if (selectedJobTitles.length > 0) {
        query = query.in('job_title', selectedJobTitles);
      }

      const { count, error } = await query;

      if (error) throw error;

      setFilteredCandidateCount(count || 0);
    } catch (error) {
      console.error('Error fetching candidate count:', error);
      setFilteredCandidateCount(null);
    } finally {
      setLoadingCount(false);
    }
  };

  const fetchBookmarks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('candidate_bookmarks')
        .select('candidate_id, profiles!inner(email)');

      if (error) throw error;

      const ids = new Set<string>();
      const emails = new Set<string>();

      (data || []).forEach((b: any) => {
        if (b.candidate_id) ids.add(b.candidate_id);
        const email = b.profiles?.email as string | null;
        if (email) emails.add(email.toLowerCase().trim());
      });

      setBookmarkedIds(ids);
      setBookmarkedEmails(emails);
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    }
  };

  const loadSpecificSearch = async (searchId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the specific search
      const { data: searchData, error: searchError } = await supabase
        .from('job_searches')
        .select('*')
        .eq('id', searchId)
        .maybeSingle();

      if (searchError) throw searchError;
      if (!searchData) {
        toast({
          title: 'Search Not Found',
          description: 'The requested search could not be found',
          variant: 'destructive',
        });
        return;
      }

      // Load the candidates for this search
      const { data: candidatesData, error: candidatesError } = await supabase
        .from('candidate_matches')
        .select('*')
        .eq('search_id', searchData.id)
        .order('match_score', { ascending: false });

      if (candidatesError) throw candidatesError;

      // Convert to CandidateMatch format
      const formattedMatches: CandidateMatch[] = candidatesData.map((c) => ({
        id: c.candidate_id,
        full_name: c.candidate_name,
        email: c.candidate_email,
        phone_number: c.candidate_phone,
        job_title: c.job_role,
        location: c.candidate_location,
        years_of_experience: c.experience_years,
        matchScore: c.match_score,
        reasoning: c.reasoning,
        strengths: c.key_strengths || [],
        concerns: c.potential_concerns || [],
      })).sort((a, b) => b.matchScore - a.matchScore);

      setJobDescription(searchData.job_description);
      setMatches(formattedMatches);
      setTotalCandidates(searchData.total_candidates);
      setCurrentSearchId(searchData.id);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading specific search:', error);
      toast({
        title: 'Error',
        description: 'Failed to load search results',
        variant: 'destructive',
      });
    }
  };

  const loadLastSearch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the most recent search
      const { data: searchData, error: searchError } = await supabase
        .from('job_searches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (searchError) throw searchError;
      if (!searchData) return;

      // Load the candidates for this search
      const { data: candidatesData, error: candidatesError } = await supabase
        .from('candidate_matches')
        .select('*')
        .eq('search_id', searchData.id)
        .order('match_score', { ascending: false });

      if (candidatesError) throw candidatesError;

      // Convert to CandidateMatch format
      const formattedMatches: CandidateMatch[] = candidatesData.map((c) => ({
        id: c.candidate_id,
        full_name: c.candidate_name,
        email: c.candidate_email,
        phone_number: c.candidate_phone,
        job_title: c.job_role,
        location: c.candidate_location,
        years_of_experience: c.experience_years,
        matchScore: c.match_score,
        reasoning: c.reasoning,
        strengths: c.key_strengths || [],
        concerns: c.potential_concerns || [],
      })).sort((a, b) => b.matchScore - a.matchScore);

      setJobDescription(searchData.job_description);
      setMatches(formattedMatches);
      setTotalCandidates(searchData.total_candidates);
      setCurrentSearchId(searchData.id);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading last search:', error);
    }
  };

  const toggleBookmark = async (candidate: CandidateMatch) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Authentication Required',
          description: 'Please sign in to bookmark candidates',
          variant: 'destructive',
        });
        return;
      }

      const emailKey = candidate.email?.toLowerCase().trim();
      if (!emailKey) {
        toast({
          title: 'Cannot bookmark candidate',
          description: 'This candidate has no email, so we cannot link it to a profile.',
          variant: 'destructive',
        });
        return;
      }

      // Find the actual profile row for this candidate based on email + user
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('email', candidate.email)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        toast({
          title: 'Cannot bookmark candidate',
          description: 'No matching resume/profile found for this candidate.',
          variant: 'destructive',
        });
        return;
      }

      const profileId = profile.id as string;
      const isBookmarked = bookmarkedEmails.has(emailKey);

      if (isBookmarked) {
        const { error } = await supabase
          .from('candidate_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('candidate_id', profileId);

        if (error) throw error;

        setBookmarkedIds(prev => {
          const next = new Set(prev);
          next.delete(profileId);
          return next;
        });

        setBookmarkedEmails(prev => {
          const next = new Set(prev);
          next.delete(emailKey);
          return next;
        });

        toast({
          title: 'Bookmark Removed',
          description: 'Candidate removed from bookmarks',
        });
      } else {
        const { error } = await supabase
          .from('candidate_bookmarks')
          .insert({
            user_id: user.id,
            candidate_id: profileId,
          });

        if (error) throw error;

        setBookmarkedIds(prev => {
          const next = new Set(prev);
          next.add(profileId);
          return next;
        });

        setBookmarkedEmails(prev => {
          const next = new Set(prev);
          next.add(emailKey);
          return next;
        });

        toast({
          title: 'Bookmarked!',
          description: 'Candidate saved for later review',
        });
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast({
        title: 'Error',
        description: 'Failed to update bookmark',
        variant: 'destructive',
      });
    }
  };

  const exportToExcel = async () => {
    if (matches.length === 0) {
      toast({
        title: 'No Data to Export',
        description: 'Please search for candidates first',
        variant: 'destructive',
      });
      return;
    }

    const excelData = matches.map((candidate, index) => ({
      'Rank': index + 1,
      'Full Name': candidate.full_name || '',
      'Email': candidate.email || '',
      'Phone Number': candidate.phone_number || '',
      'Location': candidate.location || '',
      'Job Title': candidate.job_title || '',
      'Years of Experience': candidate.years_of_experience || '',
      'Match %': candidate.matchScore,
      'Key Strengths': candidate.strengths.join('; '),
      'Potential Concerns': candidate.concerns.join('; '),
      'Reasoning': candidate.reasoning || '',
      'Resume URL': candidate.resume_file_url || ''
    }));

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidate Matches');
    
    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({
      wch: Math.min(maxWidth, Math.max(key.length, ...excelData.map(row => String(row[key as keyof typeof row]).length)))
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `candidate_matches_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: 'Excel Exported Successfully',
      description: `Exported ${matches.length} candidates to Excel`,
    });
  };

  const handleClearResults = () => {
    setMatches([]);
    setTotalCandidates(0);
    setCurrentPage(1);
    setJobDescription('');
    setShowBookmarkedOnly(false);
    setCurrentSearchId(null);
    toast({
      title: 'Results Cleared',
      description: 'Ready for a new search',
    });
  };

  const cleanDuplicates = () => {
    if (matches.length === 0) {
      toast({
        title: 'No Data',
        description: 'No candidates to clean',
        variant: 'destructive',
      });
      return;
    }

    const uniqueMap = new Map<string, CandidateMatch>();
    const normalizeString = (str: string | null | undefined): string => {
      return (str || '').toLowerCase().trim().replace(/\s+/g, '');
    };

    for (const candidate of matches) {
      const emailKey = normalizeString(candidate.email);
      const phoneKey = normalizeString(candidate.phone_number);
      const nameKey = normalizeString(candidate.full_name);
      
      // Generate a composite key based on available identifiers
      const compositeKey = `${emailKey}|${phoneKey}|${nameKey}`;
      
      // Check if we've seen this candidate before
      let isDuplicate = false;
      let existingKey = '';

      for (const [key, existing] of uniqueMap.entries()) {
        const existingEmail = normalizeString(existing.email);
        const existingPhone = normalizeString(existing.phone_number);
        const existingName = normalizeString(existing.full_name);

        // Consider it a duplicate if any of these match:
        // 1. Same email (and email is not empty)
        // 2. Same phone (and phone is not empty)
        // 3. Same name (exact match after normalization)
        if (
          (emailKey && existingEmail && emailKey === existingEmail) ||
          (phoneKey && existingPhone && phoneKey === existingPhone) ||
          (nameKey && existingName && nameKey === existingName)
        ) {
          isDuplicate = true;
          existingKey = key;
          break;
        }
      }

      if (isDuplicate && existingKey) {
        const existing = uniqueMap.get(existingKey)!;
        // Keep the one with the higher match score
        if (candidate.matchScore > existing.matchScore) {
          uniqueMap.set(existingKey, candidate);
        }
      } else {
        // Not a duplicate, add to map
        uniqueMap.set(compositeKey, candidate);
      }
    }

    const cleanedMatches = Array.from(uniqueMap.values()).sort(
      (a, b) => b.matchScore - a.matchScore
    );

    const removedCount = matches.length - cleanedMatches.length;

    if (removedCount === 0) {
      toast({
        title: 'No Duplicates Found',
        description: 'All candidates in the results are unique',
      });
    } else {
      setMatches(cleanedMatches);
      setCurrentPage(1);
      toast({
        title: 'Duplicates Removed',
        description: `Removed ${removedCount} duplicate ${removedCount === 1 ? 'candidate' : 'candidates'}`,
      });
    }
  };

  const autoSelectJobTitles = async () => {
    if (!jobDescription.trim()) {
      toast({
        title: 'Missing Job Description',
        description: 'Please enter a job description first',
        variant: 'destructive',
      });
      return;
    }

    if (availableJobTitles.length === 0) {
      toast({
        title: 'No Job Titles',
        description: 'No job titles available to select from',
        variant: 'destructive',
      });
      return;
    }

    setIsAutoSelecting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('suggest-job-titles', {
        body: {
          jobDescription,
          availableTitles: availableJobTitles,
        },
      });

      if (error) throw error;

      const { suggestedTitles } = data;

      if (suggestedTitles && suggestedTitles.length > 0) {
        setSelectedJobTitles(suggestedTitles);
        toast({
          title: 'Auto-Selected Job Titles',
          description: `Selected ${suggestedTitles.length} relevant ${suggestedTitles.length === 1 ? 'title' : 'titles'}`,
        });
      } else {
        toast({
          title: 'No Matches Found',
          description: 'AI could not find relevant job titles for this description',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error auto-selecting job titles:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to auto-select job titles';
      toast({
        title: 'Auto-Selection Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsAutoSelecting(false);
    }
  };

  const enhanceDescription = async () => {
    if (!jobDescription.trim()) {
      toast({
        title: 'Missing Job Description',
        description: 'Please enter a job description first',
        variant: 'destructive',
      });
      return;
    }

    setIsEnhancing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('enhance-description', {
        body: {
          jobDescription,
        },
      });

      if (error) throw error;

      const { enhancedDescription } = data;

      if (enhancedDescription) {
        setJobDescription(enhancedDescription);
        toast({
          title: 'Description Enhanced',
          description: 'AI has improved your job description',
        });
      } else {
        throw new Error('No enhanced description received');
      }
    } catch (error) {
      console.error('Error enhancing description:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to enhance description';
      toast({
        title: 'Enhancement Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleCancelSearch = () => {
    setIsCancelled(true);
    abortControllerRef.current?.abort();
    addLog('info', 'Search cancelled by user');
    setSearchStatus('Search cancelled');
  };

  const addLog = (level: 'info' | 'error' | 'success', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setProcessingLogs(prev => [...prev, { timestamp, level, message }]);
  };

  const mergeMatches = (existing: CandidateMatch[], incoming: CandidateMatch[]): CandidateMatch[] => {
    const map = new Map<string, CandidateMatch>();

    for (const match of existing) {
      map.set(match.id, match);
    }

    for (const match of incoming) {
      const current = map.get(match.id);
      if (!current || (typeof match.matchScore === 'number' && match.matchScore > current.matchScore)) {
        map.set(match.id, match);
      }
    }

    // Sort by matchScore descending (highest match first)
    return Array.from(map.values()).sort((a, b) => b.matchScore - a.matchScore);
  };

  const runMatchingChunk = async (
    accessToken: string,
    candidateIds: string[],
    batchIndex: number,
    totalBatches: number
  ): Promise<MatchChunkResult> => {
    addLog('info', `Starting batch ${batchIndex + 1}/${totalBatches} with ${candidateIds.length} candidates...`);
    setSearchStatus(`Processing batch ${batchIndex + 1} of ${totalBatches}...`);

    const response = await fetch(
      'https://olkbhjyfpdvcovtuekzt.supabase.co/functions/v1/match-candidates',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ jobDescription, candidateIds }),
        signal: abortControllerRef.current?.signal,
      }
    );

    if (!response.ok || !response.body) {
      throw new Error('Failed to start processing');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData: any = null;
    let currentEvent = '';
    let collectedMatches: CandidateMatch[] = [];
    let errorMessage: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;

        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          const data = JSON.parse(line.slice(5).trim());

          if (currentEvent === 'complete' && data.matches) {
            console.log('[SSE] Received complete event with', data.matches.length, 'matches for batch', batchIndex + 1);
            finalData = data;
            currentEvent = '';
            continue;
          }

          if (currentEvent === 'partial' && data.matches) {
            const newMatches = data.matches as CandidateMatch[];
            collectedMatches = mergeMatches(collectedMatches, newMatches);

            const processed = typeof data.processed === 'number' ? data.processed : collectedMatches.length;
            const total = typeof data.total === 'number' && data.total > 0 ? data.total : candidateIds.length;
            const progress = Math.round((processed / total) * 100);
            setSearchProgress(progress);

            addLog('info', `Received partial results: ${collectedMatches.length} candidates processed so far...`);
            currentEvent = '';
            continue;
          }

          if (currentEvent === 'error') {
            console.error('[SSE] Error event:', data.message);
            errorMessage = data.message || 'Processing failed';
            addLog('error', errorMessage);
            setSearchStatus('Error during processing - attempting to use partial results...');
            currentEvent = '';
            continue;
          }

          if (currentEvent) {
            currentEvent = '';
          }

          if (data.level && data.message) {
            if (typeof data.processed === 'number' && typeof data.total === 'number' && data.total > 0) {
              const progress = Math.round((data.processed / data.total) * 100);
              setSearchProgress(progress);
            }

            const message: string = data.message;

            if (
              message.includes('API KEY') ||
              message.includes('API key') ||
              message.includes('GEMINI_API_KEY') ||
              message.includes('API Response structure') ||
              message.includes('Calling Gemini API') ||
              message.includes('attempt') ||
              message.match(/Batch \d+\/\d+: Analyzing/i) ||
              (message.includes('Analyzing') && message.includes('candidates with'))
            ) {
              continue;
            }

            if (message.includes('Created') && message.includes('batches')) {
              continue;
            }

            addLog(data.level, message);
            if (!message.toLowerCase().includes('complete')) {
              setSearchStatus(message);
            }
          }

          if (data.message && !data.level) {
            if (data.message.includes('error') || data.message.includes('failed')) {
              throw new Error(data.message);
            }
          }
        }
      }
    }

    console.log('[SSE] Batch stream ended. finalData:', finalData ? 'present' : 'missing');

    const effectiveData = finalData || (collectedMatches.length
      ? {
          matches: collectedMatches,
          processed: collectedMatches.length,
          total: candidateIds.length,
          partial: true,
        }
      : null);

    if (!effectiveData || !effectiveData.matches) {
      throw new Error(errorMessage || 'No results received from matching process');
    }

    const matches: CandidateMatch[] = effectiveData.matches;
    const totalInChunk = effectiveData.total || matches.length;
    const processed = effectiveData.processed || matches.length;

    if ((effectiveData as any).partial) {
      addLog('info', `Batch ${batchIndex + 1}/${totalBatches}: analyzed ${processed} of ${totalInChunk} candidates (partial due to system limits).`);
    } else {
      addLog('success', `Batch ${batchIndex + 1}/${totalBatches} complete: ${matches.length} candidates analyzed.`);
    }

    return { matches, processed, totalInChunk };
  };

  const handleSearch = async () => {
    if (!jobDescription.trim()) {
      toast({
        title: 'Job Description Required',
        description: 'Please enter a job description to find matching candidates',
        variant: 'destructive',
      });
      return;
    }

    // Reset state
    setSearching(true);
    setSearchProgress(0);
    setSearchStatus('Initializing search...');
    setProcessingLogs([]);
    setShowLogsDialog(true);
    setProcessingComplete(false);
    setProcessingError(false);
    setIsCancelled(false);
    abortControllerRef.current = new AbortController();

    addLog('info', 'Booting edge functions...');
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session found');

      addLog('info', 'Fetching candidates from database...');
      setSearchStatus('Fetching candidates...');

      let query = supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id);

      // Apply time filter if selected
      if (timeFilter !== 'all') {
        if (timeFilter === 'custom' && customDateRange?.from) {
          const startDate = customDateRange.from;
          query = query.gte('created_at', startDate.toISOString());
          
          if (customDateRange.to) {
            const endDate = new Date(customDateRange.to);
            endDate.setHours(23, 59, 59, 999);
            query = query.lte('created_at', endDate.toISOString());
          }
          
          const dateRangeStr = customDateRange.to 
            ? `${startDate.toLocaleDateString()} - ${customDateRange.to.toLocaleDateString()}`
            : `from ${startDate.toLocaleDateString()}`;
          addLog('info', `Filtering candidates uploaded ${dateRangeStr}`);
        } else {
          const now = new Date();
          let cutoffDate: Date;

          switch (timeFilter) {
            case '1day':
              cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              break;
            case '3days':
              cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
              break;
            case '7days':
              cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              break;
            case '1month':
              cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              break;
            default:
              cutoffDate = new Date(0);
          }

          query = query.gte('created_at', cutoffDate.toISOString());
          addLog('info', `Filtering candidates uploaded since ${cutoffDate.toLocaleDateString()}`);
        }
      }

      // Apply job title filter if selected
      if (selectedJobTitles.length > 0) {
        query = query.in('job_title', selectedJobTitles);
      }

      const { data: profileRows, error: profilesError } = await query
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      if (!profileRows || profileRows.length === 0) {
        addLog('info', 'No candidates found in database');
        setSearchStatus('No candidates found');
        setProcessingComplete(true);
        setSearching(false);
        toast({
          title: 'No Candidates Found',
          description: 'Please upload resumes before running a search.',
        });
        return;
      }

      const totalCandidatesFound = profileRows.length;
      addLog('success', `Found ${totalCandidatesFound} candidates in your database`);
      setSearchStatus(`Analyzing ${totalCandidatesFound} candidates...`);

      // Send ALL candidates at once - edge function will distribute across APIs
      const candidateIds = profileRows.map((p) => p.id);

      const { matches: allMatches } = await runMatchingChunk(
        session.access_token,
        candidateIds,
        0,
        1
      );

      // Check if cancelled after matching
      if (isCancelled || abortControllerRef.current?.signal.aborted) {
        addLog('info', 'Search cancelled before saving results');
        setSearchStatus('Search cancelled');
        setProcessingComplete(true);
        toast({
          title: 'Search Cancelled',
          description: 'Candidate matching was cancelled',
        });
        return;
      }

      if (allMatches.length === 0) {
        throw new Error('No results received from matching process');
      }

      setSearchProgress(100);
      addLog('success', `Successfully matched ${allMatches.length} candidates`);
      console.log('Received matches from edge function:', allMatches.length);

      // Save search to database
      addLog('info', 'Saving search to database...');
      setSearchStatus('Saving search results...');

      const { data: searchData, error: searchError } = await supabase
        .from('job_searches')
        .insert({
          user_id: user.id,
          job_description: jobDescription,
          total_candidates: totalCandidatesFound,
        })
        .select()
        .single();

      if (searchError) {
        addLog('error', `Database error: ${searchError.message}`);
        throw searchError;
      }

      addLog('success', `Search saved with ID: ${searchData.id}`);

      // Save all candidate matches
      const candidateRecords = allMatches.map((match: CandidateMatch) => ({
        search_id: searchData.id,
        candidate_id: match.id,
        candidate_name: match.full_name,
        candidate_email: match.email,
        candidate_phone: match.phone_number,
        candidate_location: match.location,
        job_role: match.job_title,
        experience_years: match.years_of_experience !== null
          ? Math.round(match.years_of_experience)
          : null,
        match_score: Math.round(match.matchScore),
        reasoning: match.reasoning,
        key_strengths: match.strengths || [],
        potential_concerns: match.concerns || [],
      }));

      addLog('info', `Saving ${candidateRecords.length} candidate records...`);

      const { error: candidatesError } = await supabase
        .from('candidate_matches')
        .insert(candidateRecords);

      if (candidatesError) {
        addLog('error', `Error saving candidates: ${candidatesError.message}`);
        throw candidatesError;
      }

      addLog('success', 'All candidate records saved successfully');
      setSearchProgress(100);
      setSearchStatus('Search completed successfully');
      setProcessingComplete(true);

      // Sort matches by score descending to ensure highest matches appear first
      const sortedMatches = [...allMatches].sort((a, b) => b.matchScore - a.matchScore);
      setMatches(sortedMatches);
      setTotalCandidates(totalCandidatesFound);
      setCurrentSearchId(searchData.id);
      setCurrentPage(1);

      toast({
        title: 'Search Complete!',
        description: `Found ${allMatches.length} matching candidates`,
      });
    } catch (error) {
      console.error('Search error:', error);
      
      // Check if it was an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        addLog('info', 'Search cancelled by user');
        setSearchStatus('Search cancelled');
        setProcessingComplete(true);
        toast({
          title: 'Search Cancelled',
          description: 'Candidate matching was cancelled',
        });
      } else {
        setProcessingError(true);
        addLog('error', error instanceof Error ? error.message : 'Unknown error occurred');
        toast({
          title: 'Search Failed',
          description: error instanceof Error ? error.message : 'Failed to search candidates',
          variant: 'destructive',
        });
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-gradient-to-br from-card/90 to-secondary/10 backdrop-blur-sm border border-primary/20 shadow-[var(--shadow-elegant)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-secondary/20 to-primary/20 rounded-lg ring-2 ring-secondary/30 shadow-[var(--shadow-glow)]">
              <Sparkles className="h-6 w-6 text-secondary animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">AI-Powered Candidate Matching</h3>
              <p className="text-sm text-muted-foreground">Describe your ideal candidate and let AI find the best matches</p>
            </div>
          </div>

          <div className="space-y-3 p-4 bg-secondary/5 rounded-lg border border-primary/10">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h4 className="font-semibold text-foreground">Filter by Upload Date (Optional)</h4>
            </div>
            <p className="text-sm text-muted-foreground">Match only candidates whose resumes were uploaded within a specific time period</p>
            <Select value={timeFilter} onValueChange={(value) => {
              setTimeFilter(value);
              if (value !== 'custom') {
                setCustomDateRange(undefined);
              }
            }}>
              <SelectTrigger className="w-full bg-background/50">
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time (Default)</SelectItem>
                <SelectItem value="1day">Past 24 Hours</SelectItem>
                <SelectItem value="3days">Past 3 Days</SelectItem>
                <SelectItem value="7days">Past 7 Days</SelectItem>
                <SelectItem value="1month">Past Month</SelectItem>
                <SelectItem value="custom">Custom Date Range</SelectItem>
              </SelectContent>
            </Select>

            {timeFilter === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-background/50",
                      !customDateRange && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {customDateRange?.from ? (
                      customDateRange.to ? (
                        <>
                          {format(customDateRange.from, "PPP")} - {format(customDateRange.to, "PPP")}
                        </>
                      ) : (
                        format(customDateRange.from, "PPP")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={customDateRange}
                    onSelect={setCustomDateRange}
                    numberOfMonths={2}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}

            {filteredCandidateCount !== null && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                <span className="text-sm font-medium text-foreground">
                  Candidates matching current filters:
                </span>
                <Badge variant="secondary" className="text-base font-bold">
                  {loadingCount ? '...' : filteredCandidateCount}
                </Badge>
              </div>
            )}
          </div>

          {availableJobTitles.length > 0 && (
            <div className="space-y-3 p-4 bg-secondary/5 rounded-lg border border-primary/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Filter by Job Title (Optional)</h4>
                </div>
                <Button
                  onClick={autoSelectJobTitles}
                  disabled={isAutoSelecting || !jobDescription.trim() || availableJobTitles.length === 0}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-gradient-to-r from-primary/10 to-primary/20 hover:from-primary/20 hover:to-primary/30 border-primary/30"
                >
                  <Sparkles className="h-3 w-3" />
                  {isAutoSelecting ? 'Auto-Selecting...' : 'Auto-Select'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Select specific job titles to reduce processing time and improve relevance, or use Auto-Select to let AI choose</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[200px] overflow-y-auto">
                {availableJobTitles.map((title) => (
                  <div key={title} className="flex items-center space-x-2">
                    <Checkbox
                      id={`job-${title}`}
                      checked={selectedJobTitles.includes(title)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedJobTitles([...selectedJobTitles, title]);
                        } else {
                          setSelectedJobTitles(selectedJobTitles.filter(t => t !== title));
                        }
                      }}
                    />
                    <Label 
                      htmlFor={`job-${title}`}
                      className="text-sm font-medium cursor-pointer hover:text-primary transition-colors"
                    >
                      {title}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedJobTitles.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <span className="text-sm font-medium text-muted-foreground">Selected:</span>
                  {selectedJobTitles.map((title) => (
                    <Badge key={title} variant="secondary" className="gap-1">
                      {title}
                      <X 
                        className="h-3 w-3 cursor-pointer hover:text-destructive" 
                        onClick={() => setSelectedJobTitles(selectedJobTitles.filter(t => t !== title))}
                      />
                    </Badge>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedJobTitles([])}
                    className="h-6 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Job Description</Label>
              <Button
                onClick={enhanceDescription}
                disabled={isEnhancing || !jobDescription.trim()}
                variant="outline"
                size="sm"
                className="flex items-center gap-2 bg-gradient-to-r from-secondary/10 to-accent/10 hover:from-secondary/20 hover:to-accent/20 border-secondary/30"
              >
                <Sparkles className="h-3 w-3" />
                {isEnhancing ? 'Enhancing...' : 'Enhance with AI'}
              </Button>
            </div>
            <Textarea
              placeholder="Enter job description including required skills, experience, qualifications, and any specific requirements..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              className="min-h-[100px] resize-none text-sm"
            />
          </div>

          <Button
            onClick={handleSearch}
            disabled={searching || !jobDescription.trim()}
            className="w-full h-10 text-sm font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-[var(--shadow-elegant)] hover:shadow-[var(--shadow-premium)] hover:scale-105 transition-all duration-300"
          >
            {searching ? (
              <>
                <Search className="mr-2 h-5 w-5 animate-pulse" />
                Analyzing Candidates...
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Find All Matching Candidates
              </>
            )}
          </Button>

          {searching && searchProgress > 0 && (
            <div className="space-y-2 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">{searchStatus}</span>
                <span className="text-primary font-bold">{searchProgress}%</span>
              </div>
              <div className="w-full h-3 bg-secondary/30 rounded-full overflow-hidden backdrop-blur-sm">
                <div 
                  className="h-full bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%] animate-[shimmer_2s_infinite] transition-all duration-500 ease-out rounded-full shadow-[0_0_10px_var(--primary)]"
                  style={{ width: `${searchProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {matches.length > 0 && (() => {
        const filteredMatches = showBookmarkedOnly 
          ? matches.filter(m => m.email && bookmarkedEmails.has(m.email.toLowerCase().trim()))
          : matches;
        const totalPages = Math.ceil(filteredMatches.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentMatches = filteredMatches.slice(startIndex, endIndex);
        
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Award className="h-6 w-6 text-primary" />
                  Ranked Candidates ({filteredMatches.length} {showBookmarkedOnly ? 'bookmarked' : `of ${totalCandidates}`})
                </h3>
                <Button
                  onClick={() => {
                    setShowBookmarkedOnly(!showBookmarkedOnly);
                    setCurrentPage(1);
                  }}
                  variant={showBookmarkedOnly ? "default" : "outline"}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Bookmark className={`h-4 w-4 ${showBookmarkedOnly ? 'fill-current' : ''}`} />
                  {showBookmarkedOnly ? 'Show All' : 'Bookmarked Only'}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={cleanDuplicates}
                  variant="outline"
                  className="flex items-center gap-2 bg-accent/5 hover:bg-accent hover:text-accent-foreground border-accent/30 hover:border-accent transition-all duration-300"
                >
                  <Trash2 className="h-4 w-4" />
                  Clean Duplicates
                </Button>
                <Button
                  onClick={exportToExcel}
                  variant="outline"
                  className="flex items-center gap-2 bg-primary/5 hover:bg-primary hover:text-primary-foreground border-primary/30 hover:border-primary transition-all duration-300"
                >
                  <Download className="h-4 w-4" />
                  Export to Excel
                </Button>
                <Button
                  onClick={handleClearResults}
                  variant="outline"
                  className="flex items-center gap-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all duration-300"
                >
                  <X className="h-4 w-4" />
                  Clear Results
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              {currentMatches.map((candidate, index) => {
                const globalIndex = startIndex + index;
                return (
                <Card key={candidate.id} className="p-4 hover:shadow-[var(--shadow-premium)] hover:scale-[1.02] transition-all duration-300 bg-card/90 backdrop-blur-sm border border-primary/20 animate-fade-in">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold text-lg shadow-lg">
                        #{globalIndex + 1}
                      </div>
                    <div>
                      <h4 className="text-lg font-bold text-foreground">{candidate.full_name}</h4>
                      {candidate.job_title && (
                        <p className="text-sm text-muted-foreground font-medium">{candidate.job_title}</p>
                      )}
                      {candidate.years_of_experience && (
                        <p className="text-xs text-muted-foreground">{candidate.years_of_experience} years experience</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={candidate.matchScore >= 80 ? "default" : candidate.matchScore >= 60 ? "secondary" : "outline"}
                      className="text-sm px-3 py-1 font-bold"
                    >
                      {candidate.matchScore}% Match
                    </Badge>
                    <Button
                      onClick={() => toggleBookmark(candidate)}
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      title={candidate.email && bookmarkedEmails.has(candidate.email.toLowerCase().trim()) ? "Remove bookmark" : "Bookmark candidate"}
                    >
                      <Bookmark 
                        className={`h-5 w-5 transition-all ${
                          candidate.email && bookmarkedEmails.has(candidate.email.toLowerCase().trim())
                            ? 'fill-primary text-primary' 
                            : 'text-muted-foreground hover:text-primary'
                        }`}
                      />
                    </Button>
                  </div>
                </div>

                {/* Contact Information - Highlighted Section */}
                {(candidate.email || candidate.phone_number || candidate.location) && (
                  <div className="mb-3 p-3 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg border-2 border-primary/20">
                    <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                      📇 Contact Information
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {candidate.email && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">📧</span>
                          <a href={`mailto:${candidate.email}`} className="text-primary hover:underline font-medium">
                            {candidate.email}
                          </a>
                        </div>
                      )}
                      {candidate.phone_number && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">📞</span>
                          <a href={`tel:${candidate.phone_number}`} className="text-primary hover:underline font-medium">
                            {candidate.phone_number}
                          </a>
                        </div>
                      )}
                      {candidate.location && (
                        <div className="flex items-center gap-2 col-span-full">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground font-medium">{candidate.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-muted-foreground mb-2">Why This Match?</p>
                    <p className="text-sm bg-muted/50 p-3 rounded-lg leading-relaxed">{candidate.reasoning}</p>
                  </div>

                  {candidate.strengths.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-muted-foreground mb-2">Key Strengths</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.strengths.map((strength, i) => (
                          <Badge key={i} variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 font-medium text-xs px-2 py-0.5">
                            ✓ {strength}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {candidate.concerns.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-muted-foreground mb-2">Potential Concerns</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.concerns.map((concern, i) => (
                          <Badge key={i} variant="outline" className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300 font-medium text-xs px-2 py-0.5">
                            ⚠ {concern}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {candidate.resume_file_url && (
                    <div className="pt-4 border-t">
                      <a 
                        href={candidate.resume_file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-2 font-medium"
                      >
                        📄 View Full Resume
                      </a>
                    </div>
                  )}
                </div>
              </Card>
            );
            })}
          </div>

          {totalPages > 1 && (
            <Pagination className="mt-6">
              <PaginationContent className="flex-wrap">
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                
                {(() => {
                  const pages = [];
                  const showMax = 7;
                  
                  if (totalPages <= showMax) {
                    for (let i = 1; i <= totalPages; i++) {
                      pages.push(i);
                    }
                  } else {
                    pages.push(1);
                    
                    if (currentPage > 3) {
                      pages.push('ellipsis-start');
                    }
                    
                    const start = Math.max(2, currentPage - 1);
                    const end = Math.min(totalPages - 1, currentPage + 1);
                    
                    for (let i = start; i <= end; i++) {
                      pages.push(i);
                    }
                    
                    if (currentPage < totalPages - 2) {
                      pages.push('ellipsis-end');
                    }
                    
                    pages.push(totalPages);
                  }
                  
                  return pages.map((page, idx) => {
                    if (typeof page === 'string') {
                      return (
                        <PaginationItem key={page}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  });
                })()}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      );
      })()}

      <ProcessingLogsDialog
        open={showLogsDialog}
        logs={processingLogs}
        progress={searchProgress}
        status={searchStatus}
        isComplete={processingComplete}
        hasError={processingError}
        onClose={() => {
          setShowLogsDialog(false);
          setProcessingComplete(false);
          setProcessingError(false);
        }}
        onCancel={searching ? handleCancelSearch : undefined}
      />
    </div>
  );
};