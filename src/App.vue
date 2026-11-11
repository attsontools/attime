<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import {
  cronNextRuns,
  DEFAULT_DISPLAY_ZONES,
  describeCron,
  formatDurationHuman,
  formatInZones,
  parseCron,
  parseDuration,
  parseUnixInput,
  wallInZoneToMs,
  type CronParts
} from './time';
import type { ThemeName, TimeHost } from './host/types';

const props = defineProps<{ host: TimeHost }>();

type Tab = 'timestamp' | 'timezone' | 'cron' | 'duration';
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'timestamp', label: '时间戳' },
  { id: 'timezone', label: '时区' },
  { id: 'cron', label: 'Cron' },
  { id: 'duration', label: 'Duration' }
];

const active = ref<Tab>('timestamp');
const theme = ref<ThemeName>('dark');
const connecting = ref(true);
const connectionError = ref('');
const copyState = ref<'idle' | 'ok' | 'fail'>('idle');
const now = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | undefined;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const unixInput = ref('');
const parsedUnix = computed(() => parseUnixInput(unixInput.value));
const unixMs = computed(() => parsedUnix.value ?? now.value);
const unixSeconds = computed(() => Math.floor(unixMs.value / 1000));
const timestampZones = computed(() => formatInZones(unixMs.value));

const wallTime = ref(formatLocalDateTime(new Date()));
const sourceZone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
const targetZones = ref([
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Australia/Sydney',
  'UTC'
]);
const newZone = ref('');
const timezoneOptions = (
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [sourceZone.value]
).map((zone) => ({ label: zone, value: zone }));
const wallMs = computed(() => wallInZoneToMs(wallTime.value, sourceZone.value));
const timezoneResults = computed(() => (
  wallMs.value === null ? [] : formatInZones(wallMs.value, targetZones.value)
));

const cronInput = ref('*/5 * * * *');
const cronError = ref('');
const cronParts = ref<CronParts | null>(null);
let cronTimer: ReturnType<typeof setTimeout> | undefined;
const cronDescription = computed(() => cronParts.value ? describeCron(cronParts.value) : '');
const cronRuns = computed(() => (
  cronParts.value ? cronNextRuns(cronParts.value, now.value, 8) : []
));

const durationInput = ref('1h30m');
const durationMs = computed(() => parseDuration(durationInput.value));
const durationError = computed(() => (
  durationInput.value.trim() && durationMs.value === null
    ? '无法解析：支持 ms/s/m/h/d/w 或 毫秒/秒/分钟/小时/天/周'
    : ''
));
const durationRows = computed(() => {
  if (durationMs.value === null) return [];
  const value = durationMs.value;
  return [
    ['毫秒', value],
    ['秒', value / 1000],
    ['分', value / 60_000],
    ['小时', value / 3_600_000],
    ['天', value / 86_400_000],
    ['人类可读', formatDurationHuman(value)]
  ];
});

onMounted(async () => {
  clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
  parseCurrentCron();
  try {
    theme.value = await props.host.initialize((value) => {
      theme.value = value;
      applyTheme();
    });
    applyTheme();
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    connecting.value = false;
  }
});

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
  if (copyTimer) clearTimeout(copyTimer);
  if (cronTimer) clearTimeout(cronTimer);
  props.host.dispose();
});

function applyTheme() {
  document.documentElement.dataset.theme = theme.value;
}

async function toggleTheme() {
  theme.value = await props.host.toggleTheme();
  applyTheme();
}

async function copy(value: string | number) {
  if (copyTimer) clearTimeout(copyTimer);
  try {
    await props.host.copy(String(value));
    copyState.value = 'ok';
  } catch {
    copyState.value = 'fail';
  }
  copyTimer = setTimeout(() => { copyState.value = 'idle'; }, 1600);
}

function useCurrentUnix() {
  unixInput.value = String(now.value);
}

