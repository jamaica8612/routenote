import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");

    if (!name) {
      return new Response(
        JSON.stringify({ error: "Query parameter 'name' is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Korea bounding box: lat 33~38.6, lng 124~132
    const query = `[out:json][timeout:30][bbox:33,124,38.6,132];
way["name"="${name}"]["highway"];
out geom;`;

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Overpass API error", status: response.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    const ways = (data.elements ?? [])
      .filter((el: { type: string; geometry?: { lat: number; lon: number }[] }) =>
        el.type === "way" && Array.isArray(el.geometry)
      )
      .map((el: { geometry: { lat: number; lon: number }[] }) =>
        el.geometry.map((pt) => ({ lat: pt.lat, lng: pt.lon }))
      );

    return new Response(JSON.stringify({ ways }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
