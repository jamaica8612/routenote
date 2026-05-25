-- 1. Profiles Table (rn_ 접두사 추가)
CREATE TABLE IF NOT EXISTS public.rn_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Route Zones Table (폴리곤 구역 - rn_ 접두사 추가)
CREATE TABLE IF NOT EXISTS public.rn_route_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    polygon JSONB NOT NULL, -- GeoJSON Polygon
    color TEXT,
    memo TEXT,
    image_url TEXT, -- Zone-wide tip image
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- 3. Route Tips Table (배송팁 마커 - rn_ 접두사 추가)
CREATE TABLE IF NOT EXISTS public.rn_route_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID REFERENCES public.rn_route_zones(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    marker_type TEXT NOT NULL CHECK (marker_type IN ('vehicle_entrance', 'parking', 'entrance', 'elevator', 'delivery_spot', 'warning', 'access_code', 'important')),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    tags TEXT[],
    memo TEXT,
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_verified_at TIMESTAMPTZ,
    last_verified_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT false
);

-- 4. Route Tip History Table (팁 수정 이력 - rn_ 접두사 추가)
CREATE TABLE IF NOT EXISTS public.rn_route_tip_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Route Tip Photos Table (팁 사진 정보 - rn_ 접두사 추가)
CREATE TABLE IF NOT EXISTS public.rn_route_tip_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- 6. Route Paths Table (동선 그룹 - rn_ 접두사 추가)
CREATE TABLE IF NOT EXISTS public.rn_route_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID REFERENCES public.rn_route_zones(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    memo TEXT,
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- 7. Route Path Points Table (동선 좌표 순서 - rn_ 접두사 추가)
CREATE TABLE IF NOT EXISTS public.rn_route_path_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID REFERENCES public.rn_route_paths(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    title TEXT,
    memo TEXT
);

-- Enable Row Level Security
ALTER TABLE public.rn_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_tip_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_tip_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_path_points ENABLE ROW LEVEL SECURITY;

-- Helper functions to check if user is admin
CREATE OR REPLACE FUNCTION public.rn_is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.rn_profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies with prefix names

-- Profiles Policies
CREATE POLICY "rn_enable_read_for_all" ON public.rn_profiles
    FOR SELECT USING (true);

CREATE POLICY "rn_write_profiles_for_auth" ON public.rn_profiles
    FOR ALL USING (auth.role() = 'authenticated');

-- Route Zones Policies
CREATE POLICY "rn_read_zones_for_all" ON public.rn_route_zones
    FOR SELECT USING (true);

CREATE POLICY "rn_write_zones_for_auth" ON public.rn_route_zones
    FOR ALL USING (auth.role() = 'authenticated');

-- Route Tips Policies
CREATE POLICY "rn_read_tips_for_all" ON public.rn_route_tips
    FOR SELECT USING (true);

CREATE POLICY "rn_write_tips_for_auth" ON public.rn_route_tips
    FOR ALL USING (auth.role() = 'authenticated');

-- Route Tip History Policies
CREATE POLICY "rn_read_history_for_all" ON public.rn_route_tip_history
    FOR SELECT USING (true);

CREATE POLICY "rn_write_history_for_auth" ON public.rn_route_tip_history
    FOR ALL USING (auth.role() = 'authenticated');

-- Route Tip Photos Policies
CREATE POLICY "rn_read_photos_for_all" ON public.rn_route_tip_photos
    FOR SELECT USING (true);

CREATE POLICY "rn_write_photos_for_auth" ON public.rn_route_tip_photos
    FOR ALL USING (auth.role() = 'authenticated');

-- Route Paths Policies
CREATE POLICY "rn_read_paths_for_all" ON public.rn_route_paths
    FOR SELECT USING (true);

CREATE POLICY "rn_write_paths_for_auth" ON public.rn_route_paths
    FOR ALL USING (auth.role() = 'authenticated');

-- Route Path Points Policies
CREATE POLICY "rn_read_path_points_for_all" ON public.rn_route_path_points
    FOR SELECT USING (true);

CREATE POLICY "rn_write_path_points_for_auth" ON public.rn_route_path_points
    FOR ALL USING (auth.role() = 'authenticated');


-- Trigger: Create profile automatically on sign up (rn_profiles 전용)
CREATE OR REPLACE FUNCTION public.rn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.rn_profiles (id, email, name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url',
        'member' -- default role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 이름 변경하여 기존 trigger와 충돌 회피
CREATE OR REPLACE TRIGGER on_auth_user_created_rn
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.rn_handle_new_user();


-- Trigger: Log route tip history automatically (rn_ 접두사 반영)
CREATE OR REPLACE FUNCTION public.rn_log_route_tip_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.rn_route_tip_history (tip_id, action, old_data, new_data, changed_by)
        VALUES (
            NEW.id,
            'UPDATE',
            to_jsonb(OLD),
            to_jsonb(NEW),
            NEW.updated_by
        );
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.rn_route_tip_history (tip_id, action, old_data, new_data, changed_by)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_route_tip_updated_rn
    AFTER INSERT OR UPDATE ON public.rn_route_tips
    FOR EACH ROW EXECUTE FUNCTION public.rn_log_route_tip_history();


-- 8. Storage Bucket and RLS Policies for 'tip-photos'
-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('tip-photos', 'tip-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- RLS policies for storage objects in 'tip-photos' bucket
CREATE POLICY "rn_storage_select_tip_photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'tip-photos');

CREATE POLICY "rn_storage_insert_tip_photos" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'tip-photos' AND auth.role() = 'authenticated');

CREATE POLICY "rn_storage_update_tip_photos" ON storage.objects
    FOR UPDATE USING (bucket_id = 'tip-photos' AND auth.role() = 'authenticated');

CREATE POLICY "rn_storage_delete_tip_photos" ON storage.objects
    FOR DELETE USING (bucket_id = 'tip-photos' AND auth.role() = 'authenticated');


-- 9. Route Zone Photos Table
CREATE TABLE IF NOT EXISTS public.rn_route_zone_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID REFERENCES public.rn_route_zones(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

ALTER TABLE public.rn_route_zone_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rn_read_zone_photos_for_all" ON public.rn_route_zone_photos
    FOR SELECT USING (true);

CREATE POLICY "rn_write_zone_photos_for_auth" ON public.rn_route_zone_photos
    FOR ALL USING (auth.role() = 'authenticated');

-- 10. Tip Comments Table (팁 댓글)
CREATE TABLE IF NOT EXISTS public.rn_tip_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

ALTER TABLE public.rn_tip_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rn_read_comments_for_auth" ON public.rn_tip_comments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "rn_insert_comments_for_auth" ON public.rn_tip_comments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "rn_update_own_comment" ON public.rn_tip_comments
    FOR UPDATE USING (auth.uid() = created_by OR public.rn_is_admin(auth.uid()));

-- 11. Notifications Table (알림)
CREATE TABLE IF NOT EXISTS public.rn_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES public.rn_profiles(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('mention')),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.rn_tip_comments(id) ON DELETE SET NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rn_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rn_read_own_notifications" ON public.rn_notifications
    FOR SELECT USING (auth.uid() = recipient_id);

CREATE POLICY "rn_insert_notifications_for_auth" ON public.rn_notifications
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "rn_update_own_notifications" ON public.rn_notifications
    FOR UPDATE USING (auth.uid() = recipient_id);

-- 12. Enable Supabase Realtime for custom tables
do $$
begin
  alter publication supabase_realtime add table public.rn_route_tips;
  alter publication supabase_realtime add table public.rn_route_zones;
  alter publication supabase_realtime add table public.rn_route_zone_photos;
  alter publication supabase_realtime add table public.rn_tip_comments;
  alter publication supabase_realtime add table public.rn_notifications;
exception when others then
  -- Silently ignore errors if publication doesn't exist or tables are already added
  null;
end $$;