function useCurrentWallTime() {
  wallTime.value = formatLocalDateTime(new Date());
  sourceZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function addTargetZone() {
  const value = newZone.value.trim();
  if (value && !targetZones.value.includes(value)) targetZones.value.push(value);
  newZone.value = '';
}

function removeTargetZone(zone: string) {
  targetZones.value = targetZones.value.filter((value) => value !== zone);
}

function scheduleCronParse() {
  if (cronTimer) clearTimeout(cronTimer);
  cronTimer = setTimeout(parseCurrentCron, 200);
}

function parseCurrentCron() {
  cronError.value = '';
  try {
    cronParts.value = parseCron(cronInput.value);
  } catch (error) {
    cronParts.value = null;
    cronError.value = String(error);
  }
}

function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatCronRun(ms: number): string {
  const date = new Date(ms);
  return `${formatLocalDateTime(date).slice(0, 16)} · ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]}`;
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">时</span>
        <div class="brand-copy">
          <strong>时间工具</strong>
          <span>时间戳、时区、Cron 与 Duration</span>
        </div>
      </div>
      <div class="top-actions">
        <span v-if="copyState !== 'idle'" class="copy-state" :class="`is-${copyState}`">
          {{ copyState === 'ok' ? '已复制' : '复制失败' }}
        </span>
        <span class="host-badge">{{ host.mode === 'plugin' ? '平台插件' : '独立应用' }}</span>
        <button
          v-if="host.mode === 'standalone'"
          class="icon-button"
          type="button"
          :title="theme === 'dark' ? '切换到浅色' : '切换到深色'"
          :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
          @click="toggleTheme"
        >
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/></svg>
        </button>
      </div>
    </header>

    <div v-if="connecting" class="center-state">正在连接宿主</div>
    <div v-else-if="connectionError" class="center-state error-state">
      <strong>无法启动时间工具</strong>
      <span>{{ connectionError }}</span>
    </div>

    <template v-else>
      <nav class="tabs" aria-label="时间工具">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          :class="{ active: active === item.id }"
          @click="active = item.id"
        >{{ item.label }}</button>
      </nav>

      <section v-if="active === 'timestamp'" class="workspace">
        <article class="panel">
          <header>时间戳</header>
          <div class="panel-body form-stack">
            <input v-model="unixInput" placeholder="秒 / 毫秒 / 微秒 / 纳秒（留空则用当前时间）">
            <div><button class="primary" type="button" @click="useCurrentUnix">使用当前时间</button></div>
            <div class="stat-grid">
              <button class="stat" type="button" @click="copy(unixSeconds)"><span>Unix 秒</span><strong class="mono">{{ unixSeconds }}</strong></button>
              <button class="stat" type="button" @click="copy(unixMs)"><span>Unix 毫秒</span><strong class="mono">{{ unixMs }}</strong></button>
            </div>
          </div>
        </article>
        <article class="panel">
          <header>多时区显示</header>
          <div class="table-scroll">
            <table>
              <tbody><tr v-for="item in timestampZones" :key="item.zone"><td class="mono muted">{{ item.zone }}</td><td><button class="cell-action mono" type="button" @click="copy(item.formatted)">{{ item.formatted }}</button></td><td class="muted">{{ item.offset }}</td></tr></tbody>
            </table>
          </div>
          <p class="panel-hint">点时间或数值复制。</p>
        </article>
      </section>

      <section v-else-if="active === 'timezone'" class="workspace">
        <article class="panel">
          <header>源时间</header>
          <div class="panel-body field-row">
            <label class="field"><span>时间（YYYY-MM-DD HH:mm:ss）</span><input v-model="wallTime" placeholder="2026-07-08 14:30:00"></label>
            <label class="field grow"><span>源时区</span><select v-model="sourceZone"><option v-for="option in timezoneOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
            <button class="primary" type="button" @click="useCurrentWallTime">当前时间</button>
          </div>
        </article>
        <article class="panel">
          <header>目标时区</header>
          <div class="panel-body form-stack">
            <div class="chips"><span v-for="zone in targetZones" :key="zone" class="chip">{{ zone }}<button type="button" :aria-label="`移除 ${zone}`" @click="removeTargetZone(zone)">×</button></span></div>
            <div class="field-row"><label class="field grow"><span>添加时区</span><select v-model="newZone"><option value="">请选择</option><option v-for="option in timezoneOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><button type="button" :disabled="!newZone" @click="addTargetZone">添加</button></div>
          </div>
        </article>
        <article v-if="timezoneResults.length" class="panel">
          <header>转换结果</header>
          <div class="table-scroll"><table><tbody><tr v-for="item in timezoneResults" :key="item.zone"><td class="mono muted">{{ item.zone }}</td><td class="mono">{{ item.formatted }}</td><td class="muted">{{ item.offset }}</td></tr></tbody></table></div>
        </article>
      </section>

      <section v-else-if="active === 'cron'" class="workspace">
        <article class="panel">
          <header>Cron 表达式（5 段：分 时 日 月 周）</header>
          <div class="panel-body"><input v-model="cronInput" placeholder="*/5 * * * *" @input="scheduleCronParse"><p class="hint">支持 `*`, `,`, `-`, `/`。周里 0 与 7 都是周日。</p></div>
        </article>
        <div v-if="cronError" class="alert error">{{ cronError }}</div>
        <article v-if="cronParts" class="panel"><header>解读</header><div class="panel-body"><p class="description">{{ cronDescription }}</p></div></article>
        <article v-if="cronParts" class="panel"><header>未来 8 次触发（本地时区）</header><ol class="runs"><li v-for="run in cronRuns" :key="run" class="mono">{{ formatCronRun(run) }}</li></ol></article>
      </section>

      <section v-else class="workspace">
        <article class="panel"><header>输入</header><div class="panel-body"><input v-model="durationInput" placeholder="例如 1h30m / 2d3h / 90m / 90000（毫秒） / 1天2小时"></div></article>
        <div v-if="durationError" class="alert warning">{{ durationError }}</div>
        <article v-if="durationRows.length" class="panel">
          <header>换算</header>
          <div class="table-scroll"><table><tbody><tr v-for="row in durationRows" :key="row[0]"><td class="muted">{{ row[0] }}</td><td><button class="cell-action" :class="{ mono: row[0] !== '人类可读' }" type="button" @click="copy(row[1])">{{ row[1] }}</button></td></tr></tbody></table></div>
          <p class="panel-hint">点数值复制。</p>
        </article>
      </section>
    </template>
  </main>
</template>
