import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobDescription, availableTitles } = await req.json();

    if (!jobDescription || !availableTitles || availableTitles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Job description and available titles are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use GEMINI_API_KEY_5 for this function
    const apiKey = Deno.env.get('GEMINI_API_KEY_5');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY_5 not configured');
    }

    const prompt = `You are a job matching expert. Given a job description and a list of job titles, select ALL job titles that would be relevant for this position. Include variations in spelling, capitalization, and seniority levels (e.g., "GIS Analyst", "G.I.S. Analyst", "Senior GIS Analyst" are all relevant if the job is about GIS).

Job Description:
${jobDescription}

Available Job Titles:
${availableTitles.join('\n')}

Return ONLY a JSON array of the relevant job titles (exact strings from the list above). No explanation, just the JSON array.

Example format: ["Software Engineer", "Senior Software Engineer", "Software Developer"]`;

    // Retry logic with exponential backoff
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: prompt }]
              }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2000,
              }
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini API error (attempt ${attempt + 1}):`, response.status, errorText);
          
          // Retry on 503 (Service Unavailable) and 429 (Rate Limit)
          if ((response.status === 503 || response.status === 429) && attempt < maxRetries - 1) {
            lastError = new Error(`Gemini API temporarily unavailable (${response.status})`);
            continue;
          }
          
          throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

        // Clean up markdown code blocks if present
        textResponse = textResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        const suggestedTitles = JSON.parse(textResponse);

        return new Response(
          JSON.stringify({ suggestedTitles }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        // If it's not a fetch/network error, throw immediately
        if (!(error instanceof Error) || !error.message.includes('Gemini API')) {
          throw error;
        }
        lastError = error;
        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
    
    throw lastError || new Error('Failed after retries');

  } catch (error) {
    console.error('Error in suggest-job-titles:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
