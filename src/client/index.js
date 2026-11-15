import { createElement as h } from 'react';

import { PANEL_ID, NS } from '../protocol.js';
import { UsageDashboard } from './dashboard.js';
import { CSS, STYLE_ID } from './styles.js';

export const inject = ['slots', 'layout', 'locale'];

const en = {
  'panel.label': 'Usage',
  'panel.tooltip': 'Usage statistics',
};

const zh = {
  'panel.label': '用量统计',
  'panel.tooltip': '使用统计',
};

function installStyles() {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-usage-overview';
  tag.dataset.pluginCss = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

function UsagePanelIcon({ size = 16 } = {}) {
  return h(
    'svg',
    {
      width: String(size),
      height: String(size),
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'stroke-width': '1',
      'aria-hidden': 'true',
    },
    h('path', {
      d: 'M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096',
      stroke: 'currentColor',
    }),
    h('path', { d: 'M8 8.49994L11.6114 4.88855', stroke: 'currentColor' }),
    h('path', {
      d: 'M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z',
      fill: 'currentColor',
    }),
  );
}

export function apply(ctx) {
  installStyles();

  ctx.effect(
    () =>
      ctx.locale.register(NS, {
        zh,
        en,
      }),
    'dsh-usage-overview: dictionaries',
  );

  const t = ctx.locale.bind(NS);

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      },
      UsageDashboard,
    ),
  );

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => t('panel.label'),
        locale: NS,
      },
      UsagePanelIcon,
    ),
  );
}
