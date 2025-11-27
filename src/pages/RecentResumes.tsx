import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, ExternalLink, ArrowLeft, Clock, Loader2, Upload } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import Footer from '@/components/Footer';

interface Resume {
  id: string;
  full_name: string;
  resume_file_url: string | null;
  created_at: string;
  job_title: string | null;
  email: string | null;
  phone_number: string | null;
  location: string | null;
}

const RecentResumes = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchRecentResumes = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, resume_file_url, created_at, job_title, email, phone_number, location')
          .eq('user_id', user.id)
          .not('resume_file_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setResumes(data || []);
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
  }, [user]);

  const handleViewResume = (url: string) => {
    window.open(url, '_blank');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen relative overflow-hidden animate-fade-in flex flex-col">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="absolute inset-0 bg-mesh" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-1/4 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl animate-float-delayed" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10 flex-1">
        <div className="mb-8">
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="gap-2 mb-6 bg-card/60 backdrop-blur-sm hover:bg-primary/10 border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>

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
                        <CardTitle className="text-lg truncate">
                          {resume.full_name || 'Unknown'}
                        </CardTitle>
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
                        className="flex-shrink-0 gap-2 hover:bg-primary/10 hover:text-primary hover:border-primary/40"
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
        )}
      </div>
      <Footer />
    </div>
  );
};

export default RecentResumes;
