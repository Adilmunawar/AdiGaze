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

  try {
    const { jobDescription } = await req.json();

    if (!jobDescription) {
      return new Response(
        JSON.stringify({ error: 'Job description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Matching candidates for job description...');

    // Use service role key to read all profiles
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all profiles
    const { data: profiles, error: fetchError } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ 
          matches: [],
          message: 'No candidates found in database'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${profiles.length} profiles, processing in parallel batches...`);

    // Prepare candidate summaries with reduced text size for faster processing
    const candidateSummaries = profiles.map((profile, index) => {
      const text = (profile.resume_text || '').toString();
      const snippet = text.length > 2000 ? text.slice(0, 2000) : text;
      return {
        id: profile.id,
        index,
        summary: `Candidate ${index + 1}:\n${snippet}`.trim()
      };
    });

    // Split candidates into batches of 10 for parallel processing
    const BATCH_SIZE = 10;
    const batches: typeof candidateSummaries[] = [];
    for (let i = 0; i < candidateSummaries.length; i += BATCH_SIZE) {
      batches.push(candidateSummaries.slice(i, i + BATCH_SIZE));
    }

    // Process batches in parallel with Gemini 2.5 Flash
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    const processBatch = async (batch: typeof candidateSummaries, batchIndex: number) => {
      const maxRetries = 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are an expert technical recruiter. Analyze each candidate's resume and extract details while ranking them against the job description.

For EACH candidate, extract: name, email, phone, location, job title, years of experience, match score (0-100), key strengths, and concerns.

Job Description:
${jobDescription}

Candidates:
${batch.map(c => c.summary).join('\n\n---\n\n')}`
                }]
              }],
              tools: [{
                function_declarations: [{
                  name: "rank_candidates",
                  description: "Rank and extract details from candidate resumes",
                  parameters: {
                    type: "object",
                    properties: {
                      candidates: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            candidateIndex: { type: "number" },
                            fullName: { type: "string" },
                            email: { type: "string" },
                            phone: { type: "string" },
                            location: { type: "string" },
                            jobTitle: { type: "string" },
                            yearsOfExperience: { type: "number" },
                            matchScore: { type: "number" },
                            reasoning: { type: "string" },
                            strengths: { type: "array", items: { type: "string" } },
                            concerns: { type: "array", items: { type: "string" } }
                          },
                          required: ["candidateIndex", "fullName", "matchScore", "reasoning", "strengths"]
                        }
                      }
                    },
                    required: ["candidates"]
                  }
                }]
              }],
              tool_config: {
                function_calling_config: {
                  mode: "ANY",
                  allowed_function_names: ["rank_candidates"]
                }
              }
            })
          });

          if (response.ok) {
            const data = await response.json();
            const functionCall = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
            
            if (functionCall?.name === 'rank_candidates') {
              console.log(`Batch ${batchIndex + 1} processed successfully`);
              return functionCall.args?.candidates || [];
            }
          }

          if (response.status === 429 && attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
            continue;
          }
          
          throw new Error(`Batch ${batchIndex + 1} failed: ${response.status}`);
        } catch (error) {
          if (attempt === maxRetries - 1) {
            console.error(`Batch ${batchIndex + 1} failed after ${maxRetries} attempts:`, error);
            // Return fallback for this batch
            return batch.map(c => ({
              candidateIndex: c.index,
              fullName: `Candidate ${c.index + 1}`,
              email: null,
              phone: null,
              location: null,
              jobTitle: null,
              yearsOfExperience: null,
              matchScore: 50,
              reasoning: 'Processing failed',
              strengths: [],
              concerns: ['AI analysis unavailable']
            }));
          }
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
        }
      }
      return [];
    };

    // Process all batches in parallel
    console.log(`Processing ${batches.length} batches in parallel...`);
    const batchResults = await Promise.all(
      batches.map((batch, index) => processBatch(batch, index))
    );

    // Flatten results and sort by match score
    const rankedCandidates = batchResults
      .flat()
      .sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
    
    console.log(`Successfully processed ${rankedCandidates.length} candidates`);

    // Merge AI rankings with full profile data
    const matches = rankedCandidates.map((ranked: any) => {
      const profile = profiles[ranked.candidateIndex];
      return {
        id: profile.id,
        resume_file_url: profile.resume_file_url,
        resume_text: profile.resume_text,
        created_at: profile.created_at,
        // Extracted candidate details
        full_name: ranked.fullName || 'Not extracted',
        email: ranked.email || null,
        phone_number: ranked.phone || null,
        location: ranked.location || null,
        job_title: ranked.jobTitle || null,
        years_of_experience: ranked.yearsOfExperience || null,
        // Ranking details
        matchScore: ranked.matchScore,
        reasoning: ranked.reasoning,
        strengths: ranked.strengths || [],
        concerns: ranked.concerns || []
      };
    });

    console.log(`Successfully ranked ${matches.length} candidates`);

    return new Response(
      JSON.stringify({ 
        matches,
        total: profiles.length,
        message: `Found ${matches.length} matching candidates`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in match-candidates function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});