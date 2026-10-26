(() => {
  const root = document.querySelector('[data-hydrostats-panel]');
  if (!root) return;

  const dayMs = 24 * 60 * 60 * 1000;
  const pulsesPerLiter = 365.5;
  const storagePrefix = 'hydrostats:painel:v1:';
  const periods = ['1h', '24h', '7d'];
  const exponentBands = [
    [1, 1.0000], [21, 1.0100], [22, 1.0200], [23, 1.0300],
    [24, 1.0400], [25, 1.0500], [26, 1.0600], [27, 1.0700],
    [28, 1.0800], [29, 1.0800], [30, 1.0900], [31, 1.0900],
    [36, 1.1000], [41, 1.1000], [46, 1.1100], [51, 1.1100],
    [101, 1.1300], [151, 1.1287], [201, 1.1275], [301, 1.1250],
    [501, 1.1200], [1001, 1.1100], [2001, 1.1000], [9001, 1.0858],
  ];
  const tariff = { base: 9.15, basic: 43.39, sewerCollected: 4.57, sewerTreated: 6.40 };

  const els = {
    error: document.getElementById('painel-erro'),
    updated: document.getElementById('painel-atualizado'),
    deviceSelect: document.getElementById('seletor-dispositivo'),
    periodSelect: document.getElementById('seletor-periodo'),
    selectedStatus: document.getElementById('status-dispositivo-selecionado'),
    flow: document.getElementById('vazao-atual'),
    flowHint: document.getElementById('flow-hint'),
    todayVolume: document.getElementById('volume-hoje'),
    yesterdayComparison: document.getElementById('comparacao-ontem'),
    cycleLabel: document.getElementById('ciclo-legenda'),
    currentCost: document.getElementById('custo-atual'),
    currentVolume: document.getElementById('volume-ciclo'),
    forecastCost: document.getElementById('custo-previsto'),
    forecastVolume: document.getElementById('volume-previsto'),
    forecastDetails: document.getElementById('previsao-detalhe'),
    cycleProgress: document.getElementById('estimativa-ciclo-progresso'),
    cyclePercent: document.getElementById('estimativa-percentual'),
    cycleBar: document.getElementById('estimativa-ciclo-barra'),
    cycleVolume: document.getElementById('volume-ciclo-detalhe'),
    chart: document.getElementById('grafico-consumo'),
    chartUnit: document.getElementById('grafico-unidade'),
    chartStatus: document.getElementById('grafico-status'),
    readings: document.getElementById('leituras-recentes'),
  };

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(storagePrefix + key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(storagePrefix + key, String(value));
    } catch {
      // Preferências continuam funcionando até a página ser fechada.
    }
  }

  const savedPeriod = readStorage('period', '24h');
  const savedDevice = readStorage('device', '');
  const savedCycleDay = Number(readStorage('cycle-day', '1'));
  const savedSewer = readStorage('sewer', 'none');
  const state = {
    period: periods.includes(savedPeriod) ? savedPeriod : '24h',
    deviceId: /^\d+$/.test(savedDevice) ? savedDevice : '',
    cycleDay: Number.isInteger(savedCycleDay) && savedCycleDay >= 1 && savedCycleDay <= 28 ? savedCycleDay : 1,
    sewer: ['none', 'collected', 'treated'].includes(savedSewer) ? savedSewer : 'none',
    data: null,
    loading: false,
    refreshPending: false,
    revision: 0,
  };

  els.periodSelect.value = state.period;

  const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const volumeFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const currencyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fixedBasic = document.getElementById('servico-basico-valor');
  if (fixedBasic) fixedBasic.textContent = currencyFormat.format(tariff.basic) + ' por mês';
  const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const shortDateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
  const shortTimeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function formatDate(value) {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? dateTimeFormat.format(new Date(time)) : 'Sem registro';
  }

  function formatLiters(value, digits) {
    if (!Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(value));
  }

  function setError(message) {
    els.error.textContent = message;
    els.error.classList.remove('d-none');
  }

  function clearError() {
    els.error.textContent = '';
    els.error.classList.add('d-none');
  }

  function exponentFor(consumptionM3) {
    let exponent = 1;
    for (const band of exponentBands) {
      if (consumptionM3 >= band[0]) exponent = band[1];
      else break;
    }
    return exponent;
  }

  function estimatedCost(liters) {
    const m3 = Math.max(0, Number(liters) || 0) / 1000;
    const waterCost = m3 === 0 ? 0 : tariff.base * Math.pow(m3, exponentFor(m3));
    const sewerRate = state.sewer === 'collected' ? tariff.sewerCollected
      : state.sewer === 'treated' ? tariff.sewerTreated : 0;
    return waterCost + (m3 * sewerRate);
  }

  function renderCost(data) {
    const currentLiters = Number(data.litros_ciclo) || 0;
    els.currentCost.textContent = currencyFormat.format(estimatedCost(currentLiters));
    els.currentVolume.textContent = formatLiters(currentLiters / 1000, 2) + ' m³ medidos';
    els.cycleVolume.textContent = formatLiters(currentLiters / 1000, 2) + ' m³';

    const cycleStart = Date.parse(data.inicio_ciclo);
    const cycleEnd = Date.parse(data.fim_ciclo);
    const now = Date.parse(data.agora);
    const cycleDuration = cycleEnd - cycleStart;
    const cyclePercent = Number.isFinite(cycleDuration) && cycleDuration > 0 && Number.isFinite(now)
      ? Math.min(100, Math.max(0, Math.round(((now - cycleStart) / cycleDuration) * 100)))
      : 0;

    els.cycleProgress.style.setProperty('--cycle-progress', cyclePercent + '%');
    els.cycleProgress.setAttribute('aria-valuenow', String(cyclePercent));
    els.cyclePercent.textContent = cyclePercent + '%';
    els.cycleBar.value = cyclePercent;

    const historyStart = Date.parse(data.historico_7d_inicio);
    const observedDays = Number.isFinite(now) && Number.isFinite(historyStart)
      ? Math.min(7, Math.max(0, (now - historyStart) / dayMs))
      : 0;
    const remainingDays = Number.isFinite(now) && Number.isFinite(cycleEnd)
      ? Math.max(0, (cycleEnd - now) / dayMs)
      : 0;

    if (Number.isFinite(cycleStart) && Number.isFinite(cycleEnd)) {
      els.cycleLabel.textContent = 'Ciclo atual: ' + shortDateFormat.format(new Date(cycleStart)) +
        ' a ' + shortDateFormat.format(new Date(cycleEnd)) + '.';
    }

    if (observedDays < 1 || !Number.isFinite(now)) {
      document.querySelectorAll('[data-custo-previsto]').forEach(element => {
        element.textContent = 'Aguardando histórico';
      });
      els.forecastVolume.textContent = '—';
      els.forecastDetails.textContent = 'A previsão aparece após pelo menos 24 horas de leituras.';
      return;
    }

    const averagePerDay = (Number(data.litros_7d) || 0) / observedDays;
    const projectedLiters = currentLiters + averagePerDay * remainingDays;
    const forecastCost = currencyFormat.format(estimatedCost(projectedLiters));
    document.querySelectorAll('[data-custo-previsto]').forEach(element => {
      element.textContent = forecastCost;
    });
    els.forecastVolume.textContent = formatLiters(projectedLiters / 1000, 2) + ' m³';
    els.forecastDetails.textContent = 'Projeção pela média recente de ' +
      formatLiters(averagePerDay, 1) + ' L por dia.';
  }
  function svgElement(name, attrs, text) {
    const item = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs || {})) item.setAttribute(key, String(value));
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function niceMaximum(value) {
    if (!(value > 0)) return 1;
    const raw = value * 1.15;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
  }

  function renderChart(data) {
    const svg = els.chart;
    svg.replaceChildren();
    const title = svgElement('title', {}, 'Consumo de água por intervalo');
    const desc = svgElement('desc', {}, 'Gráfico do volume em litros recebido em cada intervalo do período selecionado.');
    svg.append(title, desc);

    const intervalText = data.periodo === '1h' ? 'Litros por minuto'
      : data.periodo === '7d' ? 'Litros por hora' : 'Litros por 10 minutos';
    els.chartUnit.textContent = intervalText;

    const series = Array.isArray(data.pontos) ? data.pontos : [];
    if (!series.length) {
      svg.append(svgElement('text', {
        x: 450, y: 126, 'text-anchor': 'middle', class: 'chart-empty',
      }, 'Ainda não há medições neste período.'));
      els.chartStatus.textContent = 'O gráfico será preenchido assim que o dispositivo enviar leituras.';
      return;
    }

    const left = 54;
    const right = 20;
    const top = 18;
    const bottom = 36;
    const width = 900 - left - right;
    const height = 250 - top - bottom;
    const values = series.map(point => Number(point.litros) || 0);
    const maxY = niceMaximum(Math.max(...values));
    const timeStart = Date.parse(data.inicio_periodo);
    const timeEnd = Date.parse(data.agora);
    const timeSpan = Number.isFinite(timeStart) && Number.isFinite(timeEnd) ? Math.max(1, timeEnd - timeStart) : 1;
    const coords = series.map(point => {
      const time = Date.parse(point.inicio);
      const relative = Number.isFinite(timeStart) && Number.isFinite(time)
        ? Math.max(0, Math.min(1, (time - timeStart) / timeSpan))
        : 0;
      return {
        x: left + relative * width,
        y: top + height - ((Number(point.litros) || 0) / maxY) * height,
        t: time,
      };
    });

    const defs = svgElement('defs');
    const gradient = svgElement('linearGradient', { id: 'consumption-fill', x1: '0', x2: '0', y1: '0', y2: '1' });
    gradient.append(
      svgElement('stop', { offset: '0%', 'stop-color': '#2cc3c9', 'stop-opacity': '.28' }),
      svgElement('stop', { offset: '100%', 'stop-color': '#2cc3c9', 'stop-opacity': '0' }),
    );
    defs.append(gradient);
    svg.append(defs);

    for (let tick = 0; tick <= 4; tick++) {
      const y = top + (height * tick / 4);
      const label = numberFormat.format(maxY * (4 - tick) / 4);
      svg.append(
        svgElement('line', { x1: left, y1: y, x2: 900 - right, y2: y, class: 'chart-gridline' }),
        svgElement('text', { x: left - 9, y: y + 4, 'text-anchor': 'end', class: 'chart-axis-label' }, label),
      );
    }

    const bucketMs = Math.max(1, Number(data.intervalo_segundos) || 1) * 1000;
    const segments = [];
    let segment = [];
    let previousTime = null;
    for (const point of coords) {
      if (previousTime !== null && Number.isFinite(point.t) && point.t - previousTime > bucketMs * 1.5) {
        if (segment.length) segments.push(segment);
        segment = [];
      }
      segment.push(point);
      previousTime = point.t;
    }
    if (segment.length) segments.push(segment);

    if (segments.length === 1 && segments[0].length > 1) {
      const fullSegment = segments[0];
      const areaPath = 'M ' + fullSegment[0].x + ' ' + (top + height) + ' L ' +
        fullSegment.map(point => point.x + ' ' + point.y).join(' L ') +
        ' L ' + fullSegment[fullSegment.length - 1].x + ' ' + (top + height) + ' Z';
      svg.append(svgElement('path', { d: areaPath, class: 'chart-area' }));
    }
    for (const lineSegment of segments) {
      if (lineSegment.length > 1) {
        const linePoints = lineSegment.map(point => point.x + ',' + point.y).join(' ');
        svg.append(svgElement('polyline', { points: linePoints, class: 'chart-line' }));
      }
    }
    const dotStep = Math.max(1, Math.ceil(coords.length / 40));
    coords.forEach((point, index) => {
      if (index % dotStep === 0 || index === coords.length - 1) {
        svg.append(svgElement('circle', { cx: point.x, cy: point.y, r: 3.5, class: 'chart-dot' }));
      }
    });

    const firstTime = Date.parse(data.inicio_periodo);
    const lastTime = Date.parse(data.agora);
    const labelFormat = data.periodo === '7d' ? shortDateFormat : shortTimeFormat;
    svg.append(
      svgElement('text', { x: left, y: 239, class: 'chart-axis-label' },
        Number.isFinite(firstTime) ? labelFormat.format(new Date(firstTime)) : ''),
      svgElement('text', { x: 900 - right, y: 239, 'text-anchor': 'end', class: 'chart-axis-label' },
        Number.isFinite(lastTime) ? labelFormat.format(new Date(lastTime)) : ''),
    );

    const total = Number(data.litros_periodo) || 0;
    const bucketDescription = data.periodo === '1h' ? 'minuto'
      : data.periodo === '7d' ? 'hora' : '10 minutos';
    els.chartStatus.textContent = formatLiters(total, 3) + ' L no período; cada ponto representa um ' + bucketDescription + '.';
  }

  function renderReadings(data) {
    const body = els.readings;
    body.replaceChildren();
    if (!Array.isArray(data.recentes) || !data.recentes.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.className = 'text-secondary';
      cell.textContent = 'Ainda não há medições para este dispositivo.';
      row.append(cell);
      body.append(row);
      return;
    }

    for (const reading of data.recentes) {
      const row = document.createElement('tr');
      const time = document.createElement('td');
      const volume = document.createElement('td');
      const flow = document.createElement('td');
      time.textContent = formatDate(reading.medido_em);
      volume.textContent = formatLiters((Number(reading.pulsos_intervalo) || 0) / pulsesPerLiter, 3) + ' L';
      flow.textContent = formatLiters(reading.vazao_l_min, 2) + ' L/min';
      row.append(time, volume, flow);
      body.append(row);
    }
  }

  function deviceStatus(device, now) {
    if (!device.ativo) return { title: 'Desativado', detail: 'Este dispositivo está desativado.', css: 'is-disabled', badge: 'text-bg-secondary' };
    if (!device.ultimo_contato) return { title: 'Aguardando primeira conexão', detail: 'O HydroNode ainda não confirmou conexão com o site.', css: '', badge: 'text-bg-warning' };
    const lastContact = Date.parse(device.ultimo_contato);
    const connected = Number.isFinite(lastContact) && now - lastContact < 120000;
    if (!connected) return { title: 'Sem comunicação', detail: 'O site não recebe confirmação do HydroNode há mais de 2 minutos.', css: 'is-offline', badge: 'text-bg-danger' };
    if (!device.medido_em) return { title: 'Sensor conectado', detail: 'Conexão confirmada. A primeira leitura aparecerá quando houver medição.', css: 'is-online', badge: 'text-bg-success' };
    return { title: 'Sensor conectado', detail: 'O site recebeu comunicação do HydroNode nos últimos 2 minutos.', css: 'is-online', badge: 'text-bg-success' };
  }

  function renderDeviceSelector(data) {
    const devices = Array.isArray(data.dispositivos) ? data.dispositivos : [];



    const select = els.deviceSelect;
    select.replaceChildren();
    if (!devices.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nenhum dispositivo cadastrado';
      select.append(option);
      select.disabled = true;
      state.deviceId = '';
      writeStorage('device', '');
      return null;
    } else {
      for (const device of devices) {
        const option = document.createElement('option');
        option.value = String(device.id);
        option.textContent = device.nome;
        select.append(option);
      }
    }
    const preferred = devices.find(device => String(device.id) === String(state.deviceId));
    const apiSelection = devices.find(device => String(device.id) === String(data.selecionado || ''));
    const selected = preferred || apiSelection || devices[0];
    state.deviceId = String(selected.id);
    select.value = state.deviceId;
    select.disabled = false;
    writeStorage('device', state.deviceId);
    return selected;
  }

  function render(data) {
    const selected = renderDeviceSelector(data);
    renderChart(data);
    renderReadings(data);
    renderCost(data);

    const now = Date.parse(data.agora) || Date.now();
    if (selected) {
      const status = deviceStatus(selected, now);
      els.selectedStatus.className = 'device-live-badge badge rounded-pill ' + status.badge;
      els.selectedStatus.textContent = status.title;
      els.selectedStatus.title = status.detail;
    } else {
      els.selectedStatus.className = 'device-live-badge badge rounded-pill text-bg-warning';
      els.selectedStatus.textContent = 'Nenhum dispositivo cadastrado';
      els.selectedStatus.title = 'Cadastre um dispositivo em Configurações para começar.';
    }

    if (selected && selected.medido_em) {
      els.flow.textContent = formatLiters(selected.vazao_l_min, 2) + ' L/min';
      els.flowHint.textContent = 'Última leitura às ' + shortTimeFormat.format(new Date(Date.parse(selected.medido_em))) + '.';
    } else {
      els.flow.textContent = 'Aguardando leitura';
      els.flowHint.textContent = 'Ainda não há leitura deste dispositivo.';
    }

    const todayLiters = Number(data.litros_hoje) || 0;
    const yesterdayLiters = Number(data.litros_ontem_mesmo_horario) || 0;
    els.todayVolume.textContent = formatLiters(todayLiters, 1) + ' L';
    if (yesterdayLiters > 0) {
      const changePercent = ((todayLiters - yesterdayLiters) / yesterdayLiters) * 100;
      const sign = changePercent > 0 ? '+' : changePercent < 0 ? '−' : '';
      els.yesterdayComparison.textContent = sign + formatLiters(Math.abs(changePercent), 0) +
        '% em relação ao mesmo horário ontem';
      els.yesterdayComparison.classList.toggle('is-positive', changePercent <= 0);
      els.yesterdayComparison.classList.toggle('is-negative', changePercent > 0);
    } else {
      els.yesterdayComparison.textContent = 'Sem dados de ontem para comparar.';
      els.yesterdayComparison.classList.remove('is-positive', 'is-negative');
    }

    els.updated.textContent = 'Atualizado às ' + shortTimeFormat.format(new Date(Date.parse(data.agora) || Date.now())) +
      ' · nova atualização em até 10 segundos.';
    els.periodSelect.value = data.periodo;
  }
  async function refresh() {
    if (document.visibilityState === 'hidden') return;
    if (state.loading) {
      state.refreshPending = true;
      return;
    }

    state.loading = true;
    const requestRevision = state.revision;
    const requestedDeviceId = state.deviceId;
    const query = new URLSearchParams({
      period: state.period,
      cycle_day: String(state.cycleDay),
    });
    if (requestedDeviceId) query.set('device_id', requestedDeviceId);

    try {
      const response = await demoFetch(root.dataset.dataEndpoint + '?' + query.toString(), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (requestRevision !== state.revision) {
        state.refreshPending = true;
        return;
      }
      if (response.status === 404 && requestedDeviceId) {
        state.deviceId = '';
        state.revision += 1;
        writeStorage('device', '');
        state.refreshPending = true;
        return;
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.erro || 'Não foi possível atualizar o painel.');
      }
      state.data = data;
      clearError();
      render(data);
    } catch (error) {
      if (requestRevision === state.revision) {
        setError(error.message || 'Não foi possível falar com o site. Tentaremos novamente.');
        els.updated.textContent = 'Aguardando uma nova tentativa…';
      }
    } finally {
      state.loading = false;
      if (state.refreshPending) {
        state.refreshPending = false;
        if (document.visibilityState !== 'hidden') window.setTimeout(refresh, 0);
      }
    }
  }
  els.deviceSelect.addEventListener('change', () => {
    state.deviceId = els.deviceSelect.value;
    state.revision += 1;
    writeStorage('device', state.deviceId);
    refresh();
  });

  els.periodSelect.addEventListener('change', () => {
    const nextPeriod = els.periodSelect.value;
    if (!periods.includes(nextPeriod)) return;
    state.period = nextPeriod;
    state.revision += 1;
    writeStorage('period', nextPeriod);
    refresh();
  });

  refresh();
  window.setInterval(refresh, 10000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
})();





