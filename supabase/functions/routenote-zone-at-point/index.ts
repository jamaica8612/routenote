import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isPointInSinglePolygon(lat: number, lng: number, ringCoords: number[][]) {
  let inside = false;
  const n = ringCoords.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ringCoords[i][0];
    const yi = ringCoords[i][1];
    const xj = ringCoords[j][0];
    const yj = ringCoords[j][1];

    const intersects = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function isPointInPolygonGeometry(lat: number, lng: number, coords: number[][][]) {
  if (!coords?.length || !isPointInSinglePolygon(lat, lng, coords[0])) return false;

  for (let i = 1; i < coords.length; i += 1) {
    if (isPointInSinglePolygon(lat, lng, coords[i])) return false;
  }

  return true;
}

function isPointInZone(lat: number, lng: number, polygon: any) {
  const geom = polygon?.type === "Feature" ? polygon.geometry : polygon;

  if (geom?.type === "Polygon") {
    return isPointInPolygonGeometry(lat, lng, geom.coordinates);
  }

  if (geom?.type === "MultiPolygon") {
    return geom.coordinates.some((coords: number[][][]) => isPointInPolygonGeometry(lat, lng, coords));
  }

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { lat, lng } = await req.json();
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return new Response(JSON.stringify({ error: "lat and lng must be numbers." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from("routenote_route_zones")
      .select("id,name,color,memo,image_url,polygon,is_deleted,created_at,updated_at")
      .eq("is_deleted", false);

    if (error) throw error;

    const zone = (data || []).find((candidate) => isPointInZone(latitude, longitude, candidate.polygon));

    return new Response(JSON.stringify({ zone: zone || null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
