const destinations = [
  { path: '/', label: 'Início', icon: '⌂' },
  { path: '/matches', label: 'Partidas', icon: '▦' },
  { path: '/review', label: 'Revisão', icon: '◇' },
  { path: '/scrim', label: 'Replay sincronizado', icon: '▷' },
  { divider: true },
  { path: '/patterns', label: 'Padrões', icon: '⌁', preview: true },
  { path: '/training', label: 'Plano de treino', icon: '◎', preview: true }
];

function brand(compact = false) {
  const link = document.createElement('a');
  link.className = 'av-brand';
  link.href = '/';
  link.setAttribute('aria-label', 'AlphaVeil — Início');
  const mark = document.createElement('span');
  mark.className = 'av-brand-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'AV';
  const text = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'av-brand-name';
  name.textContent = 'AlphaVeil';
  text.append(name);
  if (!compact) {
    const subtitle = document.createElement('span');
    subtitle.className = 'av-brand-subtitle';
    subtitle.textContent = 'Competitive Review for Deadlock';
    text.append(subtitle);
  }
  link.append(mark, text);
  return link;
}

function activePath(pathname, destination) {
  if (destination === '/') return pathname === '/';
  if (destination === '/matches') return pathname === '/matches' || pathname.startsWith('/matches/');
  return pathname === destination;
}

export function initProductShell() {
  const sidebar = document.getElementById('product-sidebar');
  const mobile = document.getElementById('mobile-bar');
  const overlay = document.getElementById('shell-overlay');
  if (!sidebar || !mobile || !overlay) throw new Error('alphaveil_shell_mount_unavailable');

  sidebar.append(brand());
  const nav = document.createElement('nav');
  nav.className = 'product-nav';
  nav.setAttribute('aria-label', 'Navegação principal');
  for (const destination of destinations) {
    if (destination.divider) {
      const divider = document.createElement('div');
      divider.className = 'product-nav-divider';
      divider.setAttribute('role', 'separator');
      nav.append(divider);
      continue;
    }
    const link = document.createElement('a');
    link.href = destination.path;
    if (activePath(location.pathname, destination.path)) link.setAttribute('aria-current', 'page');
    const icon = document.createElement('span');
    icon.className = 'product-nav-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = destination.icon;
    const label = document.createElement('span');
    label.textContent = destination.label;
    link.append(icon, label);
    if (destination.preview) {
      const badge = document.createElement('span');
      badge.className = 'nav-preview';
      badge.textContent = 'Preview';
      link.append(badge);
    }
    link.addEventListener('click', closeMenu);
    nav.append(link);
  }
  const foot = document.createElement('p');
  foot.className = 'sidebar-foot';
  foot.textContent = 'Competitive Review for Deadlock';
  sidebar.append(nav, foot);

  const button = document.createElement('button');
  button.className = 'mobile-menu-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Abrir navegação');
  button.setAttribute('aria-controls', 'product-sidebar');
  button.setAttribute('aria-expanded', 'false');
  button.textContent = '☰';
  mobile.append(brand(true), button);

  function closeMenu() {
    document.body.classList.remove('nav-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Abrir navegação');
  }
  function toggleMenu() {
    const open = !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Fechar navegação' : 'Abrir navegação');
    if (open) sidebar.querySelector('a')?.focus();
  }
  button.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); button.focus(); } });
}
