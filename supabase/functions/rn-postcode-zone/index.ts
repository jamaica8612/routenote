import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import proj4 from "https://esm.sh/proj4@2.19.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const EPSG_5179 =
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs";

const JUSO_POSTCODE_URL = "https://www.juso.go.kr/api/totalMap/selectKarbSbdList";

proj4.defs("EPSG:5179", EPSG_5179);

function transformCoordinate(coord: [number, number]) {
  return proj4("EPSG:5179", "EPSG:4326", coord) as [number, number];
}

function transformGeometry(geometry: { type: string; coordinates: number[][][][] | number[][][] }) {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: (geometry.coordinates as number[][][]).map((ring) =>
        ring.map((coord) => transformCoordinate(coord as [number, number])),
      ),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: (geometry.coordinates as number[][][][]).map((polygon) =>
        polygon.map((ring) => ring.map((coord) => transformCoordinate(coord as [number, number]))),
      ),
    };
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const postcode = url.searchParams.get("postcode")?.trim() || "";

    if (!/^\d{5}$/.test(postcode)) {
      return new Response(JSON.stringify({ error: "올바른 5자리 우편번호를 입력해주세요." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(JUSO_POSTCODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        districtNo: postcode,
        pageable: {
          page: 0,
          size: 1,
          sort: [],
        },
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `행정망 우편번호 조회에 실패했습니다. (상태 코드: ${response.status})` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await response.json();
    const item = payload?.results?.content?.[0];

    if (!item?.geom) {
      return new Response(JSON.stringify({ error: "해당 우편번호의 구역 경계 데이터를 찾을 수 없습니다." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geometry5179 = JSON.parse(item.geom);
    const geometry = transformGeometry(geometry5179);

    return new Response(
      JSON.stringify({
        postcode: item.sbdno,
        cityName: item.ctpvNm,
        districtName: item.sigNm,
        neighborhoodCode: item.lgvReplcCd,
        source: "supabase-edge",
        geometry,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: `서버 에러가 발생했습니다: ${error.message}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
