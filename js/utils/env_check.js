const envCheck = (() => {
  async function probeConnectivity(samples = 3) {
    // synthetic latency using requestAnimationFrame as offline-safe fallback
    const start = performance.now();
    for (let i=0;i<samples;i++) await new Promise(r=>requestAnimationFrame(r));
    const elapsed = performance.now() - start;
    return { online: navigator.onLine, avgLatencyMs: Math.round(elapsed/samples), jitterMs: 5 };
  }

  async function getDeviceSummary() {
    const nav = navigator;
    const screenInfo = { w: window.innerWidth, h: window.innerHeight };
    const kbLikely = /Win|Mac|Linux/.test(nav.platform);
    let battery = { level: null, charging: null };
    try {
      if (nav.getBattery) {
        const b = await nav.getBattery();
        battery = { level: Math.round(b.level*100), charging: b.charging };
      }
    } catch(e){}
    return { screen: screenInfo, keyboardLikely: kbLikely, battery };
  }

  function shouldWarn(summary){
    const small = summary.screen.w < 360 || summary.screen.h < 640;
    const lowBatt = summary.battery.level !== null && summary.battery.level < 20 && !summary.battery.charging;
    return small || lowBatt;
  }

  return { probeConnectivity, getDeviceSummary, shouldWarn };
})();
