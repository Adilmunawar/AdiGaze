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
    const { jobDescription } = await req.json();

    if (!jobDescription) {
      return new Response(
        JSON.stringify({ error: 'Job description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use GEMINI_API_KEY_5 for this function
    const apiKey = Deno.env.get('GEMINI_API_KEY_5');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY_5 not configured');
    }

    const prompt = `You are an expert job description writer and HR specialist. Enhance the following job description to make it more comprehensive, professional, and detailed. 

Key requirements:
- Expand technical requirements with specific tools and technologies
- Add clear qualification levels (required vs preferred)
- Include specific years of experience needed
- Format it professionally with clear sections
- Make it more detailed and specific
- Keep the same core requirements but elaborate on them
- Add any missing important sections (like soft skills, work environment, etc.)

Original Job Description:
${jobDescription}

Return ONLY the enhanced job description text. No explanations, preambles, or markdown formatting.`;

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
            temperature: 0.7,
            maxOutputTokens: 3000,
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Gemini API response:', JSON.stringify(data, null, 2));
    
    let enhancedDescription = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean up any markdown formatting
    enhancedDescription = enhancedDescription.replace(/```\s*/g, '').trim();

    if (!enhancedDescription) {
      console.error('Empty response from Gemini API');
      throw new Error('No enhanced description received from AI');
    }

    console.log('Enhanced description length:', enhancedDescription.length);

    return new Response(
      JSON.stringify({ enhancedDescription }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enhance-description:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
