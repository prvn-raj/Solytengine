const moodUtil = (() => {
  function normalizeMood(form){
    const data = new FormData(form);
    return {
      affect: (data.get('affect') || 'na'),
      sleep: (data.get('sleep') || 'na'),
      distraction: (data.get('distraction') || 'na')
    };
  }
  return { normalizeMood };
})();
