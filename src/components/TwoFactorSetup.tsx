import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Shield, ShieldCheck, ShieldOff, Copy, Check, Loader2, AlertTriangle, Key } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export const TwoFactorSetup = () => {
  const { user } = useAuth();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);
  
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [backupCodesDialogOpen, setBackupCodesDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      checkStatus();
    }
  }, [user]);

  const checkStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('totp-auth', {
        body: { action: 'status' }
      });

      if (!error && data) {
        setIsEnabled(data.enabled);
        setIsSetup(data.setup);
      }
    } catch (error) {
      console.error('Error checking 2FA status:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSecret = async () => {
    setSetupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('totp-auth', {
        body: { action: 'generate' }
      });

      if (error) throw error;

      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      setSetupDialogOpen(true);
    } catch (error) {
      console.error('Error generating secret:', error);
      toast({
        title: "Error",
        description: "Failed to generate 2FA secret",
        variant: "destructive"
      });
    } finally {
      setSetupLoading(false);
    }
  };

  const verifyAndEnable = async () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter a 6-digit code",
        variant: "destructive"
      });
      return;
    }

    setVerifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('totp-auth', {
        body: { action: 'enable', token: verificationCode }
      });

      if (error) throw error;

      if (data.success) {
        setBackupCodes(data.backupCodes);
        setIsEnabled(true);
        setIsSetup(true);
        setSetupDialogOpen(false);
        setBackupCodesDialogOpen(true);
        setVerificationCode('');
        toast({
          title: "2FA Enabled",
          description: "Two-factor authentication is now active",
        });
      } else {
        toast({
          title: "Verification failed",
          description: data.error || "Invalid verification code",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error enabling 2FA:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to enable 2FA",
        variant: "destructive"
      });
    } finally {
      setVerifyLoading(false);
    }
  };

  const testVerification = async () => {
    if (testCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter a 6-digit code",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('totp-auth', {
        body: { action: 'verify', token: testCode }
      });

      if (error) throw error;

      setTestResult(data.valid ? 'success' : 'error');
      setTimeout(() => setTestResult(null), 3000);
      
      if (data.valid) {
        toast({
          title: "Code valid!",
          description: "Your authenticator is working correctly",
        });
      } else {
        toast({
          title: "Invalid code",
          description: "The code doesn't match. Try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error testing code:', error);
      setTestResult('error');
    }
    setTestCode('');
  };

  const disable2FA = async () => {
    if (disableCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter a 6-digit code to disable 2FA",
        variant: "destructive"
      });
      return;
    }

    setDisableLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('totp-auth', {
        body: { action: 'disable', token: disableCode }
      });

      if (error) throw error;

      if (data.success) {
        setIsEnabled(false);
        setIsSetup(false);
        setDisableDialogOpen(false);
        setDisableCode('');
        toast({
          title: "2FA Disabled",
          description: "Two-factor authentication has been disabled",
        });
      } else {
        toast({
          title: "Verification failed",
          description: data.error || "Invalid verification code",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error disabling 2FA:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to disable 2FA",
        variant: "destructive"
      });
    } finally {
      setDisableLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Secret key copied to clipboard",
    });
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast({
      title: "Copied!",
      description: "Backup codes copied to clipboard",
    });
  };

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <div>
                <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security using an authenticator app
                </CardDescription>
              </div>
            </div>
            <Badge variant={isEnabled ? "default" : "secondary"} className="gap-1">
              {isEnabled ? (
                <>
                  <ShieldCheck className="h-3 w-3" />
                  Enabled
                </>
              ) : (
                <>
                  <ShieldOff className="h-3 w-3" />
                  Disabled
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEnabled ? (
            <>
              <Alert className="border-primary/30 bg-primary/5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <AlertDescription>
                  Your account is protected with two-factor authentication.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code to test"
                    value={testCode}
                    onChange={(e) => setTestCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="max-w-[200px] font-mono"
                    maxLength={6}
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={testVerification}
                    disabled={testCode.length !== 6}
                    className={testResult === 'success' ? 'border-green-500 text-green-500' : testResult === 'error' ? 'border-destructive text-destructive' : ''}
                  >
                    {testResult === 'success' ? <Check className="h-4 w-4" /> : 'Test Code'}
                  </Button>
                </div>
                
                <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-2">
                      <ShieldOff className="h-4 w-4" />
                      Disable 2FA
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Disable Two-Factor Authentication
                      </DialogTitle>
                      <DialogDescription>
                        This will remove the extra security from your account. Enter your current authenticator code to confirm.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <Input
                        type="text"
                        placeholder="Enter 6-digit code"
                        value={disableCode}
                        onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="font-mono text-center text-lg tracking-widest"
                        maxLength={6}
                      />
                      <Button 
                        variant="destructive" 
                        className="w-full"
                        onClick={disable2FA}
                        disabled={disableLoading || disableCode.length !== 6}
                      >
                        {disableLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Confirm Disable'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Use apps like Google Authenticator, Authy, or Microsoft Authenticator to generate time-based verification codes.
              </p>
              <Button 
                onClick={generateSecret} 
                disabled={setupLoading}
                className="gap-2"
              >
                {setupLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Key className="h-4 w-4" />
                )}
                Set Up 2FA
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app, then enter the verification code.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-lg">
                <QRCodeSVG value={otpauthUrl} size={200} />
              </div>
            </div>

            {/* Manual Entry */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground text-center">
                Or enter this secret manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-xs font-mono break-all">
                  {secret}
                </code>
                <Button variant="outline" size="icon" onClick={copySecret}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Verification */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Enter verification code:</p>
              <Input
                type="text"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="font-mono text-center text-2xl tracking-widest"
                maxLength={6}
              />
              <Button 
                className="w-full" 
                onClick={verifyAndEnable}
                disabled={verifyLoading || verificationCode.length !== 6}
              >
                {verifyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Verify & Enable'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog open={backupCodesDialogOpen} onOpenChange={setBackupCodesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Save Your Backup Codes
            </DialogTitle>
            <DialogDescription>
              Store these codes in a safe place. You can use them to access your account if you lose your authenticator device.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Each code can only be used once. Save them securely!
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, index) => (
                <code key={index} className="p-2 bg-muted rounded text-center font-mono text-sm">
                  {code}
                </code>
              ))}
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={copyBackupCodes}>
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
              <Button className="flex-1" onClick={() => setBackupCodesDialogOpen(false)}>
                I've Saved Them
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
