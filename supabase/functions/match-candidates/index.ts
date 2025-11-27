import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let jobDescription: string;
  let candidateIds: string[] | undefined;

  try {
    const body = await req.json();
    jobDescription = body.jobDescription;
    candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds : undefined;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let profiles: any[] = [];
      const allRanked: any[] = [];

      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const authHeader = req.headers.get('Authorization');
        const { data: { user } } = await supabaseClient.auth.getUser(authHeader?.replace('Bearer ', '') ?? '');
        if (!user) throw new Error('Auth failed');

        const GEMINI_KEYS = [1, 2, 3, 4, 5].map(i => Deno.env.get(`GEMINI_API_KEY_${i}`)).filter(Boolean);
        if (!GEMINI_KEYS.length) throw new Error('No API Keys');

        sendEvent('log', {
          level: 'info',
          message: `Using ${GEMINI_KEYS.length} Gemini API keys with 2 parallel workers each (total ${GEMINI_KEYS.length * 2} workers) for matching...`,
        });

        let query = supabaseClient
          .from('profiles')
          .select('id, resume_text, full_name, email, phone_number, location, job_title, years_of_experience, resume_file_url, created_at')
          .eq('user_id', user.id);

        if (candidateIds?.length) query = query.in('id', candidateIds);

        const { data: profilesData, error: fetchError } = await query.order('created_at', { ascending: false });
        profiles = profilesData || [];
        if (fetchError || !profiles.length) {
            sendEvent('complete', { matches: [], message: 'No candidates found' });
            controller.close();
            return;
        }

        sendEvent('log', { level: 'info', message: `Analyzing ${profiles.length} candidates...` });

         // CONFIGURATION: 10 profiles per request, 2 workers per API key
         const BATCH_SIZE = 10;

        // Build batches with stable global indices so candidateIndex mapping stays correct
        const batches: { profiles: any[]; startIndex: number }[] = [];
        for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
          batches.push({
            profiles: profiles.slice(i, i + BATCH_SIZE),
            startIndex: i,
          });
        }

        sendEvent('log', {
          level: 'info',
          message: `Created ${batches.length} internal batches of up to ${BATCH_SIZE} candidates each (max ${BATCH_SIZE * GEMINI_KEYS.length * 2} candidates in parallel).`,
        });

        // allRanked declared above

        let nextBatchIndex = 0;
        let processedCount = 0;

        const processWithKey = async (apiKey: string, workerIndex: number) => {
          while (true) {
            const currentIndex = nextBatchIndex++;
            if (currentIndex >= batches.length) break;

            const { profiles: batch, startIndex } = batches[currentIndex];

            sendEvent('log', {
              level: 'info',
              message: `[Worker ${workerIndex + 1}] Processing internal batch ${currentIndex + 1}/${batches.length} with ${batch.length} candidates...`,
            });

            // Retry logic with exponential backoff
            let lastError: Error | null = null;
            let retryCount = 0;
            const maxRetries = 3;
            let success = false;

            while (retryCount <= maxRetries && !success) {
              try {
                if (retryCount > 0) {
                  const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                  sendEvent('log', {
                    level: 'info',
                    message: `[Worker ${workerIndex + 1}] Retry ${retryCount}/${maxRetries} for batch ${currentIndex + 1} after ${delay}ms delay...`,
                  });
                  await new Promise(resolve => setTimeout(resolve, delay));
                }

                const summaries = batch.map((p, localI) => ({
                  index: startIndex + localI,
                  resume: (p.resume_text || '').slice(0, 15000),
                }));

                const response = await fetch(
                  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-goog-api-key': apiKey as string,
                    },
                    body: JSON.stringify({
                      contents: [{
                        parts: [{
                          text: `Job Description:\n${jobDescription}\n\nCandidates:\n${JSON.stringify(summaries)}\n\nExtract info and match. JSON format: {"candidates": [{"candidateIndex": 0, "fullName": "...", "email": "...", "phone": "...", "location": "...", "jobTitle": "...", "yearsOfExperience": 0, "matchScore": 0, "reasoning": "single concise line only", "strengths": [], "concerns": []}]}. IMPORTANT: "reasoning" must be ONLY ONE SHORT SENTENCE (max 15 words). Return ALL candidates.`,
                        }],
                      }],
                      generationConfig: { responseMimeType: "application/json" },
                    }),
                  },
                );

                const status = response.status;
                
                // Retry on 503 (service unavailable) or 429 (rate limit)
                if ((status === 503 || status === 429) && retryCount < maxRetries) {
                  lastError = new Error(`API ${status}`);
                  retryCount++;
                  continue;
                }

                if (!response.ok) {
                  throw new Error(`API ${status}`);
                }

                const json = await response.json();
                const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!rawText) throw new Error('Empty AI response');

                // Clean markdown code blocks that Gemini sometimes adds
                const cleanedText = rawText
                  .replace(/^```json\s*/, '')  // Remove starting ```json
                  .replace(/^```\s*/, '')      // Remove starting ```
                  .replace(/```$/, '')         // Remove ending ```
                  .trim();

                const parsed = JSON.parse(cleanedText);
                const ranked = parsed.candidates.map((c: any) => {
                  const original = batch[c.candidateIndex - summaries[0].index];
                  return { ...c, originalProfile: original };
                });

                allRanked.push(...ranked);
                success = true;

              const partialMatches = ranked.map((r: any) => ({
                id: r.originalProfile.id,
                full_name: r.fullName || r.originalProfile.full_name,
                matchScore: r.matchScore,
                reasoning: r.reasoning,
                strengths: r.strengths || [],
                concerns: r.concerns || [],
                resume_file_url: r.originalProfile.resume_file_url,
                isFallback: r.isFallback || false,
              }));

              processedCount += batch.length;

              sendEvent('partial', {
                matches: partialMatches,
                processed: processedCount,
                total: profiles.length,
              });

                sendEvent('log', {
                  level: 'info',
                  message: `[Worker ${workerIndex + 1}] Completed batch ${currentIndex + 1}/${batches.length}. Total processed: ${processedCount}/${profiles.length}.`,
                  processed: processedCount,
                  total: profiles.length,
                });

              } catch (err: any) {
                lastError = err;
                retryCount++;
              }
            }

            // If all retries failed, use fallback
            if (!success) {
              sendEvent('log', {
                level: 'error',
                message: `[Worker ${workerIndex + 1}] All retries exhausted for batch ${currentIndex + 1}. Error: ${lastError?.message || 'Unknown error'}`,
              });

              // FALLBACK: Return dummy objects so candidates don't disappear
              const fallbackRanked = batch.map(p => ({
                originalProfile: p,
                fullName: p.full_name || 'Processing Failed',
                matchScore: 0,
                reasoning: 'Analysis failed after retries - manual review needed',
                isFallback: true,
              }));

              allRanked.push(...fallbackRanked);

              const partialMatches = fallbackRanked.map((r: any) => ({
                id: r.originalProfile.id,
                full_name: r.fullName || r.originalProfile.full_name,
                matchScore: r.matchScore,
                reasoning: r.reasoning,
                strengths: r.strengths || [],
                concerns: r.concerns || [],
                resume_file_url: r.originalProfile.resume_file_url,
                isFallback: r.isFallback || false,
              }));

              processedCount += batch.length;

              sendEvent('partial', {
                matches: partialMatches,
                processed: processedCount,
                total: profiles.length,
              });

              sendEvent('log', {
                level: 'error',
                message: `[Worker ${workerIndex + 1}] Failed batch ${currentIndex + 1}/${batches.length} after ${maxRetries} retries. Marking ${batch.length} candidates for manual review. Total processed: ${processedCount}/${profiles.length}.`,
                processed: processedCount,
                total: profiles.length,
              });
            }
          }
        };

        // Use all available API keys in parallel, with 2 workers per key continuously picking up new batches
        try {
          await Promise.all(
            GEMINI_KEYS.flatMap((apiKey, index) => [
              processWithKey(apiKey as string, index * 2),
              processWithKey(apiKey as string, index * 2 + 1),
            ]),
          );

          sendEvent('log', {
            level: 'info',
            message: `All workers completed. Processing results for ${allRanked.length} candidates...`,
          });
        } catch (workerError: any) {
          sendEvent('log', {
            level: 'error',
            message: `Worker error: ${workerError.message}. Continuing with partial results...`,
          });
        }


        const updates = allRanked
            .filter(r => !r.isFallback && r.originalProfile)
            .map(r => {
                const p = r.originalProfile;
                const update: any = { id: p.id };
                let changed = false;

                if (r.fullName && r.fullName !== p.full_name) { update.full_name = r.fullName; changed = true; }
                if (r.email && r.email !== p.email) { update.email = r.email; changed = true; }
                if (r.phone && r.phone !== p.phone_number) { update.phone_number = r.phone; changed = true; }
                if (r.location && r.location !== p.location) { update.location = r.location; changed = true; }
                if (r.jobTitle && r.jobTitle !== p.job_title) { update.job_title = r.jobTitle; changed = true; }
                if (r.yearsOfExperience !== undefined && r.yearsOfExperience !== p.years_of_experience) { 
                    update.years_of_experience = r.yearsOfExperience; changed = true; 
                }

                return changed ? update : null;
            })
            .filter(Boolean);

        if (updates.length) {
            sendEvent('log', {
              level: 'info',
              message: `Updating ${updates.length} candidate profiles in database...`,
            });
            const { error: updateError } = await supabaseClient.from('profiles').upsert(updates, { onConflict: 'id' });
            if (updateError) {
              sendEvent('log', {
                level: 'error',
                message: `Failed to update some profiles: ${updateError.message}`,
              });
            } else {
              sendEvent('log', {
                level: 'info',
                message: `Successfully updated ${updates.length} profiles.`,
              });
            }
        }

        const validMatches = allRanked.map(r => ({
            id: r.originalProfile.id,
            full_name: r.fullName || r.originalProfile.full_name,
            matchScore: r.matchScore,
            reasoning: r.reasoning,
            strengths: r.strengths || [],
            concerns: r.concerns || [],
            resume_file_url: r.originalProfile.resume_file_url,
            isFallback: r.isFallback || false
        })).sort((a, b) => b.matchScore - a.matchScore);

        const fallbackCount = validMatches.filter(m => m.isFallback).length;
        const successCount = validMatches.length - fallbackCount;

        sendEvent('log', {
          level: 'info',
          message: `Sending final results: ${successCount} successfully analyzed, ${fallbackCount} require manual review.`,
        });

        sendEvent('complete', { 
            matches: validMatches, 
            total: profiles.length, 
            processed: allRanked.length,
            message: fallbackCount > 0 
              ? `Matched ${successCount} candidates successfully, ${fallbackCount} require manual review`
              : `Successfully matched all ${validMatches.length} candidates`
        });

        sendEvent('log', {
          level: 'info',
          message: `Processing complete. Stream closing.`,
        });

        controller.close();

      } catch (error: any) {
        sendEvent('error', { message: error.message });
        sendEvent('log', {
          level: 'error',
          message: `Critical error: ${error.message}. Attempting to save partial results...`,
        });

        try {
          if (allRanked.length) {
            const safeTotal = profiles.length || allRanked.length;

            const validMatches = allRanked.map((r: any) => ({
              id: r.originalProfile.id,
              full_name: r.fullName || r.originalProfile.full_name,
              matchScore: r.matchScore,
              reasoning: r.reasoning,
              strengths: r.strengths || [],
              concerns: r.concerns || [],
              resume_file_url: r.originalProfile.resume_file_url,
              isFallback: r.isFallback || false,
            })).sort((a: any, b: any) => b.matchScore - a.matchScore);

            const fallbackCount = validMatches.filter((m: any) => m.isFallback).length;
            const successCount = validMatches.length - fallbackCount;

            sendEvent('log', {
              level: 'info',
              message: `Saving ${validMatches.length} partial results (${successCount} analyzed, ${fallbackCount} require review)...`,
            });

            sendEvent('complete', {
              matches: validMatches,
              total: safeTotal,
              processed: allRanked.length,
              message: `Completed with errors. Returned ${successCount} analyzed candidates and ${fallbackCount} for manual review`,
            });

            sendEvent('log', {
              level: 'info',
              message: `Partial results saved. Stream closing.`,
            });
          } else {
            sendEvent('log', {
              level: 'error',
              message: `No results to save. Stream closing.`,
            });
          }
        } catch (finalError: any) {
          sendEvent('log', {
            level: 'error',
            message: `Failed to save partial results: ${finalError.message}`,
          });
        }

        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
});
