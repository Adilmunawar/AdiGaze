import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TOTP implementation using Web Crypto API
async function generateTOTPSecret(): Promise<string> {
  const array = new Uint8Array(20);
  crypto.getRandomValues(array);
  return base32Encode(array);
}

function base32Encode(buffer: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }
  
  return result;
}

function base32Decode(input: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const output: number[] = [];
  let bits = 0;
  let value = 0;
  
  for (const char of input.toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  
  return new Uint8Array(output).buffer;
}

async function generateTOTP(secret: string, timeStep = 30, digits = 6): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setBigUint64(0, BigInt(counter), false);
  
  const keyData = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
  const hmac = new Uint8Array(signature);
  
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = 
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

async function verifyTOTP(secret: string, token: string, window = 1): Promise<boolean> {
  for (let i = -window; i <= window; i++) {
    const counter = Math.floor(Date.now() / 1000 / 30) + i;
    const counterBuffer = new ArrayBuffer(8);
    const counterView = new DataView(counterBuffer);
    counterView.setBigUint64(0, BigInt(counter), false);
    
    const keyData = base32Decode(secret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
    const hmac = new Uint8Array(signature);
    
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = 
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    
    const otp = (binary % Math.pow(10, 6)).toString().padStart(6, '0');
    
    if (otp === token) {
      return true;
    }
  }
  return false;
}

function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    const code = Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    codes.push(code);
  }
  return codes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token for auth
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    // Create service role client for 2FA operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, token, email } = await req.json();
    console.log(`Processing 2FA action: ${action} for user: ${user.id}`);

    switch (action) {
      case 'generate': {
        // Generate new TOTP secret
        const secret = await generateTOTPSecret();
        const appName = 'AdiGaze';
        const userEmail = user.email || 'user';
        const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(appName)}&algorithm=SHA1&digits=6&period=30`;
        
        // Store the secret (but not enabled yet)
        const { error: upsertError } = await supabaseAdmin
          .from('two_factor_auth')
          .upsert({
            user_id: user.id,
            secret: secret,
            enabled: false,
            backup_codes: null
          }, { onConflict: 'user_id' });

        if (upsertError) {
          console.error('Error storing secret:', upsertError);
          return new Response(
            JSON.stringify({ error: 'Failed to store secret' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Generated new TOTP secret for user');
        return new Response(
          JSON.stringify({ 
            secret, 
            otpauthUrl,
            message: 'Secret generated successfully'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'verify': {
        if (!token || token.length !== 6) {
          return new Response(
            JSON.stringify({ error: 'Invalid token format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the user's secret
        const { data: twoFA, error: fetchError } = await supabaseAdmin
          .from('two_factor_auth')
          .select('secret, enabled')
          .eq('user_id', user.id)
          .single();

        if (fetchError || !twoFA) {
          console.error('Error fetching 2FA:', fetchError);
          return new Response(
            JSON.stringify({ error: '2FA not set up' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const isValid = await verifyTOTP(twoFA.secret, token);
        console.log(`Token verification result: ${isValid}`);
        
        return new Response(
          JSON.stringify({ valid: isValid }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'enable': {
        if (!token || token.length !== 6) {
          return new Response(
            JSON.stringify({ error: 'Invalid token format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the user's secret
        const { data: twoFA, error: fetchError } = await supabaseAdmin
          .from('two_factor_auth')
          .select('secret')
          .eq('user_id', user.id)
          .single();

        if (fetchError || !twoFA) {
          return new Response(
            JSON.stringify({ error: '2FA not set up' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify the token first
        const isValid = await verifyTOTP(twoFA.secret, token);
        if (!isValid) {
          return new Response(
            JSON.stringify({ error: 'Invalid verification code' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Generate backup codes and enable 2FA
        const backupCodes = generateBackupCodes();
        
        const { error: updateError } = await supabaseAdmin
          .from('two_factor_auth')
          .update({ 
            enabled: true,
            backup_codes: backupCodes 
          })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error enabling 2FA:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to enable 2FA' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('2FA enabled for user');
        return new Response(
          JSON.stringify({ 
            success: true, 
            backupCodes,
            message: '2FA enabled successfully'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'disable': {
        if (!token || token.length !== 6) {
          return new Response(
            JSON.stringify({ error: 'Invalid token format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the user's secret
        const { data: twoFA, error: fetchError } = await supabaseAdmin
          .from('two_factor_auth')
          .select('secret')
          .eq('user_id', user.id)
          .single();

        if (fetchError || !twoFA) {
          return new Response(
            JSON.stringify({ error: '2FA not set up' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify the token first
        const isValid = await verifyTOTP(twoFA.secret, token);
        if (!isValid) {
          return new Response(
            JSON.stringify({ error: 'Invalid verification code' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete 2FA record
        const { error: deleteError } = await supabaseAdmin
          .from('two_factor_auth')
          .delete()
          .eq('user_id', user.id);

        if (deleteError) {
          console.error('Error disabling 2FA:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to disable 2FA' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('2FA disabled for user');
        return new Response(
          JSON.stringify({ success: true, message: '2FA disabled successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        const { data: twoFA } = await supabaseAdmin
          .from('two_factor_auth')
          .select('enabled')
          .eq('user_id', user.id)
          .single();

        return new Response(
          JSON.stringify({ 
            enabled: twoFA?.enabled || false,
            setup: !!twoFA
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check-login': {
        // Check if a user (by email) has 2FA enabled - for login flow
        if (!email) {
          return new Response(
            JSON.stringify({ error: 'Email required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get user by email
        const { data: userData, error: userLookupError } = await supabaseAdmin.auth.admin.listUsers();
        if (userLookupError) {
          console.error('Error looking up user:', userLookupError);
          return new Response(
            JSON.stringify({ requires2FA: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const targetUser = userData.users.find(u => u.email === email);
        if (!targetUser) {
          return new Response(
            JSON.stringify({ requires2FA: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: twoFA } = await supabaseAdmin
          .from('two_factor_auth')
          .select('enabled')
          .eq('user_id', targetUser.id)
          .single();

        return new Response(
          JSON.stringify({ requires2FA: twoFA?.enabled || false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in totp-auth function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
