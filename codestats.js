#!/usr/bin/env node

const { GIST_ID, GITHUB_TOKEN, CODESTATS_USER } = process.env;
const { GistBox } = require('gist-box');

if (!GITHUB_TOKEN || !GIST_ID || !CODESTATS_USER) {
  throw new Error('Missing required env vars: GITHUB_TOKEN, GIST_ID, CODESTATS_USER');
}

const box = new GistBox({
  id: GIST_ID,
  token: GITHUB_TOKEN,
});

const CODESTATS_API = `https://codestats.net/api/users/${encodeURIComponent(CODESTATS_USER)}`;

const LEVEL_FACTOR = 0.025;
const DAILY_TARGET_XP = 5000;
const WEEKLY_TARGET_XP = DAILY_TARGET_XP * 7;
const BAR_SIZE = 15;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const stats = await fetchCodeStats();
  const content = buildGistContent(stats);

  console.log(content);

  await box.update({
    filename: '📊 Recent Code::Stats',
    description: 'codestats analysis',
    content,
  });
}

async function fetchCodeStats() {
  const response = await fetch(CODESTATS_API, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'codestats-gist-box',
    },
  });

  if (!response.ok) {
    throw new Error(`Code::Stats API failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function buildGistContent(stats) {
  const totalXp = stats.total_xp || 0;
  const todayXp = stats.new_xp || 0;

  const level = getLevel(totalXp);
  const levelProgress = getLevelProgress(totalXp, level);

  const activeLanguages = getActiveLanguages(stats.languages || {});
  const activeMachines = getActiveMachines(stats.machines || {});
  const recentDays = getRecentDays(stats.dates || {}, 7);

  const weekXp = recentDays.reduce((sum, day) => sum + day.xp, 0);
  const streak = getCurrentStreak(stats.dates || {});

  const topLanguage = activeLanguages[0];
  const topMachine = activeMachines[0];

  const lines = [];

  lines.push(
    `Lv.${padLeft(level, 2)}      ${bar(levelProgress.percent, BAR_SIZE)} ${levelProgress.percent}%`
  );

  lines.push(
    `Today      ${bar(percentOf(todayXp, DAILY_TARGET_XP), BAR_SIZE)} ${number(todayXp)} XP`
  );

  if (topMachine) {
    lines.push(
      `Machine    ${bar(percentOf(topMachine.xp, DAILY_TARGET_XP), BAR_SIZE)} ${topMachine.name} ${number(topMachine.xp)}`
    );
  } else {
    lines.push(
      `Machine    ${bar(0, BAR_SIZE)} none`
    );
  }

  if (topLanguage) {
    lines.push(
      `${padRight(truncate(topLanguage.name, 10), 10)} ${bar(percentOf(topLanguage.xp, DAILY_TARGET_XP), BAR_SIZE)} ${number(topLanguage.xp)} XP`
    );
  } else {
    lines.push(
      `Language   ${bar(0, BAR_SIZE)} none`
    );
  }

  lines.push(
    `7d +${padRight(number(weekXp), 6)} ${bar(percentOf(weekXp, WEEKLY_TARGET_XP), BAR_SIZE)} 🔥${streak}`
  );

  return `${lines.join('\n')}\n`;
}

function getLevel(totalXp) {
  return Math.floor(LEVEL_FACTOR * Math.sqrt(totalXp));
}

function getLevelProgress(totalXp, level) {
  const currentLevelXp = Math.pow(level * 40, 2);
  const nextLevelXp = Math.pow((level + 1) * 40, 2);

  const percent = ((totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;

  return {
    currentLevelXp,
    nextLevelXp,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
  };
}

function getActiveLanguages(languages) {
  return Object.entries(languages)
    .map(([name, stats]) => ({
      name,
      xp: stats.new_xps || 0,
      totalXp: stats.xps || 0,
    }))
    .filter((language) => language.xp > 0)
    .sort((a, b) => b.xp - a.xp || b.totalXp - a.totalXp);
}

function getActiveMachines(machines) {
  return Object.entries(machines)
    .map(([name, stats]) => ({
      name,
      xp: stats.new_xps || 0,
      totalXp: stats.xps || 0,
    }))
    .filter((machine) => machine.xp > 0)
    .sort((a, b) => b.xp - a.xp || b.totalXp - a.totalXp);
}

function getRecentDays(dates, count) {
  const keys = Object.keys(dates).sort();

  if (keys.length === 0) {
    return [];
  }

  const latestDate = keys[keys.length - 1];
  const days = [];

  for (let i = count - 1; i >= 0; i--) {
    const date = addDays(latestDate, -i);

    days.push({
      date,
      xp: dates[date] || 0,
    });
  }

  return days;
}

function getCurrentStreak(dates) {
  const keys = Object.keys(dates).sort();

  if (keys.length === 0) {
    return 0;
  }

  let date = keys[keys.length - 1];
  let streak = 0;

  while ((dates[date] || 0) > 0) {
    streak += 1;
    date = addDays(date, -1);
  }

  return streak;
}

function addDays(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function percentOf(value, target) {
  if (!target) {
    return 0;
  }

  return (value / target) * 100;
}

function bar(percent, size) {
  const syms = '░▏▎▍▌▋▊▉█';
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const frac = Math.floor((size * 8 * safePercent) / 100);
  const barsFull = Math.floor(frac / 8);

  if (barsFull >= size) {
    return syms[8].repeat(size);
  }

  const semi = frac % 8;

  return `${syms[8].repeat(barsFull)}${syms[semi]}`.padEnd(size, syms[0]);
}

function truncate(value, maxLength) {
  const chars = Array.from(String(value));

  if (chars.length <= maxLength) {
    return String(value);
  }

  return `${chars.slice(0, maxLength - 1).join('')}…`;
}

function padRight(value, length) {
  const chars = Array.from(String(value));
  const padding = Math.max(0, length - chars.length);

  return `${value}${' '.repeat(padding)}`;
}

function padLeft(value, length) {
  const chars = Array.from(String(value));
  const padding = Math.max(0, length - chars.length);

  return `${' '.repeat(padding)}${value}`;
}

function number(value) {
  return Number(value || 0).toLocaleString('en-US');
}
