import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import adiGazeLogo from '@/assets/adigaze-logo.png';
import supporterSadiaSaad from '@/assets/supporter-sadia-saad.jpeg';
import supporterKomalWaheed from '@/assets/supporter-komal-waheed.jpeg';
import supporterMahnoorJaveed from '@/assets/supporter-mahnoor-javeed.jpeg';
import { Loader2, Heart, Linkedin, Shield, Smartphone, Lock, CheckCircle2 } from 'lucide-react';
import Footer from '@/components/Footer';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';

// Trust device for 3 days (in milliseconds)
const TRUST_DURATION = 3 * 24 * 60 * 60 * 1000;

const getTrustedDeviceKey = (userId: string) => `trusted_device_${userId}`;

const isDeviceTrusted = (userId: string): boolean => {
  try {
    const key = getTrustedDeviceKey(userId);
    const trustedUntil = localStorage.getItem(key);
    if (!trustedUntil) return false;
    return Date.now() < parseInt(trustedUntil, 10);
  } catch {
    return false;
  }
};

const trustDevice = (userId: string) => {
  const key = getTrustedDeviceKey(userId);
  const trustedUntil = Date.now() + TRUST_DURATION;
  localStorage.setItem(key, trustedUntil.toString());
};

const removeTrustedDevice = (userId: string) => {
  const key = getTrustedDeviceKey(userId);
  localStorage.removeItem(key);
};

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [trustThisDevice, setTrustThisDevice] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { signIn, signUp, signInWithGoogle, user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  const supporters = [
    {
      name: "Sadia Saad",
      image: supporterSadiaSaad,
      role: "Speridian Technologies",
      position: "Associate Business Analyst · Full-time",
      testimonial: "A great initiative that will transform recruitment processes",
      initials: "SS",
      linkedin: "https://www.linkedin.com/in/sadia-saad/"
    },
    {
      name: "Komal Waheed",
      image: supporterKomalWaheed,
      role: "UNFPRA",
      position: "Partnership Developer and Consultant",
      testimonial: "Inspiring work that empowers organizations to find the right talent",
      initials: "KW",
      linkedin: "https://www.linkedin.com/in/komal-waheed/"
    },
    {
      name: "Mahnoor Javeed",
      image: supporterMahnoorJaveed,
      role: "Airbosoft",
      position: "HR and Talent Management Executive · Full-time",
      testimonial: "Supporting innovative solutions that revolutionize talent acquisition",
      initials: "MJ",
      linkedin: "https://www.linkedin.com/in/mahnoor-jawed-48628b17b/"
    }
  ];

  useEffect(() => {
    // Only redirect if user exists AND we're not waiting for 2FA verification AND not checking auth
    if (user && !requires2FA && !isCheckingAuth) {
      navigate('/');
    }
  }, [user, navigate, requires2FA, isCheckingAuth]);

  const check2FAStatus = async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('totp-auth', {
        body: { action: 'status' },
      });

      if (error) throw error;
      return data?.enabled === true;
    } catch (err) {
      console.error('Error checking 2FA status:', err);
      return false;
    }
  };

  const verify2FACode = async () => {
    if (!totpCode || totpCode.length !== 6) {
      toast({ title: 'Error', description: 'Please enter a valid 6-digit code', variant: 'destructive' });
      return;
    }

    setIsVerifying2FA(true);
    try {
      const { data, error } = await supabase.functions.invoke('totp-auth', {
        body: { action: 'verify', token: totpCode },
      });

      if (error) throw error;

      if (data?.valid) {
        // Trust device if checkbox is checked
        if (trustThisDevice && currentUserId) {
          trustDevice(currentUserId);
          toast({ 
            title: 'Device Trusted', 
            description: 'This device will be trusted for 3 days' 
          });
        } else {
          toast({ title: 'Success', description: '2FA verification successful' });
        }
        setRequires2FA(false);
        setIsCheckingAuth(false);
        setTrustThisDevice(false);
        navigate('/');
      } else {
        toast({ title: 'Error', description: 'Invalid verification code', variant: 'destructive' });
        setTotpCode('');
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Verification failed', variant: 'destructive' });
      setTotpCode('');
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleCancel2FA = async () => {
    await signOut();
    setRequires2FA(false);
    setPendingUserId(null);
    setTotpCode('');
    setIsCheckingAuth(false);
    setTrustThisDevice(false);
    setCurrentUserId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (isLogin) {
      // Block navigation while we check 2FA
      setIsCheckingAuth(true);
      
      const { error } = await signIn(email, password);
      
      if (!error) {
        // Small delay to ensure session is ready
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Get the current user ID
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const userId = currentUser?.id;
        
        if (userId) {
          setCurrentUserId(userId);
          
          // Check if this device is trusted
          if (isDeviceTrusted(userId)) {
            // Device is trusted, skip 2FA
            setIsCheckingAuth(false);
            setIsSubmitting(false);
            return;
          }
        }
        
        // Check if 2FA is enabled for this user
        const has2FA = await check2FAStatus(email);
        if (has2FA) {
          setRequires2FA(true);
          setIsSubmitting(false);
          // Keep isCheckingAuth true to prevent navigation
          return;
        }
        // If no 2FA, allow navigation
        setIsCheckingAuth(false);
      } else {
        setIsCheckingAuth(false);
      }
    } else {
      await signUp(email, password, fullName);
    }

    setIsSubmitting(false);
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    await signInWithGoogle();
    // Keep loading state as user will be redirected
  };

  // 2FA Verification Screen
  if (requires2FA) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20">
          <div className="absolute inset-0 bg-mesh" />
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-float-delayed" />
        </div>
        
        <div className="flex-1 flex items-center justify-center p-4 relative z-10">
          <div className="w-full max-w-md animate-fade-in">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
                <img src={adiGazeLogo} alt="AdiGaze Logo" className="h-24 md:h-32 w-auto relative z-10 drop-shadow-2xl" />
              </div>
            </div>

            <Card className="shadow-[var(--shadow-premium)] backdrop-blur-sm bg-card/95 border-primary/20 overflow-hidden">
              {/* Decorative top bar */}
              <div className="h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />
              
              <CardHeader className="text-center pb-4 pt-6">
                <div className="mx-auto mb-4 relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                  <div className="relative p-4 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full border border-primary/30">
                    <Shield className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <CardTitle className="text-2xl font-bold">Verify Your Identity</CardTitle>
                <CardDescription className="text-base mt-2">
                  Enter the 6-digit code from your authenticator app
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6 px-6">
                {/* Security info badge */}
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-muted/50 rounded-lg border border-border/50">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Secured with end-to-end encryption</span>
                </div>
                
                {/* OTP Input with improved styling */}
                <div className="flex flex-col items-center gap-4">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={setTotpCode}
                    onComplete={verify2FACode}
                    className="gap-2"
                  >
                    <InputOTPGroup className="gap-2">
                      <InputOTPSlot index={0} className="w-12 h-14 text-xl font-semibold rounded-lg border-2 border-border focus:border-primary" />
                      <InputOTPSlot index={1} className="w-12 h-14 text-xl font-semibold rounded-lg border-2 border-border focus:border-primary" />
                      <InputOTPSlot index={2} className="w-12 h-14 text-xl font-semibold rounded-lg border-2 border-border focus:border-primary" />
                    </InputOTPGroup>
                    <InputOTPSeparator className="text-muted-foreground">
                      <span className="px-1">-</span>
                    </InputOTPSeparator>
                    <InputOTPGroup className="gap-2">
                      <InputOTPSlot index={3} className="w-12 h-14 text-xl font-semibold rounded-lg border-2 border-border focus:border-primary" />
                      <InputOTPSlot index={4} className="w-12 h-14 text-xl font-semibold rounded-lg border-2 border-border focus:border-primary" />
                      <InputOTPSlot index={5} className="w-12 h-14 text-xl font-semibold rounded-lg border-2 border-border focus:border-primary" />
                    </InputOTPGroup>
                  </InputOTP>
                  
                  {/* Code entered indicator */}
                  <div className="flex items-center gap-1.5">
                    {[...Array(6)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                          i < totpCode.length ? 'bg-primary scale-110' : 'bg-border'
                        }`} 
                      />
                    ))}
                  </div>
                </div>

                {/* Trust device option */}
                <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                  <Checkbox
                    id="trust-device"
                    checked={trustThisDevice}
                    onCheckedChange={(checked) => setTrustThisDevice(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label 
                      htmlFor="trust-device" 
                      className="text-sm font-medium cursor-pointer flex items-center gap-2"
                    >
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      Trust this device for 3 days
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Skip 2FA verification on this device for the next 3 days
                    </p>
                  </div>
                </div>
              </CardContent>
              
              <CardFooter className="flex flex-col gap-3 px-6 pb-6">
                <Button
                  onClick={verify2FACode}
                  className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-base font-medium"
                  disabled={isVerifying2FA || totpCode.length !== 6}
                >
                  {isVerifying2FA ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : totpCode.length === 6 ? (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Verify & Continue
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-5 w-5" />
                      Enter Code to Continue
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleCancel2FA}
                  className="w-full text-muted-foreground hover:text-foreground"
                >
                  Cancel & Sign Out
                </Button>
              </CardFooter>
            </Card>
            
            {/* Help text */}
            <p className="text-center text-xs text-muted-foreground mt-4">
              Having trouble? Contact support or use a backup code
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="absolute inset-0 bg-mesh" />
        
        {/* Floating Orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-accent/20 rounded-full blur-3xl animate-pulse-glow" />
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
            <img src={adiGazeLogo} alt="AdiGaze Logo" className="h-32 md:h-40 w-auto relative z-10 drop-shadow-2xl" />
          </div>
        </div>

        <Card className="shadow-[var(--shadow-premium)] backdrop-blur-sm bg-card/95 border-primary/20 hover:shadow-[var(--shadow-glow)] transition-all duration-300">
          <Tabs value={isLogin ? 'login' : 'signup'} onValueChange={(v) => setIsLogin(v === 'login')}>
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Login
                </TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  Sign Up
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-3">
                <TabsContent value="login" className="space-y-3 mt-0">
                  <div className="space-y-1.5 animate-slide-in-left">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5 animate-slide-in-left" style={{ animationDelay: '0.1s' }}>
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </TabsContent>

                <TabsContent value="signup" className="space-y-3 mt-0">
                  <div className="space-y-1.5 animate-slide-in-right">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Adil Munawar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={!isLogin}
                    />
                  </div>
                  <div className="space-y-1.5 animate-slide-in-right" style={{ animationDelay: '0.1s' }}>
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Adil@Nexus.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5 animate-slide-in-right" style={{ animationDelay: '0.2s' }}>
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </TabsContent>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button 
                  type="submit" 
                  className="w-full h-10 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                  disabled={isSubmitting || isGoogleLoading}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Please wait
                    </>
                  ) : (
                    isLogin ? 'Sign In' : 'Create Account'
                  )}
                </Button>

                <div className="relative w-full">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 gap-2 border-border/50 hover:border-primary/50 hover:bg-accent/50"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting || isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Redirecting to Google...
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-3">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>

        {/* Supporters Section */}
        <Card className="mt-6 shadow-[var(--shadow-card)] backdrop-blur-sm bg-card/95 border-primary/10">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-center justify-center text-base">
              <Heart className="h-4 w-4 text-primary fill-primary" />
              Supporting Adil Munawar&apos;s Vision
            </CardTitle>
            <CardDescription className="text-center text-xs">
              Dedicated supporters making AdiGaze possible
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[autoplayPlugin.current]}
              className="w-full max-w-md mx-auto"
              onMouseEnter={autoplayPlugin.current.stop}
              onMouseLeave={autoplayPlugin.current.reset}
            >
              <CarouselContent>
                {supporters.map((supporter, index) => (
                  <CarouselItem key={index}>
                    <div className="flex flex-col items-center space-y-3 p-3">
                      <Avatar className="h-20 w-20 border-2 border-primary/20">
                        <AvatarImage src={supporter.image} alt={supporter.name} />
                        <AvatarFallback>{supporter.initials}</AvatarFallback>
                      </Avatar>
                      <div className="text-center space-y-1.5">
                        <h3 className="font-semibold text-base">{supporter.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {supporter.role}<br />
                          {supporter.position}
                        </p>
                        <p className="text-xs italic text-foreground/80 max-w-md">
                          &quot;{supporter.testimonial}&quot;
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Support: Not disclosed
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1.5 h-8 text-xs"
                          onClick={() => window.open(supporter.linkedin, '_blank')}
                        >
                          <Linkedin className="h-3 w-3 mr-1.5" />
                          View LinkedIn Profile
                        </Button>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-0" />
              <CarouselNext className="right-0" />
            </Carousel>
          </CardContent>
        </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Auth;
