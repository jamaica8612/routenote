export async function ensureUserProfile(supabase, userId) {
  const { data: profile, error: lookupError } = await supabase
    .from('routenote_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (profile) return profile;

  // The RPC derives identity from auth.uid() and creates only a member profile.
  const { error: creationError } = await supabase.rpc('routenote_ensure_profile');
  if (creationError) throw creationError;

  const { data: createdProfile, error: fetchError } = await supabase
    .from('routenote_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (fetchError) throw fetchError;
  if (!createdProfile) throw new Error('프로필 생성 후 사용자 정보를 찾을 수 없습니다.');
  return createdProfile;
}
