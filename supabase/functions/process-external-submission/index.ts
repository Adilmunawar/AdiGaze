import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sanitizeString(input: unknown, maxLen = 120_000): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/\s{3,}/g, ' ');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  s = s.trim();
  return s.length ? s : null;
}

function sanitizeStringArray(value: unknown, maxItems = 128): string[] | null {
  if (!value) return null;
  let arr: string[] = [];
  if (Array.isArray(value)) {
    arr = value.map((v) => sanitizeString(v)).filter((v): v is string => !!v);
  } else if (typeof value === 'string') {
    arr = value.split(/[;,\n]/).map((v) => sanitizeString(v)).filter((v): v is string => !!v);
  }
  if (!arr.length) return null;
  if (arr.length > maxItems) arr = arr.slice(0, maxItems);
  const seen = new Set<string>();
  return arr.filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
}

function coerceInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && !isNaN(n) ? Math.floor(n) : null;
}

function safeJsonParse(text: string): any | null {
  if (!text || typeof text !== 'string') return null;
  let s = text.replace(/^```json\n?|```$/gim, '').trim();
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  try { return JSON.parse(s); } catch (_e) {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (_e) {}
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submissionId, apiKeyIndex = 1 } = await req.json();

    if (!submissionId) {
      return new Response(
        JSON.stringify({ error: 'Submission ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token || '');
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing external submission: ${submissionId}`);

    // Fetch the submission
    const { data: submission, error: fetchError } = await supabaseClient
      .from('external_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('admin_user_id', user.id)
      .single();

    if (fetchError || !submission) {
      console.error('Failed to fetch submission:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Submission not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the resume file
    const resumeUrl = submission.resume_file_url;
    const fileResponse = await fetch(resumeUrl);
    
    if (!fileResponse.ok) {
      console.error('Failed to download resume:', fileResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to download resume file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileBytes = await fileResponse.arrayBuffer();
    
    // Select API key based on index (supports multiple keys for parallel processing)
    const apiKeyName = apiKeyIndex === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${apiKeyIndex}`;
    let GEMINI_API_KEY = Deno.env.get(apiKeyName);
    
    // Fallback to primary key if indexed key doesn't exist
    if (!GEMINI_API_KEY) {
      GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    }

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using API key: ${apiKeyName}`);

    console.log('Parsing with Gemini...');

    // Convert to base64 for Gemini
    const uint8Array = new Uint8Array(fileBytes);
    let base64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      base64 += String.fromCharCode(...chunk);
    }
    const base64Data = btoa(base64);

    // Determine mime type from URL
    const mimeType = resumeUrl.toLowerCase().endsWith('.pdf') 
      ? 'application/pdf' 
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const geminiPayload = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          },
          {
            text: `Extract all information from this resume and return a JSON object with these fields:\n{\n  "full_name": "string or null",\n  "email": "string or null",\n  "phone_number": "string or null",\n  "location": "string or null",\n  "job_title": "string or null",\n  "years_of_experience": number or null,\n  "sector": "string or null",\n  "skills": ["array", "of", "strings"],\n  "experience": "string or null",\n  "education": "string or null",\n  "resume_text": "string"\n}\n\nCRITICAL: Extract the ACTUAL person's name for full_name. DO NOT use "Unknown", "N/A", or placeholders. If you cannot find a real name, set full_name to null. Same rule applies to all fields - use null instead of placeholder text.\n\nReturn ONLY valid JSON, no markdown or explanations.`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 32,
        topP: 0.9,
        maxOutputTokens: 8192,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to parse resume with AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const aiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!aiResponseText) {
      console.error('No text from Gemini:', JSON.stringify(result));
      return new Response(
        JSON.stringify({ error: 'Failed to extract data from resume' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsed = safeJsonParse(aiResponseText);
    
    // Normalize profile data
    const profileData: any = {
      user_id: user.id,
      full_name: sanitizeString(parsed?.full_name) || submission.candidate_name,
      email: sanitizeString(parsed?.email) || submission.candidate_email,
      phone_number: sanitizeString(parsed?.phone_number) || submission.candidate_phone,
      location: sanitizeString(parsed?.location),
      job_title: sanitizeString(parsed?.job_title) || submission.interested_job,
      years_of_experience: coerceInt(parsed?.years_of_experience),
      sector: sanitizeString(parsed?.sector),
      skills: sanitizeStringArray(parsed?.skills),
      experience: sanitizeString(parsed?.experience),
      education: sanitizeString(parsed?.education),
      resume_text: sanitizeString(parsed?.resume_text),
      resume_file_url: resumeUrl,
      source: 'external',
    };

    console.log('Generating embedding...');

    // Generate embedding
    const embeddingText = [
      profileData.full_name,
      profileData.email,
      profileData.job_title,
      profileData.location,
      profileData.sector,
      ...(profileData.skills || []),
      profileData.experience,
      profileData.education,
      profileData.resume_text
    ].filter(Boolean).join(' ');

    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: embeddingText }] }
        })
      }
    );

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();
      const embeddingVector = embeddingData.embedding?.values;
      if (embeddingVector && Array.isArray(embeddingVector)) {
        profileData.embedding = `[${embeddingVector.join(',')}]`;
      }
    } else {
      console.error('Embedding generation failed:', await embeddingResponse.text());
    }

    console.log('Saving to profiles...');

    // Insert into profiles
    const { error: insertError } = await supabaseClient
      .from('profiles')
      .insert(profileData);

    if (insertError) {
      console.error('Failed to insert profile:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save candidate profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update submission status
    const { error: updateError } = await supabaseClient
      .from('external_submissions')
      .update({ 
        status: 'accepted',
        parsed_data: parsed
      })
      .eq('id', submissionId);

    if (updateError) {
      console.error('Failed to update submission:', updateError);
    }

    console.log('External submission processed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Candidate processed and added to profiles'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
