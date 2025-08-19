// Create/Update a "prep" session. Falls back to localStorage if Supabase unavailable.
const sessionsApi = (() => {
  const LS_KEY = 'solyte_prep_sessions';

  function lsRead(){ return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  function lsWrite(v){ localStorage.setItem(LS_KEY, JSON.stringify(v)); }

  async function createOrGetPrepSession(assignmentId) {
    if (typeof client === 'undefined') {
      const map = lsRead();
      if (!map[assignmentId]) {
        map[assignmentId] = { id: crypto.randomUUID(), assignment_id: assignmentId, status: 'prep', created_at: new Date().toISOString() };
        lsWrite(map);
      }
      return map[assignmentId];
    }

    // Supabase path
    const { data: me } = await client.from('app_users').select('id').eq('supabase_user_id', (await client.auth.getUser()).data.user.id).single();

    // try existing prep or in_progress
    const { data: existing } = await client
      .from('assessment_sessions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .eq('app_user_id', me.id)
      .in('status', ['prep','in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return existing;

    const { data: created, error } = await client
      .from('assessment_sessions')
      .insert({ assignment_id: assignmentId, app_user_id: me.id, status: 'prep' })
      .select('*').single();
    if (error) throw error;
    return created;
  }

  async function update(sessionId, patch) {
    if (typeof client === 'undefined') {
      const map = lsRead();
      for (const k of Object.keys(map)) if (map[k].id === sessionId) Object.assign(map[k], patch);
      lsWrite(map);
      return;
    }
    const { error } = await client.from('assessment_sessions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', sessionId);
    if (error) throw error;
  }

  async function get(sessionId) {
    if (typeof client === 'undefined') {
      const map = lsRead();
      return Object.values(map).find(s => s.id === sessionId) || null;
    }
    const { data } = await client.from('assessment_sessions').select('*').eq('id', sessionId).single();
    return data;
  }

  return { createOrGetPrepSession, update, get };
})();
