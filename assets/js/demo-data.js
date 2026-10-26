// Dados fictícios da versão de demonstração (substituem api/painel-dados.php).
(() => {
  const H = 3600e3, D = 24 * H;
  const rnd = (n) => { let t = (n + 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bump = (h, c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  const profile = (h) => 0.04 + bump(h, 7, 1) + 0.7 * bump(h, 12.5, 1.2) + bump(h, 19.5, 1.5);
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const PERIODS = { '1h': [3600, 60], '24h': [86400, 600], '7d': [604800, 3600] };
  const DEVICES = [
    { id: 1, nome: 'Hidrômetro da cozinha', ativo: true, scale: 1, lag: 12 },
    { id: 2, nome: 'Chuveiro do banheiro', ativo: true, scale: 1.6, lag: 540 },
    { id: 3, nome: 'Torneira do jardim', ativo: false, scale: 0.4, lag: 3 * 86400 },
  ];

  // Litros num intervalo que começa em ts e dura sec segundos (determinístico).
  function liters(ts, sec, scale) {
    const d = new Date(ts);
    const r = rnd(Math.floor(ts / (sec * 1000)) * 31 + Math.round(scale * 100));
    const gap = sec <= 60 ? 0.45 : sec <= 600 ? 0.25 : 0;
    if (r < gap) return 0;
    return 30 * profile(d.getHours() + d.getMinutes() / 60) * scale * (0.3 + 1.4 * r) * (sec / 3600);
  }

  function reading(dev, ts) {
    const slot = Math.floor(ts / 20000);
    const flow = rnd(slot * 17 + dev.id) < 0.35 ? 0 : 1.5 + 4.5 * rnd(slot * 5 + dev.id);
    return { medido_em: iso(slot * 20000), vazao_l_min: +flow.toFixed(2), pulsos_intervalo: Math.round(flow / 3 * 365.5) };
  }

  function painel({ period, deviceId, cycleDay }) {
    const [span, step] = PERIODS[period] || PERIODS['24h'];
    const now = Date.now();
    const devices = DEVICES.map((d) => {
      const last = now - d.lag * 1000;
      return { id: d.id, nome: d.nome, ativo: d.ativo, ultimo_contato: iso(last), medido_em: iso(last),
        vazao_l_min: d.lag < 120 ? reading(d, last).vazao_l_min : 0 };
    });
    const dev = DEVICES.find((d) => String(d.id) === String(deviceId)) || DEVICES[0];
    const s = dev.scale;
    const sum = (a, b, sec) => { let x = 0; for (let t = a; t < b; t += sec * 1000) x += liters(t, sec, s); return x; };

    const start = now - span * 1000, ms = step * 1000;
    const pontos = [];
    for (let t = Math.ceil(start / ms) * ms; t + ms <= now; t += ms) {
      const l = liters(t, step, s);
      pontos.push({ inicio: iso(t), pulsos: Math.round(l * 365.5), litros: +l.toFixed(4), vazao_media: +(l / (step / 60)).toFixed(3) });
    }
    const last = now - dev.lag * 1000;
    const recentes = Array.from({ length: 10 }, (_, i) => reading(dev, last - i * 20000));

    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const n = new Date(now);
    let cs = new Date(n.getFullYear(), n.getMonth(), cycleDay);
    if (cs > n) cs = new Date(n.getFullYear(), n.getMonth() - 1, cycleDay);
    const ce = new Date(cs.getFullYear(), cs.getMonth() + 1, cycleDay);

    return {
      ok: true, dispositivos: devices, selecionado: dev.id, periodo: PERIODS[period] ? period : '24h',
      intervalo_segundos: step, pontos, recentes,
      litros_periodo: +pontos.reduce((a, p) => a + p.litros, 0).toFixed(3),
      litros_ciclo: +sum(cs.getTime(), now, 3600).toFixed(3),
      litros_7d: +sum(now - 7 * D, now, 3600).toFixed(3),
      litros_hoje: +sum(midnight.getTime(), now, 600).toFixed(3),
      litros_ontem_mesmo_horario: +sum(midnight.getTime() - D, now - D, 600).toFixed(3),
      historico_7d_inicio: iso(now - 7 * D), inicio_periodo: iso(start),
      inicio_ciclo: iso(cs.getTime()), fim_ciclo: iso(ce.getTime()), agora: iso(now),
    };
  }

  // Imita fetch() para o endpoint do painel.
  window.demoFetch = async (url) => {
    await new Promise((r) => setTimeout(r, 150));
    const q = new URL(url, location.href).searchParams;
    const body = painel({ period: q.get('period') || '24h', deviceId: q.get('device_id'), cycleDay: Number(q.get('cycle_day')) || 1 });
    return { ok: true, status: 200, json: async () => body };
  };
})();
