import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }

    const { code, redirect_uri } = await req.json();

    if (!code || !redirect_uri) {
      throw new Error('Missing code or redirect_uri in request body');
    }

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Missing Google OAuth credentials in environment');
    }

    console.log('Exchanging authorization code for tokens...');

    // Exchange authorization code for access token and refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error(`Failed to exchange code for tokens: ${errorText}`);
    }

    const tokenData: OAuthTokenResponse = await tokenResponse.json();

    if (!tokenData.refresh_token) {
      throw new Error('No refresh_token returned. User may need to re-authorize with prompt=consent.');
    }

    console.log('Token exchange successful, storing refresh_token...');

    // Check if user already has a Drive backup entry
    const { data: existing } = await supabase
      .from('google_drive_backups')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Update existing entry
      const { error: updateError } = await supabase
        .from('google_drive_backups')
        .update({ refresh_token: tokenData.refresh_token })
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    } else {
      // Insert new entry
      const { error: insertError } = await supabase
        .from('google_drive_backups')
        .insert({
          user_id: user.id,
          refresh_token: tokenData.refresh_token,
          drive_file_id: null,
        });

      if (insertError) throw insertError;
    }

    console.log('Google Drive connection successful for user:', user.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Google Drive connected successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in google-drive-oauth:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
