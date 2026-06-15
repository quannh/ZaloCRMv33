<!--
  LeadPoolDashboardPage — 4 màn PRO gộp 1 trang (admin). Phase Lead Pool FIFO 2026-06-15.
  Theo mockup: Dashboard buồng lái + Điều phối sale + Nguồn lead + Chất lượng lead.
  1 API /lead-pool/admin-dashboard. office-hours đề xuất, Anh duyệt.
-->
<template>
  <div class="lpd" v-if="d">
    <!-- Thanh tiến độ vòng tua -->
    <div class="lpd-round">
      <div class="lpd-round-ic"><v-icon size="22" icon="mdi-rotate-right" /></div>
      <div class="lpd-round-main">
        <div class="lpd-round-top">
          <span class="lpd-round-num">{{ d.round.distributedThisRound }} / {{ d.round.poolTotal }}</span>
          <span class="lpd-round-lab">lead đã chia trong vòng tua hiện tại · còn {{ d.round.remaining }} lead chưa ai bóc</span>
        </div>
        <div class="lpd-round-track"><i :style="{ width: roundPct + '%' }"></i></div>
      </div>
      <div class="lpd-round-side"><div class="s-v">Vòng #{{ d.round.currentRound }}</div></div>
    </div>

    <!-- ── 1. Dashboard buồng lái: KPI ── -->
    <div class="lpd-kpis">
      <div class="kpi"><div class="ki">Pool chờ chia</div><div class="kv">{{ d.round.remaining }}</div><div class="ks">lead chưa ai bóc vòng này</div></div>
      <div class="kpi k-amber"><div class="ki">Đang chăm</div><div class="kv">{{ d.today.pendingActive }}</div><div class="ks">đã chia, chờ ghi note</div></div>
      <div class="kpi k-green"><div class="ki">Chia hôm nay</div><div class="kv">{{ d.today.requested }}</div><div class="ks">{{ d.today.notePct }}% đã ghi note ({{ d.today.noted }})</div><div class="kbar"><i :style="{ width: d.today.notePct + '%' }"></i></div></div>
      <div class="kpi k-red"><div class="ki">Trả lại hôm nay</div><div class="kv">{{ d.today.returnedTotal }}</div><div class="ks">{{ d.today.returnedAuto }} tự động · {{ d.today.returnedManual }} sale trả</div></div>
    </div>

    <div class="lpd-cols">
      <!-- ── 2. Điều phối sale ── -->
      <section class="panel lpd-span2">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-account-group-outline" /> Điều phối sale — Hôm nay</span></div>
        <table class="tbl">
          <thead><tr><th>Sale</th><th>Nhận</th><th>Đã note</th><th>Chưa note</th><th>Trả lại</th><th>Tỉ lệ note</th></tr></thead>
          <tbody>
            <tr v-for="s in d.salePerformance" :key="s.userId" :class="{ 'warn-row': s.notePct < 50 && s.received > 0 }">
              <td><div class="cust">
                <img v-if="s.avatarUrl" class="av sm" :src="s.avatarUrl" alt="" @error="onImgErr" />
                <span v-else class="av sm">{{ initials(s.fullName) }}</span>
                <span class="cn">{{ s.fullName || '—' }}</span>
              </div></td>
              <td class="num">{{ s.received }}</td>
              <td class="num" style="color:#0a7a47">{{ s.noted }}</td>
              <td class="num" :style="{ color: s.pending > 0 ? '#b8740a' : '' }">{{ s.pending }}</td>
              <td class="num" :style="{ color: s.returned > 2 ? '#c0291f' : '' }">{{ s.returned }}</td>
              <td><div class="flex-c"><div class="sbar"><i :style="{ width: s.notePct + '%', background: barColor(s.notePct) }"></i></div><span class="num">{{ s.notePct }}%</span></div></td>
            </tr>
            <tr v-if="d.salePerformance.length === 0"><td colspan="6" class="muted center">Hôm nay chưa sale nào nhận lead.</td></tr>
          </tbody>
        </table>
      </section>

      <!-- Lead kẹt đáy -->
      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-alert-outline" /> Lead kẹt đáy</span></div>
        <div class="panel-b">
          <p class="t-cap">Chia ≥ {{ d.stuckThreshold }} lần chưa chốt — có thể SĐT rác, cân nhắc xoá khỏi pool.</p>
          <div v-for="s in d.stuckLeads" :key="s.id" class="stuck-row">
            <span class="cn">{{ s.name || '(không tên)' }}</span>
            <span class="num muted">{{ s.phone || '—' }}</span>
            <span class="chip c-r3">{{ s.pooledCount }} lần</span>
          </div>
          <div v-if="d.stuckLeads.length === 0" class="muted center" style="padding:14px">Không có lead kẹt đáy. Pool khỏe.</div>
        </div>
      </section>

      <!-- ── 3. Nguồn lead ── -->
      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-folder-multiple-outline" /> Nguồn lead (7 ngày)</span></div>
        <div class="panel-b">
          <div v-for="b in d.sources.breakdown" :key="b.source" class="src-row">
            <div class="flex-c" style="justify-content:space-between"><span class="t-sub">{{ b.label }}</span><span class="num">{{ b.count }}</span></div>
          </div>
          <div class="divider"></div>
          <p class="t-cap" style="margin-bottom:6px">Tệp chia pool (còn lại):</p>
          <div v-for="l in d.sources.lists" :key="l.id" class="src-row">
            <div class="flex-c" style="justify-content:space-between">
              <span class="t-sub">{{ l.name }}</span>
              <span class="chip" :class="l.remaining < 50 ? 'c-r3' : 'c-r1'">{{ l.remaining }} lead</span>
            </div>
          </div>
          <div v-if="d.sources.lists.length === 0" class="muted">Chưa có tệp nào bật chia pool.</div>
        </div>
      </section>

      <!-- ── 4. Chất lượng lead ── -->
      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-shield-check-outline" /> Chất lượng lead (14 ngày)</span></div>
        <div class="panel-b">
          <div class="quality-big">
            <div class="qb-v">{{ 100 - d.quality.returnRate }}%</div>
            <div class="qb-l">lead chăm tốt (không bị trả lại)</div>
          </div>
          <div class="flex-c" style="justify-content:space-between;margin-top:10px"><span class="t-sub">Bị trả lại</span><span class="chip c-r3">{{ d.quality.returnRate }}% ({{ d.quality.returnedCount }})</span></div>
          <div class="flex-c" style="justify-content:space-between;margin-top:6px"><span class="t-sub">Tự động (quá hạn note)</span><span class="num">{{ d.quality.auto }}</span></div>
          <div class="flex-c" style="justify-content:space-between;margin-top:6px"><span class="t-sub">Sale trả tay</span><span class="num">{{ d.quality.manual }}</span></div>
          <p class="t-cap" style="margin-top:10px">Tổng đã chia 14 ngày: {{ d.quality.distributed14d }}</p>
        </div>
      </section>
    </div>
  </div>
  <div v-else class="lpd-loading">Đang tải tổng quan…</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLeadPool } from '@/composables/use-lead-pool';

