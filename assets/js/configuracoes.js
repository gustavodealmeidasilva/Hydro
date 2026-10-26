(() => {
  const root = document.querySelector('[data-device-config]');
  if (!root) return;

  const storagePrefix = 'hydrostats:painel:v1:';
  const els = {
    error: document.getElementById('configuracoes-erro'),
    devices: document.getElementById('lista-dispositivos-configuracao'),
    refresh: document.getElementById('atualizar-dispositivos'),
    cycleDay: document.getElementById('dia-ciclo'),
    sewer: document.getElementById('tipo-esgoto'),
    preferences: document.getElementById('preferencias-estimativa'),
    preferencesStatus: document.getElementById('status-preferencias'),
    apiValue: document.getElementById('api-address-value'),
    apiHelp: document.getElementById('api-address-help'),
    apiCopy: document.getElementById('api-address-copy'),
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
      return true;
    } catch {
      return false;
    }
  }

  const savedCycleDay = Number(readStorage('cycle-day', '1'));
  const savedSewer = readStorage('sewer', 'none');
  els.cycleDay.value = Number.isInteger(savedCycleDay) && savedCycleDay >= 1 && savedCycleDay <= 28
    ? String(savedCycleDay)
    : '1';
  els.sewer.value = ['none', 'collected', 'treated'].includes(savedSewer) ? savedSewer : 'none';

  const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  function formatDate(value) {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? dateTimeFormat.format(new Date(time)) : 'Sem registro';
  }

  function deviceStatus(device, now) {
    if (!device.ativo) return { title: 'Desativado', detail: 'Este dispositivo está desativado.', css: 'is-disabled', badge: 'text-bg-secondary' };
    if (!device.ultimo_contato) return { title: 'Aguardando primeira conexão', detail: 'O HydroNode ainda não confirmou conexão com o site.', css: '', badge: 'text-bg-warning' };
    const lastContact = Date.parse(device.ultimo_contato);
    const connected = Number.isFinite(lastContact) && now - lastContact < 120000;
    if (!connected) return { title: 'Sem comunicação', detail: 'O site não recebe confirmação do HydroNode há mais de 2 minutos.', css: 'is-offline', badge: 'text-bg-danger' };
    if (!device.medido_em) return { title: 'Conectado, aguardando medição', detail: 'Conexão confirmada. A primeira leitura aparecerá quando houver medição.', css: 'is-online', badge: 'text-bg-success' };
    return { title: 'Recebendo dados', detail: 'O site recebeu comunicação do HydroNode nos últimos 2 minutos.', css: 'is-online', badge: 'text-bg-success' };
  }

  function renderDevices(data) {
    const devices = Array.isArray(data.dispositivos) ? data.dispositivos : [];
    els.devices.replaceChildren();
    if (!devices.length) {
      const column = document.createElement('div');
      column.className = 'col-12';
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const message = document.createElement('p');
      message.textContent = 'Você ainda não tem dispositivos. Crie uma chave abaixo para iniciar a configuração do primeiro HydroNode.';
      empty.append(message);
      column.append(empty);
      els.devices.append(column);
      return;
    }

    const now = Date.parse(data.agora) || Date.now();
    for (const device of devices) {
      const status = deviceStatus(device, now);
      const column = document.createElement('div');
      column.className = 'col-md-6 col-xl-4';
      const card = document.createElement('article');
      card.className = 'dashboard-card device-status-card ' + status.css;
      const body = document.createElement('div');
      body.className = 'card-body';
      const top = document.createElement('div');
      top.className = 'dashboard-card-top mb-3';
      const name = document.createElement('h3');
      name.className = 'h5 mb-0';
      name.textContent = device.nome;
      const badge = document.createElement('span');
      badge.className = 'badge rounded-pill ' + status.badge;
      badge.textContent = status.title;
      top.append(name, badge);
      const detail = document.createElement('p');
      detail.className = 'small text-secondary mb-2';
      detail.textContent = status.detail;
      const contact = document.createElement('p');
      contact.className = 'small text-secondary mb-0';
      contact.textContent = device.ultimo_contato
        ? 'Última confirmação: ' + formatDate(device.ultimo_contato)
        : 'Ainda sem confirmação do site.';
      body.append(top, detail, contact);
      card.append(body);
      column.append(card);
      els.devices.append(column);
    }
  }

  async function loadDevices() {
    els.refresh.disabled = true;
    try {
      const response = await demoFetch(root.dataset.dataEndpoint + '?period=24h&cycle_day=1', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.erro || 'Não foi possível carregar os dispositivos.');
      renderDevices(data);
      els.error.textContent = '';
      els.error.classList.add('d-none');
    } catch (error) {
      els.error.textContent = error.message || 'Não foi possível falar com o site. Tente atualizar novamente.';
      els.error.classList.remove('d-none');
    } finally {
      els.refresh.disabled = false;
    }
  }

  async function setApiAddress() {
    setApiEndpoint('https://exemplo-demo.trycloudflare.com/api/v1/medicoes.php',
      'Endereço de exemplo. Na versão de demonstração não há túnel nem API reais.');
  }

  function setApiEndpoint(endpoint, helpText) {
    els.apiValue.textContent = endpoint;
    els.apiCopy.disabled = false;
    els.apiHelp.textContent = helpText;
  }

  els.apiCopy.addEventListener('click', async () => {
    const endpoint = els.apiValue.textContent;
    if (els.apiCopy.disabled || !endpoint.startsWith('https://')) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(endpoint);
      } else {
        const field = document.createElement('textarea');
        field.value = endpoint;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('copy unavailable');
      }
      els.apiHelp.textContent = 'Endereço copiado. Configure a URL completa no ESP8266.';
    } catch {
      els.apiHelp.textContent = 'Não foi possível copiar automaticamente. Selecione e copie o endereço acima.';
    }
  });

  els.refresh.addEventListener('click', loadDevices);
  els.preferences.addEventListener('submit', event => {
    event.preventDefault();
    const cycleDay = Number(els.cycleDay.value);
    if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 28) {
      els.cycleDay.setCustomValidity('Escolha um dia entre 1 e 28.');
      els.cycleDay.reportValidity();
      return;
    }
    els.cycleDay.setCustomValidity('');
    const cycleSaved = writeStorage('cycle-day', cycleDay);
    const sewerSaved = writeStorage('sewer', els.sewer.value);
    els.preferencesStatus.textContent = cycleSaved && sewerSaved
      ? 'Preferências salvas neste navegador. O Painel já usará esses valores.'
      : 'O navegador bloqueou o armazenamento local; as preferências não foram salvas.';
    els.preferencesStatus.className = 'small ' + (cycleSaved && sewerSaved ? 'text-success' : 'text-danger');
  });

  setApiAddress();
  window.setInterval(setApiAddress, 15000);
  loadDevices();
})();
