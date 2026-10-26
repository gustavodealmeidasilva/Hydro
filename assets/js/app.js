
const themeButtons = document.querySelectorAll('[data-theme-toggle]');
function setTheme(theme, save = false) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(dark));
    const icon = button.querySelector('[aria-hidden="true"]');
    const label = button.querySelector('[data-theme-label]');
    if (icon) icon.textContent = dark ? '☀' : '☾';
    if (label) label.textContent = dark ? 'Modo claro' : 'Modo escuro';
  });
  if (save) {
    try { localStorage.setItem('hydrostats:theme', dark ? 'dark' : 'light'); } catch {}
  }
  document.cookie = `hydrostats_theme=${dark ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`;
}

themeButtons.forEach((button) => button.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
}));
setTheme(document.documentElement.dataset.theme || 'light', true);

// Demonstração: nenhuma chamada ao servidor; as respostas abaixo são fictícias.
const respostasDemo = {
  register: { codigo: 'K7QD-3MWA' },
  recover: { codigo: 'R2XP-9HBN' },
  'device-create': { chave_dispositivo: 'hs_demo_8f3a1c9d27b64e05a1d9c3f2b7e64a10' },
};
async function api(nome) {
  await new Promise((r) => setTimeout(r, 350));
  return { ok: true, ...(respostasDemo[nome] || {}) };
}

document.querySelectorAll('form[data-api]').forEach((form) => {
  const msg = form.querySelector('.msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const conf = form.elements.confirmar;
    if (conf) conf.setCustomValidity(conf.value === form.elements.senha.value ? '' : 'As senhas não são iguais.');
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const dados = {};
    for (const el of form.elements) if (el.name) dados[el.name] = el.type === 'checkbox' ? el.checked : el.value;

    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    const r = await api(form.dataset.api, dados);
    botao.disabled = false;

    if (!r.ok) { msg.textContent = r.erro; msg.classList.remove('d-none'); return; }
    if (r.chave_dispositivo) {
      document.getElementById('chave-dispositivo-valor').textContent = r.chave_dispositivo;
      document.getElementById('chave-dispositivo-box').classList.remove('d-none');
      form.classList.add('d-none');
      return;
    }
    if (r.codigo) {
      document.getElementById('codigo-valor').textContent = r.codigo;
      document.getElementById('codigo-box').classList.remove('d-none');
      form.classList.add('d-none');
      return;
    }
    location.href = form.dataset.destino || 'painel.html';
  });
});

document.querySelectorAll('[data-ver-senha]').forEach((b) => b.addEventListener('click', () => {
  const campos = b.closest('form').querySelectorAll('input[data-senha]');
  const mostrar = campos[0].type === 'password';
  campos.forEach((c) => { c.type = mostrar ? 'text' : 'password'; });
  b.textContent = mostrar ? 'Ocultar' : 'Mostrar';
}));

document.querySelectorAll('[data-atualizar-painel]').forEach((b) => b.addEventListener('click', () => location.reload()));

document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
  await api('logout');
  location.href = 'index.html';
}));

if (new URLSearchParams(location.search).get('atualizado') === '1') document.getElementById('perfil-atualizado')?.classList.remove('d-none');