const { fetchAdminDashboard } = useLeadPool();
const d = ref<any>(null);

const roundPct = computed(() => {
  if (!d.value || !d.value.round.poolTotal) return 0;
  return Math.min(100, Math.round((d.value.round.distributedThisRound / d.value.round.poolTotal) * 100));
});

function initials(name: string | null) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return (p[0]?.[0] ?? '') + (p[p.length - 1]?.[0] ?? '');
}
function barColor(pct: number) {
  if (pct >= 80) return '#12b76a';
  if (pct >= 50) return '#f5a524';
  return '#f04438';
}
function onImgErr(e: Event) { (e.target as HTMLImageElement).style.display = 'none'; }

onMounted(async () => { d.value = await fetchAdminDashboard(); });
</script>

<style scoped>
.lpd { display: flex; flex-direction: column; gap: 16px; }
.lpd-loading { padding: 40px; text-align: center; color: #6b7488; }
.lpd-round { display: flex; align-items: center; gap: 20px; padding: 16px 18px; border-radius: 14px;
  background: linear-gradient(135deg, #0e455c, #082b3a); color: #fff; box-shadow: 0 4px 12px rgba(20,26,36,.12); }
.lpd-round-ic { width: 42px; height: 42px; border-radius: 11px; background: rgba(91,184,229,.18);
  border: 1px solid rgba(91,184,229,.35); color: #5bb8e5; display: flex; align-items: center; justify-content: center; flex: none; }
.lpd-round-main { flex: 1; }
.lpd-round-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.lpd-round-num { font-family: 'Roboto Mono', monospace; font-size: 22px; font-weight: 800; }
.lpd-round-lab { font-size: 12.5px; color: #cfe2ec; }
.lpd-round-track { height: 9px; border-radius: 5px; background: rgba(255,255,255,.12); overflow: hidden; }
.lpd-round-track i { display: block; height: 100%; background: linear-gradient(90deg, #5bb8e5, #7fd0f0); border-radius: 5px; transition: width .4s; }
.lpd-round-side .s-v { font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 800; color: #5bb8e5; }

.lpd-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.kpi { background: #fff; border: 1px solid #e7eaf0; border-radius: 14px; padding: 15px 16px; position: relative; overflow: hidden; }
.kpi::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #1786be; }
.kpi.k-amber::before { background: #f5a524; }
.kpi.k-green::before { background: #12b76a; }
.kpi.k-red::before { background: #f04438; }
.kpi .ki { font-size: 12px; font-weight: 600; color: #6b7488; margin-bottom: 8px; }
.kpi .kv { font-size: 27px; font-weight: 800; font-family: 'Roboto Mono', monospace; }
.kpi .ks { font-size: 11.5px; color: #6b7488; margin-top: 3px; }
.kpi .kbar { height: 5px; border-radius: 3px; background: #f1f4f9; margin-top: 9px; overflow: hidden; }
.kpi .kbar i { display: block; height: 100%; background: #12b76a; border-radius: 3px; }

.lpd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.lpd-span2 { grid-column: span 2; }
.panel { background: #fff; border: 1px solid #e7eaf0; border-radius: 14px; overflow: hidden; }
.panel-h { padding: 13px 16px; border-bottom: 1px solid #eef1f6; }
.panel-h .ph-t { font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; }
.panel-b { padding: 14px 16px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tbl thead th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #97a0b3; padding: 9px 12px; border-bottom: 1px solid #e7eaf0; }
.tbl tbody td { padding: 9px 12px; border-bottom: 1px solid #eef1f6; vertical-align: middle; }
.tbl tbody tr.warn-row { background: #fdf3e2; }
.num { font-family: 'Roboto Mono', monospace; font-variant-numeric: tabular-nums; }
.cust { display: flex; align-items: center; gap: 8px; }
.av.sm { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg,#4fb0e0,#0f6fa0); color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; object-fit: cover; }
img.av.sm { background: #f1f4f9; }
.cn { font-weight: 600; color: #141a24; }
.muted { color: #6b7488; }
.center { text-align: center; }
.flex-c { display: flex; align-items: center; gap: 8px; }
.sbar { height: 7px; border-radius: 4px; background: #f1f4f9; overflow: hidden; width: 100px; }
.sbar i { display: block; height: 100%; border-radius: 4px; }
.t-sub { font-size: 12.5px; color: #475066; }
.t-cap { font-size: 11.5px; color: #6b7488; }
.chip { display: inline-flex; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; }
.c-r1 { background: #e8f6ed; color: #16a34a; }
.c-r3 { background: #fdecec; color: #ef4444; }
.stuck-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid #eef1f6; font-size: 12.5px; }
.stuck-row .cn { flex: 1; }
.src-row { padding: 6px 0; }
.divider { height: 1px; background: #eef1f6; margin: 12px 0; }
.quality-big { text-align: center; padding: 10px 0; }
.quality-big .qb-v { font-size: 36px; font-weight: 800; color: #12b76a; font-family: 'Roboto Mono', monospace; }
.quality-big .qb-l { font-size: 12px; color: #6b7488; }
</style>
