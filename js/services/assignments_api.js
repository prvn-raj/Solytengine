// js/services/assignments_api.js
const assignmentsApi = (() => {
  async function getEligibility(assignmentId) {
    const now = new Date();
    let window_ok = true, attempts_ok = true, identity_ok = true;
    let version_hash = null; // not in your schema

    if (typeof client === 'undefined') {
      return { window_ok, attempts_ok, identity_ok, version_hash: 'dev-local' };
    }

    // No join to assessments
    const { data: a, error: aErr } = await client
      .from('assessment_assignments')
      .select('id, start_date, end_date, max_attempts, app_user_id, cohort_id')
      .eq('id', assignmentId)
      .single();
    if (aErr || !a) throw (aErr || new Error('Assignment not found'));

    const start = a.start_date ? new Date(a.start_date) : null;
    const end   = a.end_date ? new Date(a.end_date) : null;
    window_ok   = (!start || now >= start) && (!end || now <= end);

    const { data: userRes } = await client.auth.getUser();
    if (!userRes?.user) throw new Error('Not signed in');
    const { data: me, error: meErr } = await client
      .from('app_users').select('id')
      .eq('supabase_user_id', userRes.user.id)
      .single();
    if (meErr || !me?.id) throw (meErr || new Error('app_users profile not found'));

    identity_ok = false;
    if (a.app_user_id && me.id === a.app_user_id) {
      identity_ok = true;
    } else if (a.cohort_id) {
      const { data: cm, error: cmErr } = await client
        .from('cohort_members')
        .select('id')
        .eq('cohort_id', a.cohort_id)
        .eq('app_user_id', me.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!cmErr && cm) identity_ok = true;
    }

    // AFTER (count attempts that actually started: status in_progress OR completed)
let startedCount = 0;
const { count, error: startedErr } = await client
  .from('user_assessments')
  .select('id', { count: 'exact', head: true })
  .eq('assignment_id', assignmentId)
  .eq('app_user_id', me.id)
  .in('status', ['in_progress', 'completed']);
if (!startedErr && typeof count === 'number') startedCount = count;

attempts_ok = !a.max_attempts || a.max_attempts <= 0 || (startedCount < a.max_attempts);


    return { window_ok, attempts_ok, identity_ok, version_hash };
  }
  return { getEligibility };
})();
