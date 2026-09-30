-- Standalone RouteNote only. Existing rn_*, quickflex_note_* and Auth hooks are untouched.
-- Apply only after confirming the shared Auth account mapping.
SET LOCAL search_path = public, auth, extensions;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'routenote\_%' ESCAPE '\')
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'routenote\_%' ESCAPE '\')
     OR EXISTS (SELECT 1 FROM storage.buckets WHERE id='routenote-photos') THEN
    RAISE EXCEPTION 'RouteNote destination namespace is already in use; refusing to overwrite';
  END IF;
END;
$guard$;

CREATE TABLE public."routenote_announcement_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."routenote_announcement_comments" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_announcement_comments" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_announcement_comments" TO authenticated;
GRANT ALL ON public."routenote_announcement_comments" TO service_role;

CREATE TABLE public."routenote_announcements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "content" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);
ALTER TABLE public."routenote_announcements" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_announcements" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_announcements" TO authenticated;
GRANT ALL ON public."routenote_announcements" TO service_role;

CREATE TABLE public."routenote_location_share_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "requester_id" uuid NOT NULL,
  "recipient_id" uuid NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "responded_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "expires_at" timestamp with time zone DEFAULT (now() + '08:00:00'::interval) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."routenote_location_share_requests" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_location_share_requests" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_location_share_requests" TO authenticated;
GRANT ALL ON public."routenote_location_share_requests" TO service_role;

CREATE TABLE public."routenote_market_buildings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pos_lat" numeric,
  "pos_lng" numeric,
  "icon" text DEFAULT '🏬'::text
);
ALTER TABLE public."routenote_market_buildings" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_market_buildings" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_market_buildings" TO authenticated;
GRANT ALL ON public."routenote_market_buildings" TO service_role;

CREATE TABLE public."routenote_market_route_map_cell_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cell_id" text NOT NULL,
  "old_value" text,
  "new_value" text NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."routenote_market_route_map_cell_history" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_market_route_map_cell_history" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_market_route_map_cell_history" TO authenticated;
GRANT ALL ON public."routenote_market_route_map_cell_history" TO service_role;

CREATE TABLE public."routenote_market_route_map_cells" (
  "cell_id" text NOT NULL,
  "row_index" integer NOT NULL,
  "col_index" integer NOT NULL,
  "rowspan" integer DEFAULT 1 NOT NULL,
  "colspan" integer DEFAULT 1 NOT NULL,
  "value" text DEFAULT ''::text NOT NULL,
  "search_text" text DEFAULT ''::text NOT NULL,
  "style" text,
  "width_px" integer DEFAULT 31 NOT NULL,
  "height_px" integer DEFAULT 21 NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."routenote_market_route_map_cells" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_market_route_map_cells" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_market_route_map_cells" TO authenticated;
GRANT ALL ON public."routenote_market_route_map_cells" TO service_role;

CREATE TABLE public."routenote_market_route_map_settings" (
  "key" text NOT NULL,
  "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."routenote_market_route_map_settings" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_market_route_map_settings" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_market_route_map_settings" TO authenticated;
GRANT ALL ON public."routenote_market_route_map_settings" TO service_role;

CREATE TABLE public."routenote_market_stall_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "stall_id" uuid NOT NULL,
  "changed_by" uuid NOT NULL,
  "change_type" text DEFAULT 'update'::text NOT NULL,
  "old_data" jsonb,
  "new_data" jsonb,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."routenote_market_stall_history" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_market_stall_history" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_market_stall_history" TO authenticated;
GRANT ALL ON public."routenote_market_stall_history" TO service_role;

CREATE TABLE public."routenote_market_stalls" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "building_id" uuid NOT NULL,
  "row_idx" integer NOT NULL,
  "col_idx" integer NOT NULL,
  "stall_number" text,
  "vendor_name" text,
  "section_name" text,
  "company_name" text,
  "cell_type" text DEFAULT 'stall'::text NOT NULL,
  "notes" text,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "borders" jsonb
);
ALTER TABLE public."routenote_market_stalls" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_market_stalls" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_market_stalls" TO authenticated;
GRANT ALL ON public."routenote_market_stalls" TO service_role;

CREATE TABLE public."routenote_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recipient_id" uuid NOT NULL,
  "sender_id" uuid,
  "type" text NOT NULL,
  "tip_id" uuid,
  "comment_id" uuid,
  "message" text,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."routenote_notifications" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_notifications" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_notifications" TO authenticated;
GRANT ALL ON public."routenote_notifications" TO service_role;

CREATE TABLE public."routenote_profiles" (
  "id" uuid NOT NULL,
  "email" text,
  "name" text,
  "avatar_url" text,
  "role" text DEFAULT 'member'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."routenote_profiles" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_profiles" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_profiles" TO authenticated;
GRANT ALL ON public."routenote_profiles" TO service_role;

CREATE TABLE public."routenote_push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."routenote_push_subscriptions" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_push_subscriptions" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_push_subscriptions" TO authenticated;
GRANT ALL ON public."routenote_push_subscriptions" TO service_role;

CREATE TABLE public."routenote_route_path_points" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "path_id" uuid,
  "order_index" integer NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "title" text,
  "memo" text
);
ALTER TABLE public."routenote_route_path_points" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_route_path_points" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_route_path_points" TO authenticated;
GRANT ALL ON public."routenote_route_path_points" TO service_role;

CREATE TABLE public."routenote_route_paths" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "zone_id" uuid,
  "name" text NOT NULL,
  "memo" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_deleted" boolean DEFAULT false
);
ALTER TABLE public."routenote_route_paths" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_route_paths" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_route_paths" TO authenticated;
GRANT ALL ON public."routenote_route_paths" TO service_role;

