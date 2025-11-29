import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");

    if (!clientId) {
      throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID in Supabase secrets");
    }

    const { redirect_uri } = await req.json();

    if (!redirect_uri) {
      throw new Error("Missing redirect_uri in request body");
    }

    const scope = "https://www.googleapis.com/auth/drive.file";

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&response_type=code&scope=${encodeURIComponent(scope)}` +
      `&access_type=offline&prompt=consent`;

    return new Response(
      JSON.stringify({ authUrl }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("Error in google-drive-auth-url:", error);
    return new Response(
      JSON.stringify({ error: error.message ?? "Unexpected error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
