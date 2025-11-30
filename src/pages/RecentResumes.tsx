import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FileText, ExternalLink, Clock, Loader2, Upload, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import Footer from '@/components/Footer';
import { UploadDateFilter, type UploadDateFilterValue } from '@/components/UploadDateFilter';
import AppSidebarLayout from '@/components/AppSidebarLayout';

interface Resume {
  id: string;
  full_name: string;
  resume_file_url: string | null;
  created_at: string;
  job_title: string | null;
  email: string | null;
  phone_number: string | null;
  location: string | null;
  source: string;
}

const ITEMS_PER_PAGE = 10;

const RecentResumes = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDateFilter, setUploadDateFilter] = useState<UploadDateFilterValue>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // Reset to page 1 when filter changes
    setCurrentPage(1);
  }, [uploadDateFilter, sourceFilter]);

  useEffect(() => {
    if (!user) return;

    const fetchRecentResumes = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('profiles')
          .select('id, full_name, resume_file_url, created_at, job_title, email, phone_number, location, source', { count: 'exact' })
          .eq('user_id', user.id)
          .not('resume_file_url', 'is', null);

        if (uploadDateFilter !== 'all') {
          const now = new Date();
          const from = new Date(now);

          if (uploadDateFilter === '24h') {
            from.setDate(now.getDate() - 1);
          } else if (uploadDateFilter === '3d') {
            from.setDate(now.getDate() - 3);
          } else if (uploadDateFilter === '7d') {
            from.setDate(now.getDate() - 7);
          } else if (uploadDateFilter === '30d') {
            from.setDate(now.getDate() - 30);
          }

          query = query.gte('created_at', from.toISOString());
        }

        // Apply source filter
        if (sourceFilter !== 'all') {
          query = query.eq('source', sourceFilter);
        }

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        setResumes(data || []);
        setTotalCount(count || 0);
      } catch (error) {
        console.error('Error fetching recent resumes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentResumes();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('recent-resumes-page-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchRecentResumes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, uploadDateFilter, sourceFilter, currentPage]);

  const handleViewResume = (url: string) => {
    window.open(url, '_blank');
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (authLoading || loading) {
    return (
      <AppSidebarLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppSidebarLayout>
    );
  }

  if (!user) {
    return null;
  }

  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalCount);

  return (
    <AppSidebarLayout>
      <div className="animate-fade-in flex flex-col min-h-screen">
        <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10 flex-1">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Recent Resumes
              </h1>
            </div>
            <p className="text-muted-foreground">
              View all recently uploaded resumes
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap gap-4">
              <div className="w-48">
                <UploadDateFilter value={uploadDateFilter} onChange={setUploadDateFilter} />
              </div>
              <div className="w-48">
                <Label htmlFor="source-filter" className="text-sm font-medium mb-2 block">
                  Resume Source
                </Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger id="source-filter">
                    <SelectValue placeholder="All Sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="internal">
                      <div className="flex items-center gap-2">
                        <Upload className="h-3 w-3" />
                        Internal (Uploaded)
                      </div>
                    </SelectItem>
                    <SelectItem value="external">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3 w-3" />
                        External (Landing Page)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {totalCount > 0 ? (
                <>Showing {startItem}-{endItem} of {totalCount} resume(s)</>
              ) : (
                'No resumes found'
              )}
            </div>
          </div>

          {resumes.length === 0 ? (
            <Card className="bg-card/60 backdrop-blur-sm border-border/50 shadow-[var(--shadow-card)]">
              <CardContent className="py-12 text-center">
                <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg text-muted-foreground">No resumes uploaded yet</p>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="mt-4 gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Resumes
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4">
                {resumes.map((resume) => (
                  <Card
                    key={resume.id}
                    className="bg-card/60 backdrop-blur-sm border-border/50 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elegant)] transition-all duration-300 hover:border-primary/40"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="h-6 w-6 text-primary flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg truncate">
                                {resume.full_name || 'Unknown'}
                              </CardTitle>
                              {resume.source === 'external' && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-500/10 text-blue-600 border-blue-500/30">
                                  <Globe className="h-2.5 w-2.5 mr-1" />
                                  External
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {resume.job_title || 'No title specified'}
                            </p>
                          </div>
                        </div>
                        {resume.resume_file_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewResume(resume.resume_file_url!)}
                            className="flex-shrink-0 gap-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                            View Resume
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {resume.email && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="font-medium">Email:</span>
                            <span className="truncate">{resume.email}</span>
                          </div>
                        )}
                        {resume.phone_number && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="font-medium">Phone:</span>
                            <span>{resume.phone_number}</span>
                          </div>
                        )}
                        {resume.location && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="font-medium">Location:</span>
                            <span className="truncate">{resume.location}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4 flex-shrink-0" />
                          <span className="text-xs">
                            Added {formatDistanceToNow(new Date(resume.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(page => {
                        // Show first, last, current, and pages around current
                        if (page === 1 || page === totalPages) return true;
                        if (Math.abs(page - currentPage) <= 1) return true;
                        return false;
                      })
                      .map((page, index, arr) => {
                        // Add ellipsis if there's a gap
                        const showEllipsisBefore = index > 0 && page - arr[index - 1] > 1;
                        return (
                          <div key={page} className="flex items-center gap-1">
                            {showEllipsisBefore && (
                              <span className="px-2 text-muted-foreground">...</span>
                            )}
                            <Button
                              variant={currentPage === page ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => goToPage(page)}
                              className="w-9 h-9"
                            >
                              {page}
                            </Button>
                          </div>
                        );
                      })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <Footer />
      </div>
    </AppSidebarLayout>
  );
};

export default RecentResumes;