CREATE TABLE public."routenote_route_tip_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tip_id" uuid,
  "action" text NOT NULL,
  "old_data" jsonb,
  "new_data" jsonb,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."routenote_route_tip_history" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_route_tip_history" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_route_tip_history" TO authenticated;
GRANT ALL ON public."routenote_route_tip_history" TO service_role;

CREATE TABLE public."routenote_route_tip_photos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tip_id" uuid,
  "storage_path" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "is_deleted" boolean DEFAULT false
);
ALTER TABLE public."routenote_route_tip_photos" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_route_tip_photos" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_route_tip_photos" TO authenticated;
GRANT ALL ON public."routenote_route_tip_photos" TO service_role;

CREATE TABLE public."routenote_route_tips" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "zone_id" uuid,
  "title" text NOT NULL,
  "marker_type" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "tags" text[],
  "memo" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "last_verified_at" timestamp with time zone,
  "last_verified_by" uuid,
  "is_deleted" boolean DEFAULT false
);
ALTER TABLE public."routenote_route_tips" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_route_tips" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_route_tips" TO authenticated;
GRANT ALL ON public."routenote_route_tips" TO service_role;

CREATE TABLE public."routenote_route_zone_photos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "zone_id" uuid,
  "storage_path" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "is_deleted" boolean DEFAULT false
);
ALTER TABLE public."routenote_route_zone_photos" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_route_zone_photos" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_route_zone_photos" TO authenticated;
GRANT ALL ON public."routenote_route_zone_photos" TO service_role;

CREATE TABLE public."routenote_route_zones" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "polygon" jsonb NOT NULL,
  "color" text,
  "memo" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_deleted" boolean DEFAULT false,
  "image_url" text
);
ALTER TABLE public."routenote_route_zones" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_route_zones" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_route_zones" TO authenticated;
GRANT ALL ON public."routenote_route_zones" TO service_role;

CREATE TABLE public."routenote_tip_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tip_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_deleted" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."routenote_tip_comments" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_tip_comments" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_tip_comments" TO authenticated;
GRANT ALL ON public."routenote_tip_comments" TO service_role;

CREATE TABLE public."routenote_tip_likes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tip_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."routenote_tip_likes" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."routenote_tip_likes" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."routenote_tip_likes" TO authenticated;
GRANT ALL ON public."routenote_tip_likes" TO service_role;

