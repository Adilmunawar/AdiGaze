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

    // Upload files to storage in parallel (background task)
    const fileUploadPromises = validFiles.map(async (file: any, index: number) => {
      const sanitizedFileName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x00-\x7F]/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_');
      
      const storagePath = `resumes/${Date.now()}_${index}_${sanitizedFileName}`;
      
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

      return { fileName: file.name, fileUrl: publicUrl };
    });

    // Load exactly 4 API keys for true parallel processing
    const GEMINI_API_KEYS = [
      Deno.env.get('GEMINI_API_KEY_1'),
      Deno.env.get('GEMINI_API_KEY_2'),
      Deno.env.get('GEMINI_API_KEY_3'),
      Deno.env.get('GEMINI_API_KEY_4')
    ];
    
    // Validate all 4 keys are present
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
    
    // PARALLEL PROCESSING: 4 batches of 2 resumes each
    const BATCH_SIZE = 2;
    const PARALLEL_BATCHES = 4;
    
    // Split into batches of 2
    const batches: any[][] = [];
    for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
      batches.push(validFiles.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`[PROCESSING] Created ${batches.length} batches of up to ${BATCH_SIZE} resumes each`);
    
    // Process batches in parallel groups of 4
    for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
      const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
      console.log(`[PROCESSING] Starting parallel batch group ${Math.floor(i / PARALLEL_BATCHES) + 1}: ${parallelBatches.length} batches in parallel`);
      
      const batchPromises = parallelBatches.map(async (batch, batchIndex) => {
        // Use global batch index to ensure each batch gets a unique API key
        const globalBatchIndex = i + batchIndex;
        const apiKeyIndex = globalBatchIndex % GEMINI_API_KEYS.length;
        const API_KEY = GEMINI_API_KEYS[apiKeyIndex];
        const keyName = `GEMINI_API_KEY_${apiKeyIndex + 1}`;
        
        try {
          console.log(`[BATCH ${globalBatchIndex + 1}] Processing ${batch.length} resume(s) with ${keyName}`);
          console.log(`[BATCH ${globalBatchIndex + 1}] Files:`, batch.map((f: any) => f.name).join(', '));
          
          // Convert files to base64 for Vision API
          const fileDataPromises = batch.map(async (file: any) => {
            const base64 = await fileToBase64(file);
            return {
              fileName: file.name,
              mimeType: file.type || 'application/pdf',
              data: base64
            };
          });
          
          const filesData = await Promise.all(fileDataPromises);
          
          const parseResumes = async () => {
            console.log(`[BATCH ${globalBatchIndex + 1}] Calling Gemini Vision API...`);
            
            // Build parts array with inline data for each file
            const parts: any[] = [
              {
                text: `Extract data from ${batch.length} resume file(s). Return ONLY valid JSON.

EXTRACT:
- full_name (MUST be person's real name from resume, NOT filename)
- email, phone_number, location, job_title
- years_of_experience (integer)
- sector
- skills (array, max 10)
- experience (max 200 chars)
- education (max 150 chars)
- resume_text (FULL raw text content from resume for AI matching)

CRITICAL: All ${batch.length} resume(s) MUST be included in output.
Output format: {"candidates": [...]}`
              }
            ];
            
            // Add each file as inline data
            filesData.forEach((fileData) => {
              parts.push({
                inlineData: {
                  mimeType: fileData.mimeType,
                  data: fileData.data
                }
              });
            });
            
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts }],
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
              console.error(`[BATCH ${globalBatchIndex + 1}] API Error ${response.status}:`, errorText);
              throw new Error(`Batch failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log(`[BATCH ${globalBatchIndex + 1}] API Response structure:`, {
              hasCandidates: !!result.candidates,
              candidatesLength: result.candidates?.length,
              hasContent: !!result.candidates?.[0]?.content,
              hasParts: !!result.candidates?.[0]?.content?.parts,
              partsLength: result.candidates?.[0]?.content?.parts?.length
            });
            
            return result;
          };

          const result = await retryWithBackoff(parseResumes, 3, 2000);
          const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          if (!rawText) {
            console.error(`[BATCH ${globalBatchIndex + 1}] ⚠ No raw text in API response`);
            batch.forEach((f: any) => batchFailedFiles.push(f.name));
            return [];
          }
          
          try {
            const parsedData = JSON.parse(rawText);
            if (parsedData.candidates && Array.isArray(parsedData.candidates)) {
              if (parsedData.candidates.length === 0) {
                console.error(`[BATCH ${globalBatchIndex + 1}] ⚠ API returned empty candidates array`);
                batch.forEach((f: any) => batchFailedFiles.push(f.name));
                return [];
              }
              
              console.log(`[BATCH ${globalBatchIndex + 1}] ✓ Successfully parsed ${parsedData.candidates.length} candidates`);
              
              if (parsedData.candidates.length < batch.length) {
                console.warn(`[BATCH ${globalBatchIndex + 1}] ⚠ Expected ${batch.length} candidates but got ${parsedData.candidates.length}`);
              }
              
              return parsedData.candidates;
            } else {
              console.error(`[BATCH ${globalBatchIndex + 1}] ⚠ Parsed data missing candidates array`);
              batch.forEach((f: any) => batchFailedFiles.push(f.name));
              return [];
            }
          } catch (parseError) {
            console.error(`[BATCH ${globalBatchIndex + 1}] ✗ JSON parse error:`, parseError);
            console.error(`[BATCH ${globalBatchIndex + 1}] Raw text (first 500 chars):`, rawText.substring(0, 500));
            batch.forEach((f: any) => batchFailedFiles.push(f.name));
            return [];
          }
        } catch (error) {
          console.error(`[BATCH ${globalBatchIndex + 1}] ✗ Exception during batch processing:`, error);
          batch.forEach((f: any) => batchFailedFiles.push(f.name));
          return [];
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(candidates => {
        if (candidates.length > 0) {
          allCandidates.push(...candidates);
        }
      });
      
      console.log(`[PROCESSING] Parallel batch group complete. Total candidates so far: ${allCandidates.length}`);
    }

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

    // Validate and insert candidates
    const validCandidates = embeddingResults.filter(result => {
      if (!result) return false;
      const { candidate } = result;
      
      const hasRequiredFields = 
        candidate.full_name && 
        candidate.email && 
        candidate.job_title && 
        candidate.sector && 
        Array.isArray(candidate.skills) && 
        candidate.skills.length > 0;
      
      if (!hasRequiredFields) {
        console.warn(`[VALIDATION] Rejected candidate: ${candidate.full_name || 'UNKNOWN'} - Missing required fields`);
      }
      
      return hasRequiredFields;
    });

    const insertPromises = validCandidates.map(async (result) => {
      const { candidate, embedding } = result!;
      const matchingUpload = uploadedFiles.find(u => u?.fileName === candidate.full_name);
      
      const { error: insertError } = await supabaseClient
        .from('profiles')
        .insert({
          full_name: candidate.full_name,
          email: candidate.email,
          phone_number: candidate.phone_number || null,
          location: candidate.location || null,
          job_title: candidate.job_title,
          years_of_experience: candidate.years_of_experience || 0,
          sector: candidate.sector,
          skills: candidate.skills || [],
          experience: candidate.experience || null,
          education: candidate.education || null,
          resume_text: candidate.resume_text || null,
          resume_file_url: matchingUpload?.fileUrl || null,
          user_id: user.id,
          embedding: `[${embedding.join(',')}]`
        });

      if (insertError) {
        console.error(`Failed to insert ${candidate.full_name}:`, insertError);
        return { success: false, candidate: candidate.full_name };
      }
      
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
