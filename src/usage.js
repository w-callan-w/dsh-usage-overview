import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { foldSessionLog } from './log-fold.js';
import { PANEL_ID, USAGE_SCHEMA_VERSION, cacheHitRate } from './protocol.js';

function emptyTotals() {
  return {
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  };
}

function addTotals(target, source) {
  if (typeof source !== 'object' || source === null) return;
  for (const key of Object.keys(target)) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) target[key] += value;
  }
}

function totalOf(totals) {
  if (typeof totals !== 'object' || totals === null) return 0;
  let sum = 0;
  for (const value of Object.values(totals)) {
    if (typeof value === 'number' && Number.isFinite(value)) sum += value;
  }
  return sum;
}

async function readJsonQuietly(path) {
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function foldProjectionCache(document) {
  const rows = document?.record?.rows;
  if (typeof rows !== 'object' || rows === null) return undefined;

  const identity = document?.record?.identity;
  const createdAt = typeof identity?.createdAt === 'number' ? identity.createdAt : undefined;
  const cwd = typeof identity?.cwd === 'string' ? identity.cwd : undefined;

  const usage = rows.tokenUsage?.val;
  const totals = emptyTotals();
  if (typeof usage?.totals === 'object' && usage.totals !== null) addTotals(totals, usage.totals);

  const selection = rows.modelSelection?.val?.lastUsed;
  const provider = typeof selection?.provider === 'string' ? selection.provider : undefined;
  const model = typeof selection?.model === 'string' ? selection.model : undefined;

  const stats = rows.sessionStats?.val;
  const sessionStats =
    typeof stats === 'object' && stats !== null
      ? {
          turns: typeof stats.turns === 'number' ? stats.turns : 0,
          steps: typeof stats.steps === 'number' ? stats.steps : 0,
          llmMs: typeof stats.llmMs === 'number' ? stats.llmMs : 0,
          toolMs: typeof stats.toolMs === 'number' ? stats.toolMs : 0,
        }
      : undefined;

  const title = rows.title?.val;
  const lastPromptAt = rows.sessionListMetadata?.val?.lastPromptAt;

  return {
    createdAt,
    cwd,
    provider,
    model,
    totals,
    sessionStats,
    title: typeof title === 'string' && title.length > 0 ? title : undefined,
    lastActivityAt: typeof lastPromptAt === 'number' ? lastPromptAt : createdAt,
  };
}

export async function collectSessions(home) {
  const byId = new Map();

  const indexPath = join(home, 'sessions');
  let workspaceDirs = [];
  try {
    workspaceDirs = await readdir(indexPath, { withFileTypes: true });
  } catch {
    workspaceDirs = [];
  }

  for (const workspaceDir of workspaceDirs) {
    if (!workspaceDir.isDirectory()) continue;
    const workspacePath = join(indexPath, workspaceDir.name);
    let sessionDirs = [];
    try {
      sessionDirs = await readdir(workspacePath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue;
      const sessionId = sessionDir.name;
      if (!sessionId.startsWith('session-')) continue;
      const absolute = join(workspacePath, sessionId);
      let createdAt;
      try {
        const info = await stat(absolute);
        createdAt = info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs;
      } catch {
        createdAt = undefined;
      }
      byId.set(sessionId, {
        id: sessionId,
        createdAt,
        totals: emptyTotals(),
        byDay: new Map(),
        byModel: new Map(),
        observed: false,
        logPath: join(absolute, 'session.v4.jsonl.zstd'),
      });
    }
  }

  for (const [sessionId, record] of byId) {
    const folded = foldSessionLog(record.logPath);
    if (folded === undefined) continue;
    byId.set(sessionId, {
      ...record,
      createdAt: folded.firstAt ?? record.createdAt,
      totals: folded.totals,
      byDay: folded.byDay,
      byModel: folded.byModel,
      wallMs: folded.wallMs,
      turns: folded.turns,
      steps: folded.steps,
      lastActivityAt: folded.lastAt ?? record.createdAt,
      observed: true,
    });
  }

  const cachePath = join(home, 'storages', 'session_projcache', 'sessions');
  let cacheFiles = [];
  try {
    cacheFiles = await readdir(cachePath);
  } catch {
    cacheFiles = [];
  }

  for (const fileName of cacheFiles) {
    if (!fileName.endsWith('.json')) continue;
    const sessionId = fileName.slice(0, -'.json'.length);
    const folded = foldProjectionCache(await readJsonQuietly(join(cachePath, fileName)));
    if (folded === undefined) continue;

    const existing = byId.get(sessionId);
    const hasLogFigures = existing !== undefined && totalOf(existing.totals) > 0;
    byId.set(sessionId, {
      id: sessionId,
      createdAt: existing?.createdAt ?? folded.createdAt,
      cwd: folded.cwd,
      provider: folded.provider,
      model: folded.model,
      totals: hasLogFigures ? existing.totals : folded.totals,
      byDay: existing?.byDay ?? new Map(),
      byModel: existing?.byModel ?? new Map(),
      sessionStats: folded.sessionStats,
      title: folded.title,
      wallMs: existing?.wallMs,
      turns: existing?.turns,
      steps: existing?.steps,
      lastActivityAt: existing?.lastActivityAt ?? folded.lastActivityAt ?? folded.createdAt,
      observed: true,
      logPath: existing?.logPath,
    });
  }

  return [...byId.values()];
}

export function mergeLive(sessions, live) {
  if (live.size === 0) return sessions;
  return sessions.map((session) => {
    const running = live.get(session.id);
    if (running === undefined) return session;
    return {
      ...session,
      createdAt: session.createdAt ?? running.createdAt,
      provider: running.provider ?? session.provider,
      model: running.model ?? session.model,
      totals: totalOf(running.totals) > 0 ? running.totals : session.totals,
      sessionStats: running.sessionStats ?? session.sessionStats,
      lastActivityAt: running.lastActivityAt ?? session.lastActivityAt,
      live: true,
    };
  });
}

export function buildUsageDocument(sessions, options) {
  const { now, rangeDays, providerLabels, liveIds } = options;

  const windowStart = rangeDays === null ? null : now - rangeDays * 86400000;

  const dayInWindow = (key) => {
    if (windowStart === null) return true;
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day).getTime() >= windowStart;
  };

  const scoped = sessions.filter((session) => {
    if (windowStart === null) return true;
    if (session.byDay !== undefined && session.byDay.size > 0) {
      for (const key of session.byDay.keys()) if (dayInWindow(key)) return true;
      return false;
    }
    const stamp = session.lastActivityAt ?? session.createdAt;
    if (typeof stamp !== 'number') return true;
    return stamp >= windowStart;
  });

  const totals = emptyTotals();
  let peakSessionTokens = 0;
  let turns = 0;
  let steps = 0;

  for (const session of scoped) {
    if (session.byDay !== undefined && session.byDay.size > 0) {
      let sessionTotal = 0;
      for (const [key, day] of session.byDay) {
        if (!dayInWindow(key)) continue;
        addTotals(totals, day.totals);
        sessionTotal += totalOf(day.totals);
      }
      if (sessionTotal > peakSessionTokens) peakSessionTokens = sessionTotal;
    } else {
      addTotals(totals, session.totals);
      const sessionTotal = totalOf(session.totals);
      if (sessionTotal > peakSessionTokens) peakSessionTokens = sessionTotal;
    }
    turns += session.turns ?? session.sessionStats?.turns ?? 0;
    steps += session.steps ?? session.sessionStats?.steps ?? 0;
  }

  const dayMap = new Map();
  const ensureDay = (key) => {
    let entry = dayMap.get(key);
    if (entry === undefined) {
      entry = { day: key, totals: emptyTotals(), sessions: 0, byModel: new Map(), seen: new Set() };
      dayMap.set(key, entry);
    }
    return entry;
  };

  for (const session of scoped) {
    if (session.byDay !== undefined && session.byDay.size > 0) {
      for (const [key, day] of session.byDay) {
        if (!dayInWindow(key)) continue;
        const entry = ensureDay(key);
        addTotals(entry.totals, day.totals);
        if (!entry.seen.has(session.id)) {
          entry.seen.add(session.id);
          entry.sessions += 1;
        }
        for (const route of day.byRoute.values()) {
          const routeKey = `${route.provider}/${route.model}`;
          entry.byModel.set(routeKey, (entry.byModel.get(routeKey) ?? 0) + route.total);
        }
      }
      continue;
    }
    const stamp = session.lastActivityAt ?? session.createdAt;
    if (typeof stamp !== 'number' || !Number.isFinite(stamp)) continue;
    const key = localDayKey(stamp);
    if (!dayInWindow(key)) continue;
    const sessionTotal = totalOf(session.totals);
    if (sessionTotal <= 0) continue;
    const entry = ensureDay(key);
    entry.sessions += 1;
    addTotals(entry.totals, session.totals);
    const seriesKey = session.model ?? 'unknown';
    entry.byModel.set(seriesKey, (entry.byModel.get(seriesKey) ?? 0) + sessionTotal);
  }

  const days = [...dayMap.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((entry) => ({
      day: entry.day,
      total: totalOf(entry.totals),
      totals: entry.totals,
      sessions: entry.sessions,
      byModel: Object.fromEntries(entry.byModel),
    }));

  const modelMap = new Map();
  const ensureModel = (provider, model) => {
    const key = `${provider}\u0000${model}`;
    let entry = modelMap.get(key);
    if (entry === undefined) {
      entry = {
        model,
        provider,
        source: providerLabels[provider] ?? provider,
        totals: emptyTotals(),
        sessions: 0,
        calls: 0,
        turns: 0,
        seen: new Set(),
        turnIds: new Set(),
      };
      modelMap.set(key, entry);
    }
    return entry;
  };

  for (const session of scoped) {
    if (session.byDay !== undefined && session.byDay.size > 0) {
      for (const [key, day] of session.byDay) {
        if (!dayInWindow(key)) continue;
        for (const route of day.byRoute.values()) {
          const entry = ensureModel(route.provider, route.model);
          addTotals(entry.totals, route.totals);
          entry.calls += route.samples;
          for (const turn of route.turns) entry.turnIds.add(`${session.id}:${String(turn)}`);
          if (!entry.seen.has(session.id)) {
            entry.seen.add(session.id);
            entry.sessions += 1;
          }
        }
      }
      continue;
    }
    const entry = ensureModel(session.provider ?? 'unknown', session.model ?? 'unknown');
    addTotals(entry.totals, session.totals);
    entry.sessions += 1;
  }

  const models = [...modelMap.values()]
    .map(({ seen, turnIds, ...entry }) => ({ ...entry, turns: turnIds.size, total: totalOf(entry.totals) }))
    .sort((a, b) => b.total - a.total);

  const activeDays = [...new Set(days.filter((day) => day.total > 0).map((day) => day.day))].sort();
  const { current: currentStreak, longest: longestStreak } = streaks(activeDays, now);

  const grandTotal = totalOf(totals);
  const activeDayCount = activeDays.length;
  const averageTokensPerActiveDay = activeDayCount === 0 ? 0 : Math.round(grandTotal / activeDayCount);

  const peakDay = days.reduce(
    (best, day) => (day.total > best.total ? { total: day.total, day: day.day } : best),
    { total: 0, day: null },
  );

  return {
    schemaVersion: USAGE_SCHEMA_VERSION,
    generatedAt: now,
    panelId: PANEL_ID,
    scope: {
      rangeDays,
      windowStart,
      sessionCount: scoped.length,
      totalSessionCount: sessions.length,
      liveSessionCount: liveIds.size,
    },
    totals: {
      ...totals,
      total: grandTotal,
      peakDayTokens: peakDay.total,
      peakDay: peakDay.day,
      peakSessionTokens,
      activeDays: activeDayCount,
      averageTokensPerActiveDay,
      turns,
      steps,
      currentStreak,
      longestStreak,
      cacheHitRate: cacheHitRate(totals),
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      uncachedInputTokens: totals.uncachedInputTokens,
    },
    days,
    models,
  };
}

function localDayKey(ms) {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}

function streaks(activeDays, now) {
  if (activeDays.length === 0) return { current: 0, longest: 0 };

  const asDay = (key) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };

  let longest = 1;
  let run = 1;
  for (let index = 1; index < activeDays.length; index += 1) {
    const gap = asDay(activeDays[index]) - asDay(activeDays[index - 1]);
    run = gap === 86400000 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const today = asDay(localDayKey(now));
  const last = asDay(activeDays[activeDays.length - 1]);
  const behind = Math.round((today - last) / 86400000);
  let current = 0;
  if (behind === 0 || behind === 1) {
    current = 1;
    for (let index = activeDays.length - 1; index > 0; index -= 1) {
      if (asDay(activeDays[index]) - asDay(activeDays[index - 1]) !== 86400000) break;
      current += 1;
    }
  }

  return { current, longest };
}
