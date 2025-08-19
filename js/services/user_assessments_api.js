// js/services/user_assessments_api.js
// Reuses existing tables (Option A). Requires global `client` (Supabase).

const userAssessmentsApi = (() => {
  async function getMeId() {
    const { data: userRes, error: userErr } = await client.auth.getUser();
    if (userErr || !userRes?.user) throw new Error("Not signed in");
    const { data: me, error: meErr } = await client
      .from('app_users')
      .select('id')
      .eq('supabase_user_id', userRes.user.id)
      .single();
    if (meErr || !me?.id) throw new Error("app_users profile not found");
    return me.id;
  }

  // Ensure there's a user_assessments row for this assignment & user
  async function ensureUserAssessment(assignmentId) {
    const meId = await getMeId();

    const { data: existing, error: existErr } = await client
      .from('user_assessments')
      .select('id, status, assessment_id, assignment_id, started_at, prep_meta')
      .eq('assignment_id', assignmentId)
      .eq('app_user_id', meId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existErr) throw existErr;
    if (existing) return existing;

    // Need assessment_id from assignment
    const { data: asg, error: asgErr } = await client
      .from('assessment_assignments')
      .select('assessment_id')
      .eq('id', assignmentId)
      .single();
    if (asgErr || !asg?.assessment_id) throw new Error("Assignment not found or missing assessment_id");

    const { data: created, error: createErr } = await client
      .from('user_assessments')
      .insert({
        app_user_id: meId,
        assessment_id: asg.assessment_id,
        assignment_id: assignmentId,
        status: 'not_started'
      })
      .select('id, status, assessment_id, assignment_id, started_at, prep_meta')
      .single();
    if (createErr) throw createErr;
    return created;
  }

  // Merge a patch into user_assessments.prep_meta
  async function patchPrepMeta(userAssessmentId, patchObj) {
    const { data: current, error: curErr } = await client
      .from('user_assessments')
      .select('prep_meta')
      .eq('id', userAssessmentId)
      .single();
    if (curErr) throw curErr;

    const merged = { ...(current?.prep_meta || {}), ...patchObj };
    const { error: updErr } = await client
      .from('user_assessments')
      .update({ prep_meta: merged, updated_at: new Date().toISOString() })
      .eq('id', userAssessmentId);
    if (updErr) throw updErr;

    return merged;
  }

  // Flip to in_progress and stamp times; also ensures ui_snapshot + mood are in prep_meta
  async function startAssessment(userAssessmentId, uiSnapshot, mood) {
    await patchPrepMeta(userAssessmentId, { ui_snapshot: uiSnapshot, mood });
    const now = new Date().toISOString();
    const { error } = await client
      .from('user_assessments')
      .update({ status: 'in_progress', started_at: now, prep_completed_at: now, updated_at: now })
      .eq('id', userAssessmentId);
    if (error) throw error;
  }

  async function getById(id) {
    const { data, error } = await client
      .from('user_assessments')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async function getByAssignment(assignmentId) {
    const meId = await getMeId();
    const { data, error } = await client
      .from('user_assessments')
      .select('*')
      .eq('assignment_id', assignmentId)
      .eq('app_user_id', meId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  return { ensureUserAssessment, patchPrepMeta, startAssessment, getById, getByAssignment };
})();
