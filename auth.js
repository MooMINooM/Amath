/* A-Math Student Auth — Supabase client-side login
 * Students sign in with student code + PIN. The UI never exposes email.
 * Auth email is deterministic: <student_code>@student.amath.local
 * IMPORTANT: never put a Supabase service_role key in this browser app.
 */
const AMATH_AUTH = (() => {
  let client = null;
  let student = null;

  function cfg() {
    return window.AMATH_SUPABASE_CONFIG || {};
  }

  function normalizeStudentCode(code) {
    return String(code || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  }

  function authEmailFromCode(code) {
    const normalized = normalizeStudentCode(code);
    return normalized ? `${normalized}@student.amath.local` : "";
  }

  function getClient() {
    if (client) return client;
    const { url, anonKey } = cfg();
    if (!url || !anonKey || !window.supabase) return null;
    client = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "amath-student-auth-v1",
      },
    });
    return client;
  }

  async function loadProfile(user) {
    const sb = getClient();
    if (!sb || !user) return null;
    const { data, error } = await sb
      .from("student_profiles")
      .select("user_id,student_code,full_name,class_name,room_no,active")
      .eq("user_id", user.id)
      .single();
    if (error) throw error;
    if (!data.active) throw new Error("บัญชีนี้ถูกระงับการใช้งาน");
    student = { ...data, email: user.email };
    return student;
  }

  async function restore() {
    const sb = getClient();
    if (!sb) return { ok: false, setupRequired: true };
    const { data, error } = await sb.auth.getSession();
    if (error) return { ok: false, error };
    const user = data?.session?.user;
    if (!user) return { ok: false, noSession: true };
    try {
      await loadProfile(user);
      return { ok: true, student };
    } catch (e) {
      await sb.auth.signOut();
      return { ok: false, error: e };
    }
  }

  async function signIn(studentCode, pin) {
    const sb = getClient();
    if (!sb) return { ok: false, setupRequired: true };
    const email = authEmailFromCode(studentCode);
    if (!email || !pin) return { ok: false, message: "กรอกรหัสนักเรียนและ PIN ให้ครบ" };

    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: String(pin),
    });
    if (error) return { ok: false, message: "รหัสนักเรียนหรือ PIN ไม่ถูกต้อง" };

    try {
      await loadProfile(data.user);
      return { ok: true, student };
    } catch (e) {
      await sb.auth.signOut();
      return { ok: false, message: e.message || "ไม่พบข้อมูลนักเรียน" };
    }
  }

  async function signOut() {
    const sb = getClient();
    if (sb) await sb.auth.signOut();
    student = null;
  }

  function currentStudent() { return student; }
  function userId() { return student?.user_id || null; }

  return {
    getClient, restore, signIn, signOut, currentStudent, userId,
    normalizeStudentCode, authEmailFromCode,
  };
})();
