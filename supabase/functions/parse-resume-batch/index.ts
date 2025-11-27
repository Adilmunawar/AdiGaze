import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Global error handlers
globalThis.addEventListener('error', (event) => {
  console.error('═══ GLOBAL UNCAUGHT ERROR ═══');
  console.error('Error:', event.error);
  console.error('Message:', event.message);
  console.error('Filename:', event.filename);
  console.error('Line:', event.lineno, 'Col:', event.colno);
});

globalThis.addEventListener('unhandledrejection', (event) => {
  console.error('═══ GLOBAL UNHANDLED PROMISE REJECTION ═══');
  console.error('Reason:', event.reason);
  console.error('Promise:', event.promise);
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Convert file to base64
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  let base64 = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    base64 += String.fromCharCode(...chunk);
  }
  
  return btoa(base64);
}

function deriveNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const localPart = email.split('@')[0];
  let cleaned = localPart
    .replace(/[0-9_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 3) return null;

  const parts = cleaned.split(' ').filter(Boolean);
  if (!parts.length) return null;

  const name = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');

  return name;
}

function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  return ['unknown', 'n/a', 'not found', 'not specified', 'na', 'none'].includes(lower);
}

serve(async (req) => {
  console.log('=== REQUEST RECEIVED ===');
  
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request - returning CORS headers');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting FormData parsing...');
    const formData = await req.formData();
    console.log('FormData parsed successfully');
    
    const files = formData.getAll('files');
    console.log(`Extracted ${files?.length || 0} files from FormData`);

    if (!files || files.length === 0) {
      console.error('No files in FormData');
      return new Response(
        JSON.stringify({ error: 'No files provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing batch of ${files.length} resumes via direct PDF-to-Gemini...`);

    // Validate files
    const validFiles: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file: any = files[i];
      
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        console.error(`[FILE ${i + 1}/${files.length}] ${file.name} - File too large (${file.size} bytes)`);
        continue;
      }
      
      validFiles.push(file);
      console.log(`[FILE ${i + 1}/${files.length}] ${file.name} - Valid (${file.size} bytes)`);
    }

    if (validFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid files to process' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader?.replace('Bearer ', '') ?? ''
    );
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload files to storage in parallel (background task) with index tracking
    const fileUploadPromises = validFiles.map(async (file: any, index: number) => {
      const sanitizedFileName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x00-\x7F]/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_');
      
      const storagePath = `${user.id}/${Date.now()}_${index}_${sanitizedFileName}`;
      
      const { data, error } = await supabaseClient.storage
        .from('resumes')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (error) {
        console.error(`Storage upload failed for ${file.name}:`, error);
        return null;
      }

      const { data: { publicUrl } } = supabaseClient.storage
        .from('resumes')
        .getPublicUrl(data.path);

      return { fileIndex: index, fileName: file.name, fileUrl: publicUrl };
    });

    // Load exactly 5 API keys for maximum parallel processing
    const GEMINI_API_KEYS = [
      Deno.env.get('GEMINI_API_KEY_1'),
      Deno.env.get('GEMINI_API_KEY_2'),
      Deno.env.get('GEMINI_API_KEY_3'),
      Deno.env.get('GEMINI_API_KEY_4'),
      Deno.env.get('GEMINI_API_KEY_5')
    ];
    
    // Validate all 5 keys are present
    const missingKeys = GEMINI_API_KEYS.map((key, i) => {
      if (!key) return `GEMINI_API_KEY_${i + 1}`;
      return null;
    }).filter(Boolean);
    
    if (missingKeys.length > 0) {
      console.error(`Missing API keys: ${missingKeys.join(', ')}`);
      return new Response(
        JSON.stringify({ error: `Missing API keys: ${missingKeys.join(', ')}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[INIT] Loaded ${GEMINI_API_KEYS.length} API keys for parallel processing`);

    let allCandidates: any[] = [];
    const batchFailedFiles: string[] = [];
    
    // ULTRA-FAST PARALLEL STRATEGY: Divide resumes evenly among APIs, process all at once
    const resumesPerAPI = Math.ceil(validFiles.length / GEMINI_API_KEYS.length);
    console.log(`[PROCESSING] Dividing ${validFiles.length} resumes among ${GEMINI_API_KEYS.length} APIs (${resumesPerAPI} per API)`);
    
    // Process each API's assigned resumes
    const apiPromises = GEMINI_API_KEYS.map(async (API_KEY, apiKeyIndex) => {
      const keyName = `GEMINI_API_KEY_${apiKeyIndex + 1}`;
      const startIdx = apiKeyIndex * resumesPerAPI;
      const endIdx = Math.min(startIdx + resumesPerAPI, validFiles.length);
      const assignedFiles = validFiles.slice(startIdx, endIdx);
      
      console.log(`[${keyName}] Processing ${assignedFiles.length} resumes (${startIdx + 1}-${endIdx})`);
      
      // Process all assigned resumes in parallel for this API
      const resumePromises = assignedFiles.map(async (file: any) => {
        const globalFileIndex = validFiles.indexOf(file);
        
        try {
          console.log(`[RESUME ${globalFileIndex}/${validFiles.length}] ${keyName} processing "${file.name}"`);
          
          const base64 = await fileToBase64(file);
          
          const parseResume = async () => {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      {
                        text: `Extract data from this single resume. Return ONLY valid JSON.

CRITICAL RULES:
- full_name: Extract the ACTUAL person's name from the resume. DO NOT use placeholders like "Unknown", "N/A", or the filename. If you cannot find a real name, set this field to null.
- If any field is not found in the resume, set it to null (not "Unknown", "N/A", or any placeholder text)

EXTRACT:
- full_name (string or null - MUST be the person's real name from the resume)
- email (string or null)
- phone_number (string or null)
- location (string or null)
- job_title (string or null)
- years_of_experience (integer or null)
- sector (string or null)
- skills (array of strings, empty array if none found)
- experience (string or null, max 200 chars)
- education (string or null, max 150 chars)
- resume_text (string - FULL raw text content from resume for AI matching)

Output format: {"candidate": {...}}`
                      },
                      {
                        inlineData: {
                          mimeType: file.type || 'application/pdf',
                          data: base64
                        }
                      }
                    ]
                  }],
                  generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json"
                  }
                })
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`[RESUME ${globalFileIndex}] API Error ${response.status}:`, errorText);
              throw new Error(`Failed: ${response.status} - ${errorText}`);
            }

            return await response.json();
          };

          const result = await retryWithBackoff(parseResume, 3, 2000);
          const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          if (!rawText) {
            console.error(`[RESUME ${globalFileIndex}] ⚠ No raw text in API response for "${file.name}"`);
            batchFailedFiles.push(file.name);
            return null;
          }
          
          const parsedData = JSON.parse(rawText);
          if (parsedData.candidate) {
            console.log(`[RESUME ${globalFileIndex}] ✓ Successfully parsed "${parsedData.candidate.full_name || file.name}" (${globalFileIndex}/${validFiles.length})`);
            return parsedData.candidate;
          } else {
            console.error(`[RESUME ${globalFileIndex}] ⚠ Missing candidate object for "${file.name}"`);
            batchFailedFiles.push(file.name);
            return null;
          }
        } catch (error) {
          console.error(`[RESUME ${globalFileIndex}] ✗ Exception processing "${file.name}":`, error);
          batchFailedFiles.push(file.name);
          return null;
        }
      });
      
      const results = await Promise.all(resumePromises);
      return results.filter(r => r !== null);
    });
    
    console.log(`[PROCESSING] All ${GEMINI_API_KEYS.length} APIs started - processing ${validFiles.length} resumes simultaneously...`);
    const apiResults = await Promise.all(apiPromises);
    allCandidates = apiResults.flat();
    
    console.log(`[PROCESSING] Complete - All workers finished. Processed ${allCandidates.length}/${validFiles.length} resumes`);

    // Wait for file uploads to complete
    const uploadedFiles = await Promise.all(fileUploadPromises);

    // Check if we have any candidates
    if (allCandidates.length === 0) {
      const allFailedFiles = [...new Set(batchFailedFiles)];
      return new Response(
        JSON.stringify({
          error: 'Failed to parse any resumes',
          details: `Tried to process ${validFiles.length} files`,
          failedFiles: allFailedFiles,
          hint: 'Gemini Vision API may have failed to extract data. Check Edge Function logs for detailed errors.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[EMBEDDINGS] Starting background embedding generation...`);

    // Generate embeddings in background
    const embeddingPromises = allCandidates.map(async (candidate, idx) => {
      try {
        // Rotate API keys for embedding generation
        const apiKeyIndex = idx % GEMINI_API_KEYS.length;
        const API_KEY = GEMINI_API_KEYS[apiKeyIndex];
        const keyName = `GEMINI_API_KEY_${apiKeyIndex + 1}`;
        
        console.log(`[EMBEDDINGS] Generating for ${candidate.full_name} with ${keyName}`);
        
        const embeddingText = `
          Name: ${candidate.full_name}
          Job Title: ${candidate.job_title || 'N/A'}
          Sector: ${candidate.sector || 'N/A'}
          Skills: ${candidate.skills?.join(', ') || 'N/A'}
          Experience: ${candidate.experience || 'N/A'}
          Education: ${candidate.education || 'N/A'}
        `.trim();

        const embeddingResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/text-embedding-004',
              content: { parts: [{ text: embeddingText }] }
            })
          }
        );

        if (!embeddingResponse.ok) {
          console.error(`[EMBEDDINGS] Failed for ${candidate.full_name}:`, await embeddingResponse.text());
          return null;
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.embedding?.values;
        
        if (embedding) {
          console.log(`✓ Background embedding for ${candidate.full_name}`);
          return { candidate, embedding };
        }
        return null;
      } catch (error) {
        console.error(`[EMBEDDINGS] Error for ${candidate.full_name}:`, error);
        return null;
      }
    });

    const embeddingResults = await Promise.all(embeddingPromises);
    console.log('✓ Background embedding generation complete');

    // Validate and insert candidates (more lenient - allow partial data)
    const validCandidates = embeddingResults.filter(result => {
      if (!result) return false;
      const { candidate } = result;
      
      // Only require full_name - allow other fields to be null/empty
      // Also reject if name is a placeholder like "Unknown"
      const hasMinimumFields = !!candidate.full_name && 
                              candidate.full_name.trim().length > 0 &&
                              !isPlaceholderName(candidate.full_name);
      
      if (!hasMinimumFields) {
        console.warn(`[VALIDATION] Rejected candidate: ${candidate.full_name || 'UNKNOWN'} - Invalid or missing name`);
      } else {
        // Log warning for incomplete data but still process
        const missingFields = [];
        if (!candidate.email) missingFields.push('email');
        if (!candidate.job_title) missingFields.push('job_title');
        if (!candidate.sector) missingFields.push('sector');
        if (!candidate.skills || candidate.skills.length === 0) missingFields.push('skills');
        
        if (missingFields.length > 0) {
          console.warn(`[VALIDATION] Processing ${candidate.full_name} with missing fields: ${missingFields.join(', ')}`);
        }
      }
      
      return hasMinimumFields;
    });

    const insertPromises = validCandidates.map(async (result) => {
      const { candidate, embedding } = result!;
      const matchingUpload = uploadedFiles.find(u => u?.fileIndex === candidate.fileIndex);
      
      const { error: insertError } = await supabaseClient
        .from('profiles')
        .insert({
          full_name: candidate.full_name,
          email: candidate.email || `${candidate.full_name.replace(/\s+/g, '_').toLowerCase()}@noemail.com`,
          phone_number: candidate.phone_number || null,
          location: candidate.location || null,
          job_title: candidate.job_title || 'Not Specified',
          years_of_experience: candidate.years_of_experience || 0,
          sector: candidate.sector || 'General',
          skills: (candidate.skills && candidate.skills.length > 0) ? candidate.skills : ['General'],
          experience: candidate.experience || null,
          education: candidate.education || null,
          resume_text: candidate.resume_text || null,
          resume_file_url: matchingUpload?.fileUrl || null,
          user_id: user.id,
          embedding: `[${embedding.join(',')}]`
        });

      if (insertError) {
        console.error(`✗ Failed to insert ${candidate.full_name}:`, insertError);
        return { success: false, candidate: candidate.full_name, error: insertError.message };
      }
      
      console.log(`✓ Successfully inserted ${candidate.full_name}`);
      return { success: true, candidate: candidate.full_name };
    });

    const insertResults = await Promise.all(insertPromises);
    const successful = insertResults.filter(r => r.success).length;
    const failed = insertResults.filter(r => !r.success);
    const rejected = allCandidates.length - validCandidates.length;

    console.log(`✓ Successfully processed ${successful}/${validFiles.length} resumes`);
    console.log(`  - Failed: ${failed.length} (extraction/parsing errors)`);
    console.log(`  - Rejected: ${rejected} (invalid data)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully processed ${successful} resumes`,
        processed: successful,
        failed: failed.length,
        rejected,
        failedFiles: failed.map(f => ({ fileName: f.candidate, error: 'Database insertion failed' }))
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('═══ CRITICAL ERROR ═══');
    console.error('Error details:', error);
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
