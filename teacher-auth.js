const AMATH_TEACHER_AUTH = (() => {
  let client = null;
  let teacher = null;

  function getClient() {
    if (client) return client;
    const cfg = window.AMATH_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !window.supabase) return null;
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "amath-teacher-auth-v1",
      },
    });
    return client;
  }

  async function loadTeacher(user) {
    const sb = getClient();
    const { data, error } = await sb
      .from("teacher_profiles")
      .select("user_id,full_name,school_name,active")
      .eq("user_id", user.id)
      .single();

    if (error) throw error;
    if (!data?.active) throw new Error("บัญชีครูถูกระงับการใช้งาน");
    teacher = data;
    return teacher;
  }

  async function restore() {
    const sb = getClient();
    if (!sb) return { ok:false, setupRequired:true };
    const { data, error } = await sb.auth.getSession();
    if (error || !data?.session?.user) return { ok:false };
    try {
      const profile = await loadTeacher(data.session.user);
      return { ok:true, teacher:profile };
    } catch (e) {
      await sb.auth.signOut();
      return { ok:false };
    }
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) return { ok:false, setupRequired:true };
    const { data, error } = await sb.auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || ""),
    });
    if (error) return { ok:false, message:"อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    try {
      const profile = await loadTeacher(data.user);
      return { ok:true, teacher:profile };
    } catch (e) {
      await sb.auth.signOut();
      return { ok:false, message:"บัญชีนี้ไม่มีสิทธิ์ครู" };
    }
  }

  async function signOut() {
    const sb = getClient();
    teacher = null;
    if (!sb) return { ok:true };
    try {
      const { error } = await sb.auth.signOut({ scope:"local" });
      return { ok:!error, error:error || null };
    } catch (error) {
      console.warn("[A-Math teacher auth] signOut failed",error);
      return { ok:false, error };
    }
  }

  return { getClient, restore, signIn, signOut, currentTeacher:()=>teacher };
})();
