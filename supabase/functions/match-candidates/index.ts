import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse request body first
  let jobDescription: string;
  let candidateIds: string[] | undefined;
  try {
    const body = await req.json();
    jobDescription = body.jobDescription;
    candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds : undefined;
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!jobDescription) {
    return new Response(
      JSON.stringify({ error: 'Job description is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        sendEvent('log', { level: 'info', message: 'Starting candidate matching...' });
        console.log('=== MATCH-CANDIDATES EDGE FUNCTION STARTED ===');

        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Load all 5 API keys for parallel processing
        const GEMINI_API_KEYS = [
          Deno.env.get('GEMINI_API_KEY_1'),
          Deno.env.get('GEMINI_API_KEY_2'),
          Deno.env.get('GEMINI_API_KEY_3'),
          Deno.env.get('GEMINI_API_KEY_4'),
          Deno.env.get('GEMINI_API_KEY_5')
        ];
        
        // Validate all keys are present
        const missingKeys = GEMINI_API_KEYS.map((key, i) => key ? null : `GEMINI_API_KEY_${i + 1}`).filter(Boolean);
        if (missingKeys.length > 0) {
          console.error(`Missing API keys: ${missingKeys.join(', ')}`);
          sendEvent('error', { message: `Missing API keys: ${missingKeys.join(', ')}` });
          controller.close();
          return;
        }
        
        console.log(`[INIT] Loaded ${GEMINI_API_KEYS.length} API keys for parallel processing`);

        // Get authenticated user ID from the JWT
        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token || '');
        
        if (userError || !user) {
          sendEvent('error', { message: 'Unable to authenticate user' });
          controller.close();
          return;
        }

        // Fetch all user's profiles (skip vector search for now to ensure reliability)
        sendEvent('log', { level: 'info', message: 'Fetching all your candidates...' });
        
        let query = supabaseClient
          .from('profiles')
          .select('*')
          .eq('user_id', user.id);

        if (candidateIds && candidateIds.length > 0) {
          query = query.in('id', candidateIds);
        }

        const { data: profiles, error: fetchError } = await query
          .order('created_at', { ascending: false });

        if (fetchError) {
          console.error('[FETCH] Error fetching profiles:', fetchError);
          sendEvent('error', { message: `Failed to fetch profiles: ${fetchError.message}` });
          controller.close();
          return;
        }

        if (!profiles || profiles.length === 0) {
          console.log('[FETCH] No profiles found for user:', user.id);
          sendEvent('log', { level: 'info', message: 'No candidates found in database' });
          sendEvent('complete', { matches: [], message: 'No candidates found' });
          controller.close();
          return;
        }

        console.log(`[FETCH] Successfully fetched ${profiles.length} profiles for user ${user.id}`);
        sendEvent('log', { level: 'success', message: `Found ${profiles.length} candidates in your database` });

        sendEvent('log', { level: 'info', message: `Analyzing ${profiles.length} candidates with AI...` });
        sendEvent('progress', { current: 0, total: profiles.length });
        console.log(`[PROCESSING] ${profiles.length} candidates in parallel batches`);

        try {
          // PARALLEL PROCESSING: 5 batches of 7 candidates each (35 total at once)
          const BATCH_SIZE = 7;
          const PARALLEL_BATCHES = 5;
          const allRankedCandidates: any[] = [];
        
        // Create batches of 5 candidates
        const batches: any[][] = [];
        for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
          batches.push(profiles.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`[PROCESSING] Created ${batches.length} batches of up to ${BATCH_SIZE} candidates each`);
        sendEvent('log', { level: 'info', message: `Processing ${batches.length} batches (${BATCH_SIZE} candidates per batch, 5 APIs in parallel)` });
        
        // Process batches in parallel groups of 5
        for (let groupStart = 0; groupStart < batches.length; groupStart += PARALLEL_BATCHES) {
          const parallelBatches = batches.slice(groupStart, groupStart + PARALLEL_BATCHES);
          const groupNumber = Math.floor(groupStart / PARALLEL_BATCHES) + 1;
          const totalGroups = Math.ceil(batches.length / PARALLEL_BATCHES);
          console.log(`[PROCESSING] Starting parallel batch group ${groupNumber}/${totalGroups}: ${parallelBatches.length} batches in parallel`);
          sendEvent('log', { level: 'info', message: `Group ${groupNumber}/${totalGroups}: Processing ${parallelBatches.length} batches in parallel` });
          
          const batchPromises = parallelBatches.map(async (batch, batchIndexInGroup) => {
            const globalBatchIndex = groupStart + batchIndexInGroup;
            const apiKeyIndex = batchIndexInGroup;
            const API_KEY = GEMINI_API_KEYS[apiKeyIndex];
            const batchNum = globalBatchIndex + 1;
            const totalBatches = batches.length;
            
            try {
              console.log(`[BATCH ${batchNum}/${totalBatches}] Processing ${batch.length} candidates with GEMINI_API_KEY_${apiKeyIndex + 1}`);
              sendEvent('log', { level: 'info', message: `Batch ${batchNum}/${totalBatches}: Analyzing ${batch.length} candidates with API KEY ${apiKeyIndex + 1}` });
            
            // Calculate global indices for this batch
            const startIndex = groupStart * BATCH_SIZE + batchIndexInGroup * BATCH_SIZE;
            
            // Prepare candidate summaries with optimized snippets
            const candidateSummaries = batch.map((profile, localIndex) => {
              const globalIndex = startIndex + localIndex;
              const text = (profile.resume_text || '').toString();
              const snippet = text.length > 800 ? text.slice(0, 800) + '...' : text;
              return {
                index: globalIndex,
                resume: snippet
              };
            });

            // Process batch with Gemini Flash
            let batchRanked: any[] = [];
            const maxRetries = 2;
            
            for (let attempt = 0; attempt < maxRetries; attempt++) {
              try {
                console.log(`[BATCH ${batchNum}] Calling Gemini API (attempt ${attempt + 1}/${maxRetries})...`);
                
                const response = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{
                        parts: [{
                          text: `Job Description:\n${jobDescription}\n\nCandidates to analyze:\n${JSON.stringify(candidateSummaries)}\n\nFor each candidate, extract their information from their resume and evaluate their match against the job requirements.\n\nReturn ONLY valid JSON in this exact format:\n\n{"candidates": [{"candidateIndex": 0, "fullName": "Full Name from Resume", "email": "email@example.com", "phone": "+123456789", "location": "City, Country", "jobTitle": "Current Job Title", "yearsOfExperience": 5, "matchScore": 85, "reasoning": "Brief match explanation", "strengths": ["strength 1", "strength 2", "strength 3"], "concerns": ["concern 1", "concern 2"]}]}\n\nIMPORTANT RULES:\n1. Extract fullName, email, phone, location, jobTitle, yearsOfExperience from the resume text\n2. If a field is not found in resume, use null (not empty string)\n3. matchScore: 0-100 based on job fit\n4. reasoning: max 80 characters\n5. strengths and concerns: max 3 items each\n6. ALL ${batch.length} candidates MUST be included in response\n7. candidateIndex must match the index from input`
                        }]
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
                  console.error(`[BATCH ${batchNum}] API Error ${response.status}:`, errorText);
                  
                  if (response.status === 429) {
                    throw new Error('Rate limited - will retry');
                  }
                  throw new Error(`API error: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                
                console.log(`[BATCH ${batchNum}] API Response structure:`, {
                  hasCandidates: !!result.candidates,
                  candidatesLength: result.candidates?.length,
                  hasContent: !!result.candidates?.[0]?.content,
                  hasParts: !!result.candidates?.[0]?.content?.parts,
                  partsLength: result.candidates?.[0]?.content?.parts?.length
                });
                
                if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
                  if (result.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
                    throw new Error('Response truncated - reducing batch size needed');
                  }
                  console.error(`[BATCH ${batchNum}] Invalid response structure:`, JSON.stringify(result, null, 2));
                  throw new Error('Invalid response structure from Gemini');
                }

                let jsonText = result.candidates[0].content.parts[0].text.trim();
                
                // Clean JSON response
                jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
                
                // Validate JSON is complete
                if (!jsonText.endsWith('}') && !jsonText.endsWith(']')) {
                  console.error(`[BATCH ${batchNum}] JSON appears truncated. Last 100 chars:`, jsonText.slice(-100));
                  throw new Error('JSON response appears truncated');
                }
                
                let parsed;
                try {
                  parsed = JSON.parse(jsonText);
                } catch (parseError) {
                  console.error(`[BATCH ${batchNum}] JSON parse failed. First 500 chars:`, jsonText.substring(0, 500));
                  console.error(`[BATCH ${batchNum}] Last 500 chars:`, jsonText.slice(-500));
                  throw new Error('Failed to parse AI response as JSON');
                }

                if (!parsed.candidates || !Array.isArray(parsed.candidates)) {
                  console.error(`[BATCH ${batchNum}] Response missing candidates array. Parsed:`, parsed);
                  throw new Error('Response missing candidates array');
                }
                
                if (parsed.candidates.length !== batch.length) {
                  console.warn(`[BATCH ${batchNum}] Expected ${batch.length} candidates but got ${parsed.candidates.length}`);
                }

                batchRanked = parsed.candidates.map((candidate: any) => {
                  // Get original profile data for fallback
                  const originalProfile = batch[candidate.candidateIndex - startIndex];
                  
                  return {
                    candidateIndex: candidate.candidateIndex,
                    fullName: candidate.fullName || originalProfile?.full_name || 'Unknown',
                    email: candidate.email || originalProfile?.email || null,
                    phone: candidate.phone || originalProfile?.phone_number || null,
                    location: candidate.location || originalProfile?.location || null,
                    jobTitle: candidate.jobTitle || originalProfile?.job_title || null,
                    yearsOfExperience: candidate.yearsOfExperience ?? originalProfile?.years_of_experience ?? null,
                    matchScore: candidate.matchScore || 50,
                    reasoning: candidate.reasoning || 'Analyzed',
                    strengths: (candidate.strengths || []).slice(0, 3),
                    concerns: (candidate.concerns || []).slice(0, 3)
                  };
                });
                
                console.log(`[BATCH ${batchNum}/${totalBatches}] ✓ Successfully parsed ${batchRanked.length} candidates`);
                sendEvent('log', { level: 'success', message: `Batch ${batchNum}/${totalBatches} complete: ${batchRanked.length} candidates analyzed` });
                sendEvent('progress', { current: Math.min(startIndex + batch.length, profiles.length), total: profiles.length });
                
                break;
                
              } catch (error: any) {
                console.error(`[BATCH ${batchNum}] Attempt ${attempt + 1} failed:`, error.message);
                sendEvent('log', { level: 'error', message: `Batch ${batchNum} attempt ${attempt + 1} failed: ${error.message}` });
                
                if (attempt === maxRetries - 1) {
                  console.error(`[BATCH ${batchNum}] All retries exhausted, creating fallback results`);
                  batchRanked = candidateSummaries.map(c => ({
                    candidateIndex: c.index,
                    fullName: `Candidate ${c.index + 1}`,
                    email: null,
                    phone: null,
                    location: null,
                    jobTitle: null,
                    yearsOfExperience: null,
                    matchScore: 0,
                    reasoning: 'Analysis failed - manual review needed',
                    strengths: [],
                    concerns: ['Automated analysis unavailable']
                  }));
                } else {
                  const delay = Math.pow(2, attempt + 1) * 1000;
                  console.log(`[BATCH ${batchNum}] Retrying after ${delay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            }
            
            return batchRanked;
          } catch (batchError: any) {
            console.error(`[BATCH ERROR] Failed to process batch:`, batchError);
            sendEvent('log', { level: 'error', message: `Batch processing error: ${batchError.message}` });
            // Return empty array for failed batch
            return [];
          }
        });
          
          const batchResults = await Promise.all(batchPromises);
          const processedCount = batchResults.flat().length;
          console.log(`[PROCESSING] Parallel batch group ${groupNumber}/${totalGroups} complete. Processed ${processedCount} candidates`);
          sendEvent('log', { level: 'success', message: `Group ${groupNumber}/${totalGroups} complete: ${processedCount} candidates processed` });
          batchResults.forEach(result => allRankedCandidates.push(...result));
        }

        const processedTotal = allRankedCandidates.length;
        console.log(`[PROCESSING] All batches complete. Total processed: ${processedTotal} candidates (of ${profiles.length})`);
        sendEvent('log', { level: 'success', message: `All batches processed: ${processedTotal} total candidates (of ${profiles.length})` });

        // Sort by match score
        allRankedCandidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

        // Merge with profile data
        const matches = allRankedCandidates.map((ranked: any) => {
          const profile = profiles[ranked.candidateIndex];
          
          if (!profile) {
            console.error(`Profile not found for index ${ranked.candidateIndex}`);
            return null;
          }
          
          const isFallback = ranked.reasoning === 'Analysis failed - manual review needed';
          
          return {
            id: profile.id,
            resume_file_url: profile.resume_file_url,
            resume_text: profile.resume_text,
            created_at: profile.created_at,
            full_name: ranked.fullName || profile.full_name || 'Not extracted',
            email: ranked.email || profile.email || null,
            phone_number: ranked.phone || profile.phone_number || null,
            location: ranked.location || profile.location || null,
            job_title: ranked.jobTitle || profile.job_title || null,
            years_of_experience: ranked.yearsOfExperience || profile.years_of_experience || null,
            matchScore: isFallback ? 0 : ranked.matchScore,
            reasoning: ranked.reasoning,
            strengths: ranked.strengths || [],
            concerns: ranked.concerns || [],
            isFallback,
            shouldUpdate: !isFallback && ranked.fullName && ranked.fullName !== 'Not extracted'
          };
        }).filter(m => m !== null);

        sendEvent('log', { level: 'info', message: 'Updating candidate profiles...' });

        // Bulk update profiles
        const updatePromises = matches
          .filter(m => m.shouldUpdate)
          .map(m => {
            const updateData: any = {};
            if (m.full_name && m.full_name !== profiles.find(p => p.id === m.id)?.full_name) {
              updateData.full_name = m.full_name;
            }
            if (m.email && m.email !== profiles.find(p => p.id === m.id)?.email) {
              updateData.email = m.email;
            }
            if (m.phone_number && m.phone_number !== profiles.find(p => p.id === m.id)?.phone_number) {
              updateData.phone_number = m.phone_number;
            }
            if (m.location && m.location !== profiles.find(p => p.id === m.id)?.location) {
              updateData.location = m.location;
            }
            if (m.job_title && m.job_title !== profiles.find(p => p.id === m.id)?.job_title) {
              updateData.job_title = m.job_title;
            }
            if (m.years_of_experience && m.years_of_experience !== profiles.find(p => p.id === m.id)?.years_of_experience) {
              updateData.years_of_experience = m.years_of_experience;
            }
            
            if (Object.keys(updateData).length > 0) {
              return supabaseClient
                .from('profiles')
                .update(updateData)
                .eq('id', m.id);
            }
            return null;
          })
          .filter(p => p !== null);
        
        await Promise.allSettled(updatePromises);

        const validMatches = matches.filter(m => !m.isFallback);
        const fallbackCount = matches.filter(m => m.isFallback).length;
        const successCount = validMatches.length;
        const isPartial = processedTotal < profiles.length;
        
        console.log(`✓ Successfully matched ${successCount} candidates, ${fallbackCount} required fallback`);
        sendEvent('log', { level: 'success', message: `Successfully matched ${successCount} candidates, ${fallbackCount} fallback` });

        const completeMessage = isPartial
          ? `Matched ${successCount} candidates (processed ${processedTotal} of ${profiles.length} due to system limits)`
          : `Successfully matched ${successCount} candidates`;

        console.log(`[COMPLETE] Sending complete event with ${validMatches.length} matches (partial=${isPartial})`);
        sendEvent('complete', { 
          matches: validMatches,
          total: profiles.length,
          processed: processedTotal,
          partial: isPartial,
          message: completeMessage
        });
        console.log('[COMPLETE] Complete event sent successfully');

        } catch (processingError: any) {
          console.error('[PROCESSING ERROR]', processingError);
          sendEvent('error', { message: `Processing failed: ${processingError.message || 'Unknown error'}` });
        }

        controller.close();

      } catch (error) {
        console.error('═══ UNHANDLED ERROR IN MATCH-CANDIDATES ═══');
        console.error('Error:', error);
        sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error occurred' });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
