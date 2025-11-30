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

async function createOrUpdateDriveFile(
  accessToken: string,
  fileId: string | null,
  fileName: string,
  jsonContent: string
): Promise<string> {
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
  };

  if (fileId) {
    // Update existing file
    console.log('Updating existing Drive file:', fileId);
    
    // First update metadata
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    // Then update content
    const uploadResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: jsonContent,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Failed to update Drive file content:', errorText);
      throw new Error('Failed to update Drive file');
    }

    return fileId;
  } else {
    // Create new file
    console.log('Creating new Drive file');
    
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonContent +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create Drive file:', errorText);
      throw new Error('Failed to create Drive file');
    }

    const file = await response.json();
    return file.id;
  }
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

    console.log('Starting Google Drive backup for user:', user.id);

    // Get Drive connection details
    const { data: driveConfig, error: driveError } = await supabase
      .from('google_drive_backups')
      .select('refresh_token, drive_file_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (driveError || !driveConfig) {
      throw new Error('Google Drive not connected. Please connect first.');
    }

    // Fetch all user data for backup
    console.log('Fetching user data for backup...');
    const [profilesRes, searchesRes, matchesRes, bookmarksRes, adminRes, submissionsRes, settingsRes, tfaRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id),
      supabase.from('job_searches').select('*').eq('user_id', user.id),
      supabase.from('candidate_matches').select('*'),
      supabase.from('candidate_bookmarks').select('*').eq('user_id', user.id),
      supabase.from('admin_profiles').select('*').eq('user_id', user.id),
      supabase.from('external_submissions').select('*').eq('admin_user_id', user.id),
      supabase.from('admin_settings').select('*').eq('user_id', user.id),
      supabase.from('two_factor_auth').select('*').eq('user_id', user.id),
    ]);

    const snapshot = {
      profiles: profilesRes.data || [],
      job_searches: searchesRes.data || [],
      candidate_matches: matchesRes.data || [],
      candidate_bookmarks: bookmarksRes.data || [],
      admin_profiles: adminRes.data || [],
      external_submissions: submissionsRes.data || [],
      admin_settings: settingsRes.data || [],
      two_factor_auth: tfaRes.data || [],
      backup_timestamp: new Date().toISOString(),
      user_id: user.id,
    };

    console.log('Data snapshot created, uploading to Drive...');

    // Get access token
    const accessToken = await getAccessToken(driveConfig.refresh_token);

    // Create or update Drive file
    const fileName = `adigaze-backup-${user.id}.json`;
    const jsonContent = JSON.stringify(snapshot, null, 2);
    const newFileId = await createOrUpdateDriveFile(
      accessToken,
      driveConfig.drive_file_id,
      fileName,
      jsonContent
    );

    // Update drive_file_id if it was newly created
    if (!driveConfig.drive_file_id || driveConfig.drive_file_id !== newFileId) {
      await supabase
        .from('google_drive_backups')
        .update({ drive_file_id: newFileId })
        .eq('user_id', user.id);
    }

    console.log('Google Drive backup completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Backup synced to Google Drive',
        file_id: newFileId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in google-drive-backup:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
