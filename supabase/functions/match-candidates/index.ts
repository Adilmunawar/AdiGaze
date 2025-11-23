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

            try {
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

              if (!response.ok) throw new Error(`API ${response.status}`);
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
              // FALLBACK: Return dummy objects so candidates don't disappear
              const fallbackRanked = batch.map(p => ({
                originalProfile: p,
                fullName: p.full_name || 'Processing Failed',
                matchScore: 0,
                reasoning: 'Analysis failed - manual review needed',
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
                message: `[Worker ${workerIndex + 1}] Failed batch ${currentIndex + 1}/${batches.length}. Marking ${batch.length} candidates for manual review. Total processed: ${processedCount}/${profiles.length}.`,
                processed: processedCount,
                total: profiles.length,
              });
            }
          }
        };

        // Use all available API keys in parallel, with 2 workers per key continuously picking up new batches
        await Promise.all(
          GEMINI_KEYS.flatMap((apiKey, index) => [
            processWithKey(apiKey as string, index * 2),
            processWithKey(apiKey as string, index * 2 + 1),
          ]),
        );


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
            await supabaseClient.from('profiles').upsert(updates, { onConflict: 'id' });
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

        sendEvent('complete', { 
            matches: validMatches, 
            total: profiles.length, 
            processed: allRanked.length,
            message: `Successfully matched ${validMatches.length} candidates`
        });

        controller.close();

      } catch (error: any) {
        sendEvent('error', { message: error.message });

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

            sendEvent('complete', {
              matches: validMatches,
              total: safeTotal,
              processed: allRanked.length,
              message: `Completed with errors. Returned ${validMatches.length} candidates`,
            });
          }
        } catch (_finalError) {
          // Ignore errors when sending final partial results
        }

        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
});