ALTER TABLE public."routenote_profiles" ADD CONSTRAINT "routenote_profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])));
ALTER TABLE public."routenote_profiles" ADD CONSTRAINT "routenote_profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_route_zones" ADD CONSTRAINT "routenote_route_zones_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_route_tips" ADD CONSTRAINT "routenote_route_tips_marker_type_check" CHECK ((marker_type = ANY (ARRAY['vehicle_entrance'::text, 'parking'::text, 'entrance'::text, 'elevator'::text, 'stairs'::text, 'restroom'::text, 'dog'::text, 'cat'::text, 'delivery_spot'::text, 'warning'::text, 'construction'::text, 'access_code'::text, 'security'::text, 'storage'::text, 'walk_in'::text, 'unloading'::text, 'locked'::text, 'quiet'::text, 'no_entry'::text, 'important'::text])));
ALTER TABLE public."routenote_route_tips" ADD CONSTRAINT "routenote_route_tips_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_route_tip_history" ADD CONSTRAINT "routenote_route_tip_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_route_tip_photos" ADD CONSTRAINT "routenote_route_tip_photos_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_route_paths" ADD CONSTRAINT "routenote_route_paths_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_route_path_points" ADD CONSTRAINT "routenote_route_path_points_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_route_zone_photos" ADD CONSTRAINT "routenote_route_zone_photos_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_market_route_map_cell_history" ADD CONSTRAINT "routenote_market_route_map_cell_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_market_route_map_cells" ADD CONSTRAINT "routenote_market_route_map_cells_pkey" PRIMARY KEY (cell_id);
ALTER TABLE public."routenote_market_route_map_settings" ADD CONSTRAINT "routenote_market_route_map_settings_pkey" PRIMARY KEY (key);
ALTER TABLE public."routenote_push_subscriptions" ADD CONSTRAINT "routenote_push_subscriptions_endpoint_key" UNIQUE (endpoint);
ALTER TABLE public."routenote_tip_comments" ADD CONSTRAINT "routenote_tip_comments_content_check" CHECK (((char_length(content) > 0) AND (char_length(content) <= 500)));
ALTER TABLE public."routenote_tip_comments" ADD CONSTRAINT "routenote_tip_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_tip_likes" ADD CONSTRAINT "routenote_tip_likes_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_tip_likes" ADD CONSTRAINT "routenote_tip_likes_tip_id_created_by_key" UNIQUE (tip_id, created_by);
ALTER TABLE public."routenote_notifications" ADD CONSTRAINT "routenote_notifications_type_check" CHECK ((type = ANY (ARRAY['mention'::text, 'location_share_request'::text, 'location_share_accepted'::text])));
ALTER TABLE public."routenote_notifications" ADD CONSTRAINT "routenote_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_location_share_requests" ADD CONSTRAINT "routenote_location_share_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'ended'::text, 'canceled'::text])));
ALTER TABLE public."routenote_location_share_requests" ADD CONSTRAINT "routenote_location_share_requests_check" CHECK ((requester_id <> recipient_id));
ALTER TABLE public."routenote_location_share_requests" ADD CONSTRAINT "routenote_location_share_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_push_subscriptions" ADD CONSTRAINT "routenote_push_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_announcements" ADD CONSTRAINT "routenote_announcements_title_check" CHECK (((char_length(title) > 0) AND (char_length(title) <= 100)));
ALTER TABLE public."routenote_announcements" ADD CONSTRAINT "routenote_announcements_content_check" CHECK (((content IS NULL) OR (char_length(content) <= 500)));
ALTER TABLE public."routenote_announcements" ADD CONSTRAINT "routenote_announcements_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_announcement_comments" ADD CONSTRAINT "routenote_announcement_comments_content_check" CHECK (((char_length(content) > 0) AND (char_length(content) <= 300)));
ALTER TABLE public."routenote_announcement_comments" ADD CONSTRAINT "routenote_announcement_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_market_buildings" ADD CONSTRAINT "routenote_market_buildings_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_market_buildings" ADD CONSTRAINT "routenote_market_buildings_code_key" UNIQUE (code);
ALTER TABLE public."routenote_market_stalls" ADD CONSTRAINT "routenote_market_stalls_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_market_stalls" ADD CONSTRAINT "routenote_market_stalls_building_id_row_idx_col_idx_key" UNIQUE (building_id, row_idx, col_idx);
ALTER TABLE public."routenote_market_stall_history" ADD CONSTRAINT "routenote_market_stall_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."routenote_profiles" ADD CONSTRAINT "routenote_profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_route_zones" ADD CONSTRAINT "routenote_route_zones_created_by_fkey" FOREIGN KEY (created_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_zones" ADD CONSTRAINT "routenote_route_zones_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_tips" ADD CONSTRAINT "routenote_route_tips_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES routenote_route_zones(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_tips" ADD CONSTRAINT "routenote_route_tips_created_by_fkey" FOREIGN KEY (created_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_tips" ADD CONSTRAINT "routenote_route_tips_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_tips" ADD CONSTRAINT "routenote_route_tips_last_verified_by_fkey" FOREIGN KEY (last_verified_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_tip_history" ADD CONSTRAINT "routenote_route_tip_history_tip_id_fkey" FOREIGN KEY (tip_id) REFERENCES routenote_route_tips(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_route_tip_history" ADD CONSTRAINT "routenote_route_tip_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_tip_photos" ADD CONSTRAINT "routenote_route_tip_photos_tip_id_fkey" FOREIGN KEY (tip_id) REFERENCES routenote_route_tips(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_route_tip_photos" ADD CONSTRAINT "routenote_route_tip_photos_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_paths" ADD CONSTRAINT "routenote_route_paths_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES routenote_route_zones(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_paths" ADD CONSTRAINT "routenote_route_paths_created_by_fkey" FOREIGN KEY (created_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_paths" ADD CONSTRAINT "routenote_route_paths_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_route_path_points" ADD CONSTRAINT "routenote_route_path_points_path_id_fkey" FOREIGN KEY (path_id) REFERENCES routenote_route_paths(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_route_zone_photos" ADD CONSTRAINT "routenote_route_zone_photos_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES routenote_route_zones(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_route_zone_photos" ADD CONSTRAINT "routenote_route_zone_photos_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_market_route_map_cell_history" ADD CONSTRAINT "routenote_market_route_map_cell_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_market_route_map_cells" ADD CONSTRAINT "routenote_market_route_map_cells_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_market_route_map_settings" ADD CONSTRAINT "routenote_market_route_map_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES routenote_profiles(id);
ALTER TABLE public."routenote_push_subscriptions" ADD CONSTRAINT "routenote_push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_tip_comments" ADD CONSTRAINT "routenote_tip_comments_tip_id_fkey" FOREIGN KEY (tip_id) REFERENCES routenote_route_tips(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_tip_comments" ADD CONSTRAINT "routenote_tip_comments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_tip_likes" ADD CONSTRAINT "routenote_tip_likes_tip_id_fkey" FOREIGN KEY (tip_id) REFERENCES routenote_route_tips(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_tip_likes" ADD CONSTRAINT "routenote_tip_likes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_notifications" ADD CONSTRAINT "routenote_notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_notifications" ADD CONSTRAINT "routenote_notifications_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES routenote_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_notifications" ADD CONSTRAINT "routenote_notifications_tip_id_fkey" FOREIGN KEY (tip_id) REFERENCES routenote_route_tips(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_notifications" ADD CONSTRAINT "routenote_notifications_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES routenote_tip_comments(id) ON DELETE SET NULL;
ALTER TABLE public."routenote_location_share_requests" ADD CONSTRAINT "routenote_location_share_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_location_share_requests" ADD CONSTRAINT "routenote_location_share_requests_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_announcements" ADD CONSTRAINT "routenote_announcements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_announcement_comments" ADD CONSTRAINT "routenote_announcement_comments_announcement_id_fkey" FOREIGN KEY (announcement_id) REFERENCES routenote_announcements(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_announcement_comments" ADD CONSTRAINT "routenote_announcement_comments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES routenote_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_market_stalls" ADD CONSTRAINT "routenote_market_stalls_building_id_fkey" FOREIGN KEY (building_id) REFERENCES routenote_market_buildings(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_market_stall_history" ADD CONSTRAINT "routenote_market_stall_history_stall_id_fkey" FOREIGN KEY (stall_id) REFERENCES routenote_market_stalls(id) ON DELETE CASCADE;
ALTER TABLE public."routenote_market_stall_history" ADD CONSTRAINT "routenote_market_stall_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES routenote_profiles(id) ON DELETE CASCADE;

CREATE INDEX routenote_tip_likes_tip_idx ON public.routenote_tip_likes USING btree (tip_id);
CREATE INDEX routenote_market_route_map_cell_history_cell_id_changed_at_idx ON public.routenote_market_route_map_cell_history USING btree (cell_id, changed_at DESC);
CREATE INDEX routenote_location_share_requests_requester_idx ON public.routenote_location_share_requests USING btree (requester_id, status, updated_at DESC);
CREATE INDEX routenote_ann_comments_ann_idx ON public.routenote_announcement_comments USING btree (announcement_id, created_at);
CREATE INDEX routenote_tip_comments_tip_idx ON public.routenote_tip_comments USING btree (tip_id, created_at);
CREATE INDEX routenote_market_stall_history_stall_idx ON public.routenote_market_stall_history USING btree (stall_id, changed_at DESC);
CREATE INDEX routenote_announcements_active_idx ON public.routenote_announcements USING btree (is_active, created_at DESC);
CREATE INDEX routenote_push_subscriptions_user_idx ON public.routenote_push_subscriptions USING btree (user_id, updated_at DESC);
CREATE INDEX routenote_market_stalls_building_idx ON public.routenote_market_stalls USING btree (building_id, row_idx, col_idx);
CREATE INDEX routenote_market_route_map_cells_search_text_idx ON public.routenote_market_route_map_cells USING btree (search_text);
CREATE INDEX routenote_notifications_recipient_idx ON public.routenote_notifications USING btree (recipient_id, is_read, created_at DESC);
CREATE INDEX routenote_location_share_requests_recipient_idx ON public.routenote_location_share_requests USING btree (recipient_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.routenote_log_route_tip_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.routenote_route_tip_history (tip_id, action, old_data, new_data, changed_by)
        VALUES (
            NEW.id,
            'UPDATE',
            to_jsonb(OLD),
            to_jsonb(NEW),
            NEW.updated_by
        );
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.routenote_route_tip_history (tip_id, action, old_data, new_data, changed_by)
        VALUES (
            NEW.id,
            'INSERT',
            NULL,
            to_jsonb(NEW),
            NEW.created_by
        );
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."routenote_log_route_tip_history"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."routenote_log_route_tip_history"() TO service_role;

CREATE OR REPLACE FUNCTION public.routenote_is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.routenote_profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$function$;
REVOKE ALL ON FUNCTION public."routenote_is_admin"(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."routenote_is_admin"(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public."routenote_is_admin"(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.routenote_preserve_zone_creator()
 RETURNS trigger
 LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  new.created_by := old.created_by;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public."routenote_preserve_zone_creator"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."routenote_preserve_zone_creator"() TO service_role;

CREATE OR REPLACE FUNCTION public.routenote_guard_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.id is distinct from auth.uid() or new.role is distinct from 'member' then
        raise exception 'Profiles can only be created for the current member' using errcode = '42501';
      end if;
    elsif new.id is distinct from old.id or new.role is distinct from old.role then
      raise exception 'Profile identity and role cannot be changed by a client' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public."routenote_guard_profile_role"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."routenote_guard_profile_role"() TO service_role;

CREATE OR REPLACE FUNCTION public.routenote_guard_zone_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null then
    if tg_op = 'DELETE' then
      if old.created_by is distinct from auth.uid() then
        raise exception 'Only the zone creator can delete this zone' using errcode = '42501';
      end if;
    elsif new.is_deleted is distinct from old.is_deleted and old.created_by is distinct from auth.uid() then
      raise exception 'Only the zone creator can hide or restore this zone' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public."routenote_guard_zone_deletion"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."routenote_guard_zone_deletion"() TO service_role;

CREATE OR REPLACE FUNCTION public.routenote_guard_tip_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null then
    if tg_op = 'DELETE' then
      if old.created_by is distinct from auth.uid()
         and not exists (select 1 from public.routenote_profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only the creator or administrators can delete tips' using errcode = '42501';
      end if;
    else
      if new.is_deleted is distinct from old.is_deleted
         and old.created_by is distinct from auth.uid()
         and not exists (select 1 from public.routenote_profiles where id = auth.uid() and role = 'admin') then
        raise exception 'Only the creator or administrators can hide or restore tips' using errcode = '42501';
      end if;
      new.created_by := old.created_by;
      new.updated_by := auth.uid();
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public."routenote_guard_tip_writes"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."routenote_guard_tip_writes"() TO service_role;

CREATE FUNCTION public.routenote_ensure_profile()
RETURNS SETOF public.routenote_profiles
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  claims jsonb := auth.jwt();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.routenote_profiles (id, email, name, avatar_url, role)
  VALUES (
    caller_id, claims->>'email',
    COALESCE(claims->'user_metadata'->>'full_name', claims->'user_metadata'->>'name'),
    claims->'user_metadata'->>'avatar_url', 'member'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN QUERY SELECT p.* FROM public.routenote_profiles p WHERE p.id=caller_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.routenote_ensure_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.routenote_ensure_profile() TO authenticated, service_role;

CREATE TRIGGER routenote_profiles_guard_role BEFORE INSERT OR UPDATE ON public.routenote_profiles FOR EACH ROW EXECUTE FUNCTION public.routenote_guard_profile_role();
CREATE TRIGGER routenote_route_zones_guard_deletion BEFORE DELETE OR UPDATE ON public.routenote_route_zones FOR EACH ROW EXECUTE FUNCTION public.routenote_guard_zone_deletion();
CREATE TRIGGER routenote_route_zones_preserve_creator BEFORE UPDATE ON public.routenote_route_zones FOR EACH ROW EXECUTE FUNCTION public.routenote_preserve_zone_creator();
CREATE TRIGGER routenote_tip_history AFTER INSERT OR UPDATE ON public.routenote_route_tips FOR EACH ROW EXECUTE FUNCTION public.routenote_log_route_tip_history();
CREATE TRIGGER routenote_route_tips_guard_writes BEFORE DELETE OR UPDATE ON public.routenote_route_tips FOR EACH ROW EXECUTE FUNCTION public.routenote_guard_tip_writes();

CREATE POLICY "routenote_read_photos_for_all" ON public."routenote_route_tip_photos" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_write_photos_for_auth" ON public."routenote_route_tip_photos" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_read_paths_for_all" ON public."routenote_route_paths" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_write_paths_for_auth" ON public."routenote_route_paths" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_enable_read_for_all" ON public."routenote_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_insert_own_profile" ON public."routenote_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND (role = 'member'::text)));
CREATE POLICY "routenote_update_own_profile" ON public."routenote_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "routenote_delete_own_zones" ON public."routenote_route_zones" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "routenote_insert_zones_for_auth" ON public."routenote_route_zones" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "routenote_read_zones_for_all" ON public."routenote_route_zones" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_update_zones_for_auth" ON public."routenote_route_zones" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "routenote_delete_tips_for_owner_or_admin" ON public."routenote_route_tips" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM routenote_profiles
  WHERE ((routenote_profiles.id = ( SELECT auth.uid() AS uid)) AND (routenote_profiles.role = 'admin'::text))))));
CREATE POLICY "routenote_insert_tips_for_auth" ON public."routenote_route_tips" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (is_deleted IS NOT TRUE)));
CREATE POLICY "routenote_read_tips_for_all" ON public."routenote_route_tips" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_update_tips_for_auth" ON public."routenote_route_tips" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "routenote_read_history_for_all" ON public."routenote_route_tip_history" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_write_history_for_auth" ON public."routenote_route_tip_history" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_read_path_points_for_all" ON public."routenote_route_path_points" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_write_path_points_for_auth" ON public."routenote_route_path_points" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_read_zone_photos_for_all" ON public."routenote_route_zone_photos" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_write_zone_photos_for_auth" ON public."routenote_route_zone_photos" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_read_market_route_map_history_for_all" ON public."routenote_market_route_map_cell_history" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_write_market_route_map_history_for_auth" ON public."routenote_market_route_map_cell_history" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_insert_market_route_map_cells_for_auth" ON public."routenote_market_route_map_cells" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_read_market_route_map_cells_for_all" ON public."routenote_market_route_map_cells" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_update_market_route_map_cells_for_auth" ON public."routenote_market_route_map_cells" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_insert_market_route_map_settings_for_auth" ON public."routenote_market_route_map_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "routenote_read_market_route_map_settings_for_all" ON public."routenote_market_route_map_settings" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_update_market_route_map_settings_for_auth" ON public."routenote_market_route_map_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "routenote_delete_own_likes" ON public."routenote_tip_likes" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = created_by));
CREATE POLICY "routenote_insert_own_likes" ON public."routenote_tip_likes" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "routenote_read_likes_for_auth" ON public."routenote_tip_likes" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_insert_notifications_for_auth" ON public."routenote_notifications" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((auth.uid() = sender_id) AND (recipient_id <> sender_id)));
CREATE POLICY "routenote_read_own_notifications" ON public."routenote_notifications" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = recipient_id));
CREATE POLICY "routenote_update_own_notifications" ON public."routenote_notifications" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = recipient_id)) WITH CHECK ((auth.uid() = recipient_id));
CREATE POLICY "routenote_insert_own_location_share_requests" ON public."routenote_location_share_requests" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((auth.uid() = requester_id) AND (requester_id <> recipient_id) AND (status = 'pending'::text)));
CREATE POLICY "routenote_read_own_location_share_requests" ON public."routenote_location_share_requests" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((auth.uid() = requester_id) OR (auth.uid() = recipient_id)));
CREATE POLICY "routenote_update_own_location_share_requests" ON public."routenote_location_share_requests" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((auth.uid() = requester_id) OR (auth.uid() = recipient_id))) WITH CHECK ((((auth.uid() = requester_id) AND (status = ANY (ARRAY['canceled'::text, 'ended'::text]))) OR ((auth.uid() = recipient_id) AND (status = ANY (ARRAY['accepted'::text, 'declined'::text, 'ended'::text])))));
CREATE POLICY "routenote_insert_own_comments" ON public."routenote_tip_comments" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "routenote_read_comments_for_auth" ON public."routenote_tip_comments" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_update_own_comment" ON public."routenote_tip_comments" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((auth.uid() = created_by) OR routenote_is_admin(auth.uid()))) WITH CHECK (((auth.uid() = created_by) OR routenote_is_admin(auth.uid())));
CREATE POLICY "routenote_push_subscriptions_delete_own" ON public."routenote_push_subscriptions" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "routenote_push_subscriptions_insert_own" ON public."routenote_push_subscriptions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "routenote_push_subscriptions_select_own" ON public."routenote_push_subscriptions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "routenote_push_subscriptions_update_own" ON public."routenote_push_subscriptions" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "routenote_market_stalls_insert" ON public."routenote_market_stalls" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY "routenote_market_stalls_read" ON public."routenote_market_stalls" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_market_stalls_write" ON public."routenote_market_stalls" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "routenote_market_buildings_read" ON public."routenote_market_buildings" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "routenote_market_buildings_write" ON public."routenote_market_buildings" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "routenote_manage_announcements_admin" ON public."routenote_announcements" AS PERMISSIVE FOR ALL TO PUBLIC USING (routenote_is_admin(auth.uid())) WITH CHECK (routenote_is_admin(auth.uid()));
CREATE POLICY "routenote_read_announcements_for_auth" ON public."routenote_announcements" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_delete_ann_comment" ON public."routenote_announcement_comments" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((auth.uid() = created_by) OR routenote_is_admin(auth.uid())));
CREATE POLICY "routenote_insert_own_ann_comment" ON public."routenote_announcement_comments" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "routenote_read_ann_comments_for_auth" ON public."routenote_announcement_comments" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "routenote_market_stall_history_insert" ON public."routenote_market_stall_history" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = changed_by));
CREATE POLICY "routenote_market_stall_history_read" ON public."routenote_market_stall_history" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('routenote-photos','routenote-photos',true);
CREATE POLICY routenote_photos_read ON storage.objects FOR SELECT TO public USING (bucket_id='routenote-photos');
CREATE POLICY routenote_photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='routenote-photos');
CREATE POLICY routenote_photos_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='routenote-photos') WITH CHECK (bucket_id='routenote-photos');
CREATE POLICY routenote_photos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='routenote-photos');

ALTER PUBLICATION "supabase_realtime" ADD TABLE public."routenote_tip_comments";
ALTER PUBLICATION "supabase_realtime" ADD TABLE public."routenote_notifications";
ALTER PUBLICATION "supabase_realtime" ADD TABLE public."routenote_location_share_requests";
ALTER PUBLICATION "supabase_realtime" ADD TABLE public."routenote_announcements";
ALTER PUBLICATION "supabase_realtime" ADD TABLE public."routenote_announcement_comments";
