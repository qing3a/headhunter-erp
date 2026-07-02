(()=>{(!window.Auth||!Auth.isLoggedIn())&&(window.Auth?Auth.requireLogin():location.replace("../pages/login.html"));function s(e){return e?String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]):""}function i(e){return e==="high"?"background-color: var(--state-error-light, #FEE2E2); color: var(--state-error, #EF4444);":e==="medium"?"background-color: var(--state-warning-light, #FEF3C7); color: var(--state-warning, #F59E0B);":"background-color: var(--color-bg-tertiary, #F1F5F9); color: var(--color-text-secondary, #475569);"}function l(e){return e==="high"?"\u7D27\u6025":e==="medium"?"\u91CD\u8981":"\u4E00\u822C"}function n(e){let t=e.filter(r=>r.status!=="completed").slice(0,6);if(t.length===0){document.getElementById("taskList").innerHTML=`
          <div class="task-card rounded-lg bg-white border pl-5" style="border-color: var(--color-border, #E2E8F0); padding: 14px 16px 14px 20px;">
            <p class="text-sm" style="color: var(--color-text-secondary, #475569);">\u6682\u65E0\u5F85\u529E\u4EFB\u52A1</p>
          </div>`;return}let o=t.map(r=>`
        <div class="task-card rounded-lg bg-white border pl-5" style="border-color: var(--color-border, #E2E8F0); padding: 14px 16px 14px 20px;">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium" style="color: var(--color-text-primary, #0F172A);">${s(r.title)}</p>
              <p class="text-xs mt-1" style="color: var(--color-text-secondary, #475569);">${s(r.description||r.desc||"")}</p>
            </div>
            <span class="inline-flex items-center flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium" style="${i(r.priority)}">${l(r.priority)}</span>
          </div>
        </div>`).join("");document.getElementById("taskList").innerHTML=o}function c(e){let t={total_candidates:e.total_candidates,open_jobs:e.total_jobs,total_recommendations:e.total_clients!==void 0?e.total_clients:e.total_recommendations,interviews_count:e.interviews_count,pending_tasks:e.pending_tasks,completed_tasks:e.completed_tasks};document.querySelectorAll("[data-kpi]").forEach(o=>{let r=o.dataset.kpi,a=t[r]!==void 0?t[r]:e[r];a!==void 0&&(o.textContent=typeof a=="number"?a.toLocaleString():a)}),document.querySelectorAll("[data-kpi-sub]").forEach(o=>{let r=o.dataset.kpiSub;e[r]!==void 0&&(o.textContent=`\u4ECA\u65E5\u65B0\u589E ${e[r]}`)})}function d(){document.getElementById("recentRecommendations").innerHTML=`
        <div class="timeline-item flex gap-3">
          <div class="flex flex-col items-center flex-shrink-0 pt-0.5">
            <div class="w-3 h-3 rounded-full" style="background-color: var(--color-border, #E2E8F0);"></div>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs mb-1" style="color: var(--color-text-tertiary, #94A3B8);">\u6682\u65E0\u63A8\u8350</p>
            <p class="text-sm" style="color: var(--color-text-secondary, #475569);">\u8FD8\u6CA1\u6709\u63A8\u8350\u8BB0\u5F55</p>
          </div>
        </div>`}async function p(){var e;try{let t=await API.tasks.list({pageSize:20});if(t.ok&&t.data){let o=t.data.items||t.data.list||t.data||[];n(o)}else n([]),(e=t.error)!=null&&e.message&&UI.showToast({type:"error",title:"\u52A0\u8F7D\u5931\u8D25",message:t.error.message})}catch(t){console.warn("\u52A0\u8F7D\u4EFB\u52A1\u5931\u8D25:",t),n([]),UI.showToast({type:"error",title:"\u52A0\u8F7D\u5931\u8D25",message:"\u65E0\u6CD5\u83B7\u53D6\u5F85\u529E\u4EFB\u52A1"})}}async function m(){var e;p();try{let t=await API.dashboard.getStats();t.ok&&t.data?c(t.data):(e=t.error)!=null&&e.message&&UI.showToast({type:"error",title:"\u52A0\u8F7D\u5931\u8D25",message:t.error.message})}catch(t){console.warn("\u52A0\u8F7D KPI \u5931\u8D25:",t),UI.showToast({type:"error",title:"\u52A0\u8F7D\u5931\u8D25",message:"\u65E0\u6CD5\u83B7\u53D6\u7EDF\u8BA1\u6570\u636E"})}d()}m();})();
