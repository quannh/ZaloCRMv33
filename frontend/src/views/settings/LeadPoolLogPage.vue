<!--
  LeadPoolLogPage — Nhật ký chia lead (admin). Phase Lead Pool FIFO 2026-06-15.
  Mỗi dòng = 1 lần phát lead. Nhóm theo ngày VN. Đếm số lần chia mỗi KH (round).
  Hiện trạng thái KH + ghi chú sale. Thanh tiến độ vòng tua (C1). Theo mockup #3.
-->
<template>
  <div class="lpl">
    <!-- Thanh tiến độ vòng tua C1 -->
    <div class="lpl-round" v-if="dash">
      <div class="lpl-round-ic"><v-icon size="22" icon="mdi-rotate-right" /></div>
      <div class="lpl-round-main">
        <div class="lpl-round-top">
          <span class="lpl-round-num">{{ dash.round.distributedThisRound }} / {{ dash.round.poolTotal }}</span>
          <span class="lpl-round-lab">lead đã chia trong vòng tua này · còn {{ dash.round.remaining }} lead chưa ai bóc</span>
        </div>
        <div class="lpl-round-track"><i :style="{ width: roundPct + '%' }"></i></div>
      </div>
      <div class="lpl-round-side">
        <div class="s-v">Vòng #{{ dash.round.currentRound }}</div>
        <div class="s-l">lead mới thêm sẽ<br>chen lên đầu vòng</div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="lpl-toolbar">
      <div class="lpl-title">
        <h2>Nhật ký chia lead</h2>
        <p>Mỗi lần phát lead = 1 dòng. Xem theo ngày, đếm số lần đã chia mỗi khách.</p>
      </div>
      <div class="lpl-filters">
        <input type="date" v-model="filterDate" class="lpl-input" @change="reload" />
        <select v-model="filterUser" class="lpl-input" @change="reload">
          <option value="">Tất cả sale</option>
          <option v-for="s in saleOptions" :key="s.userId" :value="s.userId">{{ s.fullName }}</option>
        </select>
        <button class="lpl-btn" @click="reload"><v-icon size="16" icon="mdi-refresh" /> Làm mới</button>
      </div>
    </div>

    <div v-if="loading" class="lpl-loading">Đang tải nhật ký…</div>
    <div v-else-if="groups.length === 0" class="lpl-empty">Chưa có lần chia nào.</div>

    <!-- Nhóm theo ngày -->
    <div v-for="g in groups" :key="g.dateKey" class="lpl-group">
      <div class="lpl-dayhd" @click="toggle(g.dateKey)">
        <v-icon size="18" :icon="collapsed.has(g.dateKey) ? 'mdi-chevron-right' : 'mdi-chevron-down'" />
        <span class="dh-t">{{ g.dateLabel }}</span>
        <span class="dh-c">{{ g.count }} lần chia</span>
      </div>
      <table v-show="!collapsed.has(g.dateKey)" class="lpl-tbl">
        <thead>
          <tr><th>Giờ</th><th>Khách hàng</th><th>SĐT</th><th>Sale nhận</th><th>Nguồn</th><th>Lần</th><th>Trạng thái</th><th>Ghi chú sale</th></tr>
        </thead>
        <tbody>
          <tr v-for="it in g.items" :key="it.id" :class="{ 'warn-row': it.round >= 5 }">
            <td class="num">{{ fmtTime(it.distributedAt) }}</td>
            <td>
              <div class="cust">
                <img v-if="it.contactAvatar" class="av sm" :src="it.contactAvatar" alt="" @error="onImgErr" />
                <span v-else class="av sm">{{ initials(it.contactName) }}</span>
                <span class="cn">{{ it.contactName || '(không tên)' }}</span>
              </div>
            </td>
            <td class="num">{{ it.phone || '—' }}</td>
            <td>
              <div class="cust">
                <img v-if="it.saleAvatar" class="av sm" :src="it.saleAvatar" alt="" @error="onImgErr" />
                <span v-else class="av sm">{{ initials(it.saleName) }}</span>
                <span class="cn">{{ it.saleName || '—' }}</span>
              </div>
            </td>
            <td><span class="pill-src">{{ it.sourceLabel }}</span></td>
            <td><span class="chip" :class="roundClass(it.round)">{{ it.round }}{{ it.round >= 5 ? ' ⚠' : '' }}</span></td>
            <td>
              <span v-if="it.status" class="statecell" :style="statusStyle(it.status.color)">
                <span class="dot" :style="{ background: it.status.color || '#9CA3AF' }"></span>{{ it.status.name }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td class="note-cell">{{ it.note || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLeadPool } from '@/composables/use-lead-pool';

const { fetchDistributionLog, fetchAdminDashboard } = useLeadPool();

const loading = ref(false);
const groups = ref<Array<{ dateKey: string; dateLabel: string; count: number; items: any[] }>>([]);
const dash = ref<any>(null);
const collapsed = ref(new Set<string>());
const filterDate = ref('');
const filterUser = ref('');

const roundPct = computed(() => {
  if (!dash.value || !dash.value.round.poolTotal) return 0;
  return Math.min(100, Math.round((dash.value.round.distributedThisRound / dash.value.round.poolTotal) * 100));
});
const saleOptions = computed(() => dash.value?.salePerformance ?? []);

function toggle(key: string) {
  if (collapsed.value.has(key)) collapsed.value.delete(key);
  else collapsed.value.add(key);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
}
function initials(name: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
}
function roundClass(r: number) {
  if (r >= 5) return 'c-r3';
  if (r >= 2) return 'c-r2';
  return 'c-r1';
}
function statusStyle(color: string | null) {
  const c = color || '#9CA3AF';
  return { background: c + '1f', color: c };
}
function onImgErr(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

async function reload() {
  loading.value = true;
  try {
    const [log, d] = await Promise.all([
      fetchDistributionLog({ date: filterDate.value || undefined, userId: filterUser.value || undefined }),
      dash.value ? Promise.resolve(dash.value) : fetchAdminDashboard(),
    ]);
    groups.value = log.groups;
    if (!dash.value) dash.value = d;
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.lpl { display: flex; flex-direction: column; gap: 14px; }
.lpl-round { display: flex; align-items: center; gap: 20px; padding: 16px 18px; border-radius: 14px;
  background: linear-gradient(135deg, #0e455c, #082b3a); color: #fff; box-shadow: 0 4px 12px rgba(20,26,36,.12); }
.lpl-round-ic { width: 42px; height: 42px; border-radius: 11px; background: rgba(91,184,229,.18);
  border: 1px solid rgba(91,184,229,.35); color: #5bb8e5; display: flex; align-items: center; justify-content: center; flex: none; }
.lpl-round-main { flex: 1; }
.lpl-round-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.lpl-round-num { font-family: 'Roboto Mono', monospace; font-size: 22px; font-weight: 800; }
.lpl-round-lab { font-size: 12.5px; color: #cfe2ec; }
.lpl-round-track { height: 9px; border-radius: 5px; background: rgba(255,255,255,.12); overflow: hidden; }
.lpl-round-track i { display: block; height: 100%; background: linear-gradient(90deg, #5bb8e5, #7fd0f0); border-radius: 5px; transition: width .4s; }
.lpl-round-side { text-align: right; flex: none; }
.lpl-round-side .s-v { font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 800; color: #5bb8e5; }
.lpl-round-side .s-l { font-size: 11px; color: #7fa6b8; }

.lpl-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.lpl-title h2 { font-size: 18px; font-weight: 800; margin: 0; }
.lpl-title p { font-size: 12.5px; color: #6b7488; margin: 4px 0 0; }
.lpl-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.lpl-input { height: 34px; border: 1px solid #e7eaf0; border-radius: 8px; padding: 0 10px; font-size: 13px; font-family: inherit; background: #fff; }
.lpl-btn { height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid #e7eaf0; background: #fff; font-size: 13px;
  font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.lpl-btn:hover { background: #f1f4f9; }
.lpl-loading, .lpl-empty { font-size: 13px; color: #6b7488; padding: 30px; text-align: center; }

.lpl-group { background: #fff; border: 1px solid #e7eaf0; border-radius: 12px; overflow: hidden; }
.lpl-dayhd { display: flex; align-items: center; gap: 10px; padding: 11px 14px; background: #f7f9fc; cursor: pointer; }
.lpl-dayhd .dh-t { font-weight: 700; font-size: 13px; }
.lpl-dayhd .dh-c { font-size: 11.5px; color: #6b7488; background: #fff; border: 1px solid #e7eaf0; padding: 2px 9px; border-radius: 999px; }

.lpl-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.lpl-tbl thead th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  color: #97a0b3; padding: 9px 12px; border-bottom: 1px solid #e7eaf0; white-space: nowrap; }
.lpl-tbl tbody td { padding: 9px 12px; border-bottom: 1px solid #eef1f6; vertical-align: middle; }
.lpl-tbl tbody tr:hover { background: #f2f8fc; }
.lpl-tbl tbody tr.warn-row { background: #fdf3e2; }
.num { font-family: 'Roboto Mono', monospace; font-variant-numeric: tabular-nums; }
.cust { display: flex; align-items: center; gap: 8px; }
.av.sm { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg,#4fb0e0,#0f6fa0); color: #fff;
  font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; object-fit: cover; }
img.av.sm { background: #f1f4f9; }
.cn { font-weight: 600; color: #141a24; }
.muted { color: #6b7488; }
.pill-src { display: inline-flex; font-size: 11.5px; font-weight: 600; color: #475066; background: #f1f4f9; padding: 3px 9px; border-radius: 8px; }
.chip { display: inline-flex; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; }
.c-r1 { background: #e8f6ed; color: #16a34a; }
.c-r2 { background: #fdf4e3; color: #b8740a; }
.c-r3 { background: #fdecec; color: #ef4444; }
.statecell { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.note-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6b7488; }
</style>
