import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to refresh access token:', errorText);
    throw new Error('Failed to refresh access token');
  }

  const data: AccessTokenResponse = await response.json();
  return data.access_token;
}

async function downloadDriveFile(accessToken: string, fileId: string): Promise<any> {
  console.log('Downloading Drive file:', fileId);
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to download Drive file:', errorText);
    throw new Error('Failed to download backup from Drive');
  }

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }

    console.log('Starting Google Drive restore for user:', user.id);

    // Get Drive connection details
    const { data: driveConfig, error: driveError } = await supabase
      .from('google_drive_backups')
      .select('refresh_token, drive_file_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (driveError || !driveConfig || !driveConfig.drive_file_id) {
      throw new Error('No Google Drive backup found. Please create a backup first.');
    }

    // Get access token
    const accessToken = await getAccessToken(driveConfig.refresh_token);

    // Download backup from Drive
    const snapshot = await downloadDriveFile(accessToken, driveConfig.drive_file_id);

    console.log('Backup downloaded, restoring data...');

    // Validate snapshot
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Invalid backup format');
    }

    // Get existing search IDs to clean up matches
    const { data: existingSearches } = await supabase
      .from('job_searches')
      .select('id')
      .eq('user_id', user.id);

    const searchIds = (existingSearches || []).map(s => s.id);

    // Delete candidate matches for this user's searches
    if (searchIds.length) {
      await supabase
        .from('candidate_matches')
        .delete()
        .in('search_id', searchIds);
    }

    // Delete existing data for this user
    await Promise.all([
      supabase.from('candidate_bookmarks').delete().eq('user_id', user.id),
      supabase.from('job_searches').delete().eq('user_id', user.id),
      supabase.from('profiles').delete().eq('user_id', user.id),
      supabase.from('admin_profiles').delete().eq('user_id', user.id),
    ]);

    console.log('Existing data deleted, inserting restored data...');

    // Insert restored data
    const insertPromises = [];

    if (snapshot.admin_profiles && snapshot.admin_profiles.length) {
      const adminRows = snapshot.admin_profiles.filter((row: any) => row.user_id === user.id);
      if (adminRows.length) {
        insertPromises.push(supabase.from('admin_profiles').insert(adminRows));
      }
    }

    if (snapshot.profiles && snapshot.profiles.length) {
      insertPromises.push(supabase.from('profiles').insert(snapshot.profiles));
    }

    if (snapshot.job_searches && snapshot.job_searches.length) {
      insertPromises.push(supabase.from('job_searches').insert(snapshot.job_searches));
    }

    if (snapshot.candidate_bookmarks && snapshot.candidate_bookmarks.length) {
      insertPromises.push(supabase.from('candidate_bookmarks').insert(snapshot.candidate_bookmarks));
    }

    if (snapshot.candidate_matches && snapshot.candidate_matches.length) {
      insertPromises.push(supabase.from('candidate_matches').insert(snapshot.candidate_matches));
    }

    const results = await Promise.all(insertPromises);

    // Check for errors
    for (const result of results) {
      if (result.error) {
        console.error('Insert error:', result.error);
        throw new Error(`Failed to restore data: ${result.error.message}`);
      }
    }

    console.log('Google Drive restore completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Data restored from Google Drive successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in google-drive-restore:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
