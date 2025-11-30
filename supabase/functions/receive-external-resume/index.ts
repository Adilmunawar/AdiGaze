import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SubmissionRequest {
  candidate_name: string;
  candidate_email?: string;
  candidate_phone?: string;
  interested_job: string;
  admin_email: string;
  honeypot?: string; // Bot detection field
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse FormData
    const formData = await req.formData();
    
    const candidate_name = formData.get("candidate_name") as string;
    const candidate_email = formData.get("candidate_email") as string | null;
    const candidate_phone = formData.get("candidate_phone") as string | null;
    const interested_job = formData.get("interested_job") as string;
    const admin_email = formData.get("admin_email") as string;
    const honeypot = formData.get("honeypot") as string | null;
    const resumeFile = formData.get("resume") as File | null;

    // Bot detection - honeypot field should be empty
    if (honeypot && honeypot.trim() !== "") {
      console.log("Bot detected via honeypot field");
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    if (!candidate_name || !interested_job || !admin_email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: candidate_name, interested_job, admin_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resumeFile) {
      return new Response(
        JSON.stringify({ error: "Resume file is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (!allowedTypes.includes(resumeFile.type)) {
      return new Response(
        JSON.stringify({ error: "Invalid file type. Only PDF and DOCX files are allowed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (resumeFile.size > maxSize) {
      return new Response(
        JSON.stringify({ error: "File too large. Maximum size is 10MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find admin by receiving email
    const { data: adminSettings, error: adminError } = await supabase
      .from("admin_settings")
      .select("user_id, is_active")
      .eq("receiving_email", admin_email.toLowerCase().trim())
      .single();

    if (adminError || !adminSettings) {
      console.error("Admin not found:", adminError);
      return new Response(
        JSON.stringify({ error: "Invalid admin email. This admin is not configured to receive submissions." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!adminSettings.is_active) {
      return new Response(
        JSON.stringify({ error: "This admin is not currently accepting submissions." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminUserId = adminSettings.user_id;

    // Upload resume to storage
    const timestamp = Date.now();
    const safeFileName = resumeFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${adminUserId}/${timestamp}_${safeFileName}`;

    const fileBuffer = await resumeFile.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("external-resumes")
      .upload(filePath, fileBuffer, {
        contentType: resumeFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload resume file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("external-resumes")
      .getPublicUrl(filePath);

    const resumeFileUrl = urlData.publicUrl;

    // Parse resume using Gemini
    let parsedData: any = null;
    try {
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
      console.log("GEMINI_API_KEY available:", !!geminiApiKey);
      console.log("File type:", resumeFile.type);
      
      // Support both PDF and DOCX
      const supportedForParsing = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ];
      
      if (geminiApiKey && supportedForParsing.includes(resumeFile.type)) {
        const fileBase64 = btoa(
          new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        console.log("Calling Gemini API for resume parsing...");
        
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inline_data: {
                        mime_type: resumeFile.type,
                        data: fileBase64,
                      },
                    },
                    {
                      text: `Extract the following information from this resume in JSON format:
                      {
                        "full_name": "string or null",
                        "email": "string or null",
                        "phone": "string or null",
                        "location": "string or null",
                        "skills": ["array of skills"],
                        "experience_years": number or null,
                        "education": "string summary or null",
                        "job_title": "most recent job title or null",
                        "experience": "work experience summary or null",
                        "summary": "brief professional summary"
                      }
                      Return ONLY valid JSON, no markdown or explanation.`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        console.log("Gemini response status:", geminiResponse.status);
        
        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          console.log("Gemini text content:", textContent?.substring(0, 200));
          
          if (textContent) {
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedData = JSON.parse(jsonMatch[0]);
              console.log("Successfully parsed resume data:", JSON.stringify(parsedData).substring(0, 200));
            }
          }
        } else {
          const errorText = await geminiResponse.text();
          console.error("Gemini API error:", geminiResponse.status, errorText);
        }
      } else {
        console.log("Skipping parsing - no API key or unsupported file type");
      }
    } catch (parseError) {
      console.error("Resume parsing error (non-fatal):", parseError);
      // Continue without parsed data
    }

    // Insert submission
    const { data: submission, error: insertError } = await supabase
      .from("external_submissions")
      .insert({
        candidate_name: candidate_name.trim(),
        candidate_email: candidate_email?.trim() || null,
        candidate_phone: candidate_phone?.trim() || null,
        interested_job: interested_job.trim(),
        resume_file_url: resumeFileUrl,
        admin_user_id: adminUserId,
        status: "pending",
        parsed_data: parsedData,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save submission" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("External submission received:", submission.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Resume submitted successfully",
        submission_id: submission.id 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
