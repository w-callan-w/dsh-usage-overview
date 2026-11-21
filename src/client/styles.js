export const STYLE_ID = 'dsh-usage-overview/dashboard.css';

export const CSS = `.dus-root {
    --dus-accent: var(--dsw-alias-state-business-primary, var(--dsw-static-deepseek-450, #5686fe));
    --dus-subtle-fill: var(--dsw-alias-bg-overlay);
    --dus-subtle-fill: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
    --dus-cache-line: color-mix(in srgb, var(--dsw-alias-state-success-primary) 60%, var(--dsw-alias-label-primary));
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: calc(var(--dsh-frame-top-clearance, 0px) + clamp(16px, 3vw, 28px)) clamp(14px, 4%, 40px) clamp(64px, 6.5vw, 76px);
    box-sizing: border-box;
    color: var(--dsw-alias-label-primary);
    font-family: var(--dsw-font-family);
    font-size: 14px;
    line-height: 1.5;
  }

  .dus-shell {
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
    container-type: inline-size;
    container-name: dus;
  }
  .dus-inner {
    display: flex;
    flex-direction: column;
    gap: 16px;
    gap: clamp(12px, 1.5cqw, 16px);
  }

  .dus-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-bottom: 4px; }
  .dus-title {
    font-size: 28px;
    font-size: clamp(21px, 2.6cqw + 14px, 28px);
    font-weight: 700; letter-spacing: -0.01em; margin: 0;
    line-height: 1.2;
  }
  .dus-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 10px; border-radius: 999px;
    background: var(--dsw-alias-bg-layer-3);
    border: 1px solid var(--dsw-alias-border-l2);
    color: var(--dsw-alias-label-secondary);
    font-size: 12px; font-weight: 500;
    white-space: nowrap;
  }
  .dus-head-spacer { flex: 1 1 auto; min-width: 0; }
  .dus-live {
    display: inline-flex; align-items: center; gap: 6px;
    margin-left: auto; white-space: nowrap;
    font-size: 12px; color: var(--dsw-alias-label-secondary);
  }
  .dus-live-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--dsw-alias-state-success-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 20%, transparent);
  }

  .dus-cards {
    display: flex; flex-wrap: wrap; gap: 1px;
    background: var(--dsw-alias-border-l1);
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: var(--dsw-radius-lg);
    overflow: hidden;
  }
  .dus-card {
    flex: 1 1 150px;
    box-sizing: border-box;
    background: var(--dsw-alias-bg-layer-2);
    padding: 18px 16px;
    padding: clamp(12px, 2.6cqw, 18px) clamp(8px, 1.6cqw, 16px);
    text-align: center;
    display: flex; flex-direction: column; gap: 6px;
    justify-content: center;
    min-width: 0;
  }
  .dus-card-value {
    font-size: 24px;
    font-size: clamp(17px, 2.3cqw + 8px, 24px);
    font-weight: 650; letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .dus-card-label {
    font-size: 12px;
    font-size: clamp(10.5px, 1.05cqw, 12px);
    color: var(--dsw-alias-label-secondary);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .dus-meter {
    height: 4px; border-radius: 2px; overflow: hidden;
    background: var(--dus-subtle-fill);
    margin-top: 2px;
  }
  .dus-meter-fill {
    height: 100%; border-radius: 2px;
    background: var(--dus-accent);
    transition: width 200ms ease;
  }

  .dus-panel {
    background: var(--dsw-alias-bg-layer-2);
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: var(--dsw-radius-lg);
    padding: 18px 20px 20px;
    padding: clamp(14px, 2cqw, 18px) clamp(12px, 2cqw, 20px) clamp(14px, 2.2cqw, 20px);
    min-width: 0;
  }
  .dus-panel-head {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px;
    margin-bottom: 16px; min-height: 28px;
  }
  .dus-panel-title { font-size: 15px; font-weight: 600; margin: 0; line-height: 1.3; }
  .dus-panel-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-left: auto; }

  .dus-range-row {
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px;
    margin-top: 2px;
  }
  .dus-range-label {
    flex: none;
    font-size: 13px; font-weight: 550; color: var(--dsw-alias-label-secondary);
  }
  .dus-range-row .dus-seg {
    flex: 1 1 240px;
    max-width: 320px;
    margin-left: auto;
  }

  .dus-seg {
    display: flex; align-items: center; gap: 2px;
    padding: 2px; border-radius: var(--dsw-radius-md);
    background: var(--dsw-alias-bg-layer-3);
    border: 1px solid var(--dsw-alias-border-l1);
    box-sizing: border-box;
  }
  .dus-seg-btn {
    flex: 1 1 0; min-width: 0;
    appearance: none; border: none; cursor: pointer;
    background: transparent; color: var(--dsw-alias-label-secondary);
    font-family: inherit; font-size: 12px; font-weight: 500;
    padding: 4px 12px;
    padding-inline: clamp(4px, 1cqw, 12px);
    border-radius: var(--dsw-radius-sm);
    transition: background 120ms ease, color 120ms ease;
    white-space: nowrap; text-align: center;
  }
  .dus-seg-btn:hover { color: var(--dsw-alias-label-primary); }
  .dus-seg-btn[data-active] {
    background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-primary);
    box-shadow: var(--dsw-elevation-soft);
  }

  .dus-heat-wrap {
    position: relative; overflow-x: auto; padding-bottom: 6px;
    scrollbar-width: thin; overscroll-behavior-inline: contain;
    -webkit-overflow-scrolling: touch;
  }
  .dus-heat { display: flex; gap: 3px; min-width: min-content; }
  .dus-heat-col { display: flex; flex-direction: column; gap: 3px; }
  .dus-heat-cell {
    border-radius: 2px;
    background: var(--dus-subtle-fill);
    transition: transform 90ms ease;
  }
  .dus-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--dus-accent) 26%, var(--dsw-alias-bg-layer-3)); }
  .dus-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--dus-accent) 48%, var(--dsw-alias-bg-layer-3)); }
  .dus-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--dus-accent) 72%, var(--dsw-alias-bg-layer-3)); }
  .dus-heat-cell[data-level="4"] { background: var(--dus-accent); }
  .dus-heat-cell:hover { transform: scale(1.35); }
  .dus-heat-months {
    display: flex; gap: 3px; margin-bottom: 6px; min-width: min-content;
  }

  .dus-heat-month {
    position: relative; height: 14px;
    font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-secondary);
    white-space: nowrap; overflow: visible;
  }
  .dus-heat-month > span { position: absolute; left: 0; top: 0; }
  .dus-heat-legend {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px; justify-content: flex-end;
    margin-top: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary);
  }
  .dus-heat-legend .dus-heat-cell { width: 10px; height: 10px; }

  .dus-tip {
    position: fixed; z-index: 60; pointer-events: none;
    background: var(--dsw-alias-tooltip-bg, #2c2c2e);
    color: var(--dsw-alias-tooltip-label, #ffffff);
    border: 1px solid var(--dsw-alias-tooltip-key-bg, color-mix(in srgb, #ffffff 18%, transparent));
    border-radius: var(--dsw-radius-md);
    padding: 8px 10px; font-size: 12px; line-height: 1.45;
    box-shadow: var(--dsw-elevation-prominent);
    max-width: min(260px, calc(100vw - 24px));
  }
  .dus-tip-title { color: inherit; font-weight: 600; margin-bottom: 2px; }
  .dus-tip-row { color: inherit; opacity: 0.8; font-variant-numeric: tabular-nums; }

  .dus-chart-host { position: relative; width: 100%; min-width: 0; }
  .dus-chart-host svg { display: block; max-width: 100%; }
  .dus-legend {
    display: flex; flex-wrap: wrap; gap: 8px 18px;
    gap: clamp(6px, 1cqw, 8px) clamp(10px, 1.6cqw, 18px);
    margin-bottom: 10px;
  }
  .dus-legend-item {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12px; color: var(--dsw-alias-label-secondary);
    cursor: default; min-width: 0; max-width: 100%;
    flex-wrap: wrap; row-gap: 2px;
  }
  .dus-legend-item[data-dim] { opacity: 0.4; }
  .dus-legend-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .dus-legend-src {
    padding: 0 5px; border-radius: var(--dsw-radius-xs);
    background: var(--dsw-alias-bg-layer-3);
    border: 1px solid var(--dsw-alias-border-l2);
    color: var(--dsw-alias-label-secondary);
    font-size: 10.5px; font-weight: 500;
  }
  .dus-legend-val { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }

  .dus-split {
    display: flex; flex-wrap: wrap; align-items: center;
    gap: 28px;
    gap: clamp(16px, 2.6cqw, 28px);
  }
  .dus-donut-wrap {
    flex: 0 0 auto;
    position: relative; display: flex; justify-content: center;
    min-width: 0; max-width: 100%;
  }

  .dus-root .dus-donut-wrap svg {
    width: 220px;
    width: clamp(150px, 24cqw, 220px);
    height: auto;
  }
  .dus-donut-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    pointer-events: none; text-align: center;
  }
  .dus-donut-total {
    font-size: 22px;
    font-size: clamp(16px, 2.2cqw + 6px, 22px);
    font-weight: 650; letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .dus-donut-unit { font-size: 11px; color: var(--dsw-alias-label-secondary); }
  .dus-donut-hint {
    margin-top: 3px; max-width: 118px;
    font-size: 10.5px; line-height: 1.3;
    color: var(--dsw-alias-label-secondary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .dus-model-list {
    display: flex; flex-direction: column; gap: 2px;
    flex: 1 1 310px;
    min-width: 0;
  }
  .dus-model-row {
    display: grid; grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center; gap: 10px;
    padding: 9px 8px; border-radius: var(--dsw-radius-md);
    padding: clamp(6px, 1cqw, 9px) clamp(4px, 0.8cqw, 8px);
    gap: clamp(6px, 1cqw, 10px);
    transition: background 120ms ease;
    min-width: 0;
  }
  .dus-model-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
  .dus-model-row[data-active] { background: var(--dsw-alias-interactive-bg-hover); }
  .dus-model-dot { width: 9px; height: 9px; border-radius: 50%; }
  .dus-model-main { min-width: 0; }

  .dus-model-name {
    font-weight: 550; font-size: 13px;
    font-size: clamp(12px, 1.3cqw, 13px);
    white-space: normal; overflow-wrap: anywhere;
    line-height: 1.35;
  }
  .dus-model-meta {
    font-size: 11.5px; color: var(--dsw-alias-label-secondary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .dus-model-src {
    display: inline-flex; align-items: center;
    padding: 0 5px; margin-left: 4px;
    border-radius: var(--dsw-radius-xs);
    background: var(--dsw-alias-bg-layer-3);
    border: 1px solid var(--dsw-alias-border-l2);
    color: var(--dsw-alias-label-secondary);
    font-size: 10.5px; font-weight: 500;
    vertical-align: 1px;
  }
  .dus-model-right { text-align: right; white-space: nowrap; }
  .dus-model-tokens {
    font-weight: 600; font-size: 13px;
    font-size: clamp(12px, 1.3cqw, 13px);
    font-variant-numeric: tabular-nums;
  }
  .dus-model-pct { font-size: 11.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }

  .dus-model-trend {
    margin-top: 16px;
    margin-top: clamp(14px, 2.2cqw, 22px);
    padding-top: 14px;
    padding-top: clamp(12px, 1.8cqw, 18px);
    border-top: 1px solid var(--dsw-alias-border-l1);
  }
  .dus-bars-head {
    display: flex; flex-wrap: wrap; align-items: center;
    gap: 8px 12px; margin-bottom: 10px;
  }
  .dus-bars-heading {
    display: flex; flex-wrap: wrap; align-items: baseline;
    gap: 4px 10px; min-width: 0; flex: 1 1 200px;
  }
  .dus-bars-title { font-size: 13.5px; font-weight: 600; margin: 0; line-height: 1.3; }
  .dus-trend-toggle { margin-left: auto; flex: none; }
  .dus-seg-sm .dus-seg-btn { padding: 3px 10px; font-size: 11px; }

  .dus-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: 72px 24px; text-align: center;
    color: var(--dsw-alias-label-secondary);
  }
  .dus-state-icon {
    width: 34px; height: 34px; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--dus-subtle-fill);
    color: var(--dsw-alias-label-secondary);
  }
  .dus-state-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
  .dus-state-desc { font-size: 13px; max-width: 420px; }
  .dus-btn {
    appearance: none; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500;
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 14px; border-radius: var(--dsw-radius-md);
    background: var(--dsw-alias-bg-layer-3);
    color: var(--dsw-alias-label-primary);
    border: 1px solid var(--dsw-alias-border-l2);
    transition: background 120ms ease, border-color 120ms ease;
  }
  .dus-btn:hover { background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-interactive-bg-hover)); }
  .dus-btn[disabled] { opacity: 0.55; cursor: default; }
  .dus-btn-primary {
    background: var(--dsw-alias-brand-primary);
    color: var(--dsw-alias-bg-base);
    border-color: transparent;
  }
  .dus-btn-primary:hover { background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary)); }

  .dus-refresh {
    flex: none;
  }

  .dus-toolbar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
    padding: 8px 12px;
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: var(--dsw-radius-md);
    background: var(--dsw-alias-bg-layer-2);
  }
  .dus-toolbar-error {
    color: var(--dsw-alias-state-error-primary, #e5484d);
    min-width: 0; max-width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 12px;
  }
  .dus-refresh-seg { flex: none; }
  .dus-toolbar-end {
    display: flex; align-items: center; gap: 8px;
    margin-left: auto; flex: none;
  }

  .dus-cards-picker { position: relative; display: flex; }
  .dus-cards-toggle {
    gap: 6px; padding: 6px 10px; font-size: 12.5px;
    white-space: nowrap;
  }
  .dus-cards-toggle[data-open] {
    background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-interactive-bg-hover));
    border-color: var(--dsw-alias-border-l2);
    box-shadow: var(--dsw-elevation-soft);
  }
  .dus-cards-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 26px; padding: 0 5px;
    border-radius: 999px;
    background: var(--dsw-alias-bg-layer-3);
    border: 1px solid var(--dsw-alias-border-l2);
    color: var(--dsw-alias-label-secondary);
    font-size: 10.5px; font-weight: 500; line-height: 15px;
    font-variant-numeric: tabular-nums;
  }

  .dus-cards-menu {
    position: absolute; top: calc(100% + 8px); right: 0; z-index: 40;
    display: flex; flex-direction: column; gap: 2px;
    width: 226px; max-width: calc(100vw - 24px);
    padding: 6px; box-sizing: border-box;
    border-radius: var(--dsw-radius-lg);
    border: 1px solid var(--dsw-alias-border-l2);
    background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-layer-2));
    box-shadow: var(--dsw-elevation-prominent);
  }
  .dus-cards-menu-head {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 6px 6px;
  }
  .dus-cards-menu-title {
    font-size: 12px; font-weight: 600;
    color: var(--dsw-alias-label-secondary);
  }
  .dus-cards-all {
    margin-left: auto;
    appearance: none; border: none; cursor: pointer; background: transparent;
    font-family: inherit; font-size: 11.5px; font-weight: 500;
    color: var(--dus-accent);
    padding: 2px 4px; border-radius: var(--dsw-radius-xs);
    transition: background 120ms ease;
  }
  .dus-cards-all:hover { background: var(--dsw-alias-interactive-bg-hover); }
  .dus-cards-all[disabled] {
    background: transparent; color: var(--dsw-alias-label-secondary);
    opacity: 0.5; cursor: default;
  }
  .dus-cards-list { display: flex; flex-direction: column; gap: 1px; }
  .dus-cards-option {
    display: flex; align-items: center; gap: 8px;
    width: 100%; box-sizing: border-box;
    appearance: none; border: none; cursor: pointer; background: transparent;
    font-family: inherit; font-size: 12.5px; font-weight: 400;
    color: var(--dsw-alias-label-primary); text-align: left;
    padding: 6px; border-radius: var(--dsw-radius-sm);
    transition: background 120ms ease;
  }
  .dus-cards-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
  .dus-cards-box {
    flex: none;
    width: 15px; height: 15px; box-sizing: border-box;
    display: grid; place-items: center;
    border: 1px solid var(--dsw-alias-border-l2);
    border-radius: 4px;
    background: var(--dsw-alias-bg-layer-2);
    color: var(--dsw-alias-bg-base);
  }
  .dus-cards-option[data-checked] .dus-cards-box {
    background: var(--dus-accent);
    border-color: transparent;
  }
  .dus-cards-option-label {
    min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .dus-cards-option[data-locked] { opacity: 0.55; cursor: default; }
  .dus-cards-option[data-locked]:hover { background: transparent; }
  .dus-cards-menu-foot {
    margin-top: 2px; padding: 7px 6px 2px;
    border-top: 1px solid var(--dsw-alias-border-l1);
    font-size: 11px; color: var(--dsw-alias-label-secondary);
  }

  .dus-cards-empty {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
    gap: 4px 10px;
    padding: 22px 16px;
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: var(--dsw-radius-lg);
    background: var(--dsw-alias-bg-layer-2);
    color: var(--dsw-alias-label-secondary);
    font-size: 13px;
  }
  .dus-cards-empty .dus-cards-all { margin-left: 0; font-size: 13px; }

  .dus-card-live .dus-live-value { color: var(--dsw-alias-label-primary); }
  .dus-live-value { display: inline-flex; align-items: baseline; justify-content: center; gap: 1px; }

  .dus-live-panel .dus-panel-head { margin-bottom: 4px; }
  .dus-live-head .dus-panel-title { font-weight: 600; }

  .dus-live-hero { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin-bottom: 2px; }
  .dus-live-hero-value {
    font-size: clamp(16px, 1.1cqw + 12px, 20px);
    font-weight: 650; letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    color: var(--dsw-alias-label-primary); line-height: 1.25;
  }
  .dus-realtime-host { margin-top: 10px; }
  .dus-live-bar { transition: opacity 140ms ease; }
  .dus-spin { animation: dus-rotate 900ms linear infinite; }
  @keyframes dus-rotate { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .dus-spin { animation-duration: 2200ms; }
    .dus-heat-cell { transition: none; }
  }
  `;
