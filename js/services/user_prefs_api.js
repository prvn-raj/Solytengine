// Long-lived user preferences (also surfaced on user_profile)
const userPrefsApi = (() => {
  const LS_KEY = 'solyte_user_prefs';

  async function getUserPrefs(appUserId) {
    const local = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (typeof client === 'undefined') return local;

    const { data: row } = await client.from('user_preferences').select('*').eq('app_user_id', appUserId).maybeSingle();
    return row || local || {};
  }

  async function saveUserPrefs(appUserId, prefs) {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
    if (typeof client === 'undefined') return;

    const { data: existing } = await client.from('user_preferences').select('app_user_id').eq('app_user_id', appUserId).maybeSingle();
    if (existing) {
      await client.from('user_preferences').update({ ...prefs, updated_at: new Date().toISOString() }).eq('app_user_id', appUserId);
    } else {
      await client.from('user_preferences').insert({ app_user_id: appUserId, ...prefs });
    }
  }

  return { getUserPrefs, saveUserPrefs };
})();
