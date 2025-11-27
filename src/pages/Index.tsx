import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResumeUpload } from '@/components/ResumeUpload';
import { CandidateHunting } from '@/components/CandidateHunting';
import { ApiUsageStats } from '@/components/ApiUsageStats';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Users, Upload, LogOut, Bookmark, History, Settings, Activity, Clock } from 'lucide-react';
import adiGazeLogo from '@/assets/adigaze-logo.png';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Footer from '@/components/Footer';
import { NotificationBell } from '@/components/NotificationBell';

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const loadUserProfile = async () => {
      if (user) {
        try {
          // Set name
          if (user.user_metadata?.full_name) {
            setUserName(user.user_metadata.full_name);
          } else if (user.email) {
            setUserName(user.email.split('@')[0]);
          } else {
            setUserName('User');
          }

          // Set avatar
          setAvatarUrl(user.user_metadata?.avatar_url || '');

          // Fetch from profiles table
          const { data, error } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('user_id', user.id)
            .maybeSingle();

          // Ignore errors during sign out
          if (error && !error.message.includes('JWT')) {
            console.error('Error loading profile:', error);
          }

          if (data) {
            if (data.full_name) setUserName(data.full_name);
            if (data.avatar_url) setAvatarUrl(data.avatar_url);
          }
        } catch (error) {
          // Suppress errors during sign out
          console.log('Profile load error (likely during sign out)');
        }
      }
    };

    loadUserProfile();
  }, [user]);

  if (loading) {
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
      {/* Notification Bell - Top Right Corner */}
      <div className="absolute top-4 right-4 z-50">
        <NotificationBell />
      </div>

      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="absolute inset-0 bg-mesh" />
        
        {/* Floating Orbs */}
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-1/4 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-accent/10 rounded-full blur-3xl animate-pulse-glow" />
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10 flex-1">
        <header className="mb-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center mb-6 relative group">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-glow group-hover:bg-primary/30 transition-all duration-500" />
            <img src={adiGazeLogo} alt="AdiGaze Logo" className="h-32 md:h-40 w-auto relative z-10 drop-shadow-2xl transform group-hover:scale-105 transition-transform duration-300" />
          </div>
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-4 text-muted-foreground bg-card/60 backdrop-blur-sm px-5 py-2 rounded-full border border-border/50 shadow-[var(--shadow-card)]">
              <Avatar className="h-8 w-8 border-2 border-primary/20">
                <AvatarImage src={avatarUrl} alt={userName} />
                <AvatarFallback>
                  {userName?.split(' ').map(n => n[0]).join('') || user.email?.[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">Welcome, {userName || user.email}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/settings')}
                className="gap-2 hover:bg-accent/50 transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={signOut}
                className="gap-2 hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                size="default"
                onClick={() => navigate('/bookmarks')}
                className="gap-2 bg-card/60 backdrop-blur-sm hover:bg-primary/10 border-primary/40 hover:border-primary/60 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elegant)] transition-all duration-300"
              >
                <Bookmark className="h-4 w-4" />
                My Bookmarks
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => navigate('/history')}
                className="gap-2 bg-card/60 backdrop-blur-sm hover:bg-secondary/10 border-secondary/40 hover:border-secondary/60 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elegant)] transition-all duration-300"
              >
                <History className="h-4 w-4" />
                Search History
              </Button>
            </div>
          </div>
        </header>

        <Tabs defaultValue="upload" className="space-y-10">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
            <TabsList className="grid w-full md:w-auto grid-cols-3 h-11 bg-card/60 backdrop-blur-md border border-primary/30 shadow-[var(--shadow-card)] md:min-w-[600px]">
              <TabsTrigger 
                value="upload" 
                className="gap-2 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[var(--shadow-elegant)] transition-all duration-300"
              >
                <Upload className="h-4 w-4" />
                Upload Resumes
              </TabsTrigger>
              <TabsTrigger 
                value="hunt" 
                className="gap-2 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-secondary data-[state=active]:to-accent data-[state=active]:text-primary-foreground data-[state=active]:shadow-[var(--shadow-elegant)] transition-all duration-300"
              >
                <Users className="h-4 w-4" />
                Find Candidates
              </TabsTrigger>
              <TabsTrigger 
                value="stats" 
                className="gap-2 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-accent data-[state=active]:to-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[var(--shadow-elegant)] transition-all duration-300"
              >
                <Activity className="h-4 w-4" />
                Live Stats
              </TabsTrigger>
            </TabsList>
            
            <div className="flex gap-3 w-full md:w-auto">
              <Button
                onClick={() => navigate('/candidates')}
                variant="outline"
                size="lg"
                className="gap-3 h-11 px-6 bg-card/60 backdrop-blur-sm hover:bg-accent/10 border-accent/40 hover:border-accent/60 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-premium)] transition-all duration-300 text-sm"
              >
                <Users className="h-5 w-5" />
                View All Candidates
              </Button>
              <Button
                onClick={() => navigate('/recent-resumes')}
                variant="outline"
                size="lg"
                className="gap-3 h-11 px-6 bg-card/60 backdrop-blur-sm hover:bg-secondary/10 border-secondary/40 hover:border-secondary/60 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-premium)] transition-all duration-300 text-sm"
              >
                <Clock className="h-5 w-5" />
                Recent Resumes
              </Button>
            </div>
          </div>

          <TabsContent value="upload" className="space-y-6 animate-fade-in">
            <ResumeUpload />
          </TabsContent>

          <TabsContent value="hunt" className="space-y-6 animate-fade-in">
            <CandidateHunting />
          </TabsContent>

          <TabsContent value="stats" className="space-y-6 animate-fade-in">
            <ApiUsageStats />
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
    </div>
  );
};

export default Index;
