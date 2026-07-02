(()=>{var U=["\u5468\u65E5","\u5468\u4E00","\u5468\u4E8C","\u5468\u4E09","\u5468\u56DB","\u5468\u4E94","\u5468\u516D"],r=new Date,I="month",x={status:"",keyword:""},w=[];document.addEventListener("DOMContentLoaded",()=>{$(),G()});async function $(){var e;let t={};x.status&&(t.status=x.status),x.keyword&&(t.keyword=x.keyword);try{let a=await API.interviews.list({...t,pageSize:100});if(a.ok&&a.data){let n=a.data.items||a.data.list||a.data||[];w=n,M(n),H(r)}else w=[],M([]),(e=a.error)!=null&&e.message&&UI.showToast({type:"error",title:"\u52A0\u8F7D\u5931\u8D25",message:a.error.message})}catch(a){console.error("\u52A0\u8F7D\u9762\u8BD5\u5217\u8868\u5931\u8D25:",a),w=[],M([]),UI.showToast({type:"error",title:"\u52A0\u8F7D\u5931\u8D25",message:"\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"})}}function M(t){let e=document.getElementById("interviewTableBody");if(e){if(t.length===0){e.innerHTML=`
          <tr>
            <td colspan="9" class="px-4 py-12 text-center text-gray-400">
              \u6682\u65E0\u9762\u8BD5\u6570\u636E
            </td>
          </tr>
        `;return}e.innerHTML=t.map(a=>{let n=UI.parseDateTime(a.scheduled_at),c=C(n),u=F(a.type),i=O(a.type),m=L(a.status),g=_(a.status),o=`
          <button class="action-btn view-detail" data-action="view" data-id="${a.id}">\u67E5\u770B</button>
          <button class="action-btn reschedule" data-action="edit" data-id="${a.id}">\u7F16\u8F91</button>
        `;return a.status==="scheduled"&&(o+=`
            <button class="action-btn join-meeting" data-action="complete" data-id="${a.id}">\u5B8C\u6210</button>
            <button class="action-btn reschedule" data-action="cancel" data-id="${a.id}">\u53D6\u6D88</button>
          `),`
          <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3">
              <input type="checkbox" class="w-4 h-4 rounded border-gray-300 interview-checkbox" data-id="${a.id}">
            </td>
            <td class="px-4 py-3">
              <div class="font-medium text-gray-900">${f(a.candidate_name)}</div>
            </td>
            <td class="px-4 py-3 text-gray-600">${f(a.job_title)}</td>
            <td class="px-4 py-3 text-gray-600">${f(a.client_name||"-")}</td>
            <td class="px-4 py-3 text-gray-600">${f(a.interviewer||"-")}</td>
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">${c}</td>
            <td class="px-4 py-3">
              <span class="interview-method ${i}">${u}</span>
            </td>
            <td class="px-4 py-3">
              <span class="status-badge ${g}">${m}</span>
            </td>
            <td class="px-4 py-3">
              <div class="flex gap-1 flex-wrap">
                ${o}
              </div>
            </td>
          </tr>
        `}).join(""),W()}}function W(){document.querySelectorAll('[data-action="view"]').forEach(t=>{t.addEventListener("click",e=>{let a=e.currentTarget.dataset.id;Q(a)})}),document.querySelectorAll('[data-action="edit"]').forEach(t=>{t.addEventListener("click",e=>{let a=e.currentTarget.dataset.id;R(a)})}),document.querySelectorAll('[data-action="complete"]').forEach(t=>{t.addEventListener("click",e=>{let a=e.currentTarget.dataset.id;X(a)})}),document.querySelectorAll('[data-action="cancel"]').forEach(t=>{t.addEventListener("click",e=>{let a=e.currentTarget.dataset.id;Z(a)})})}function G(){let t=document.getElementById("scheduleInterviewBtn");t&&t.addEventListener("click",()=>{A()});let e=document.getElementById("searchInput");if(e){let c;e.addEventListener("input",()=>{clearTimeout(c),c=setTimeout(()=>{x.keyword=e.value.trim(),$()},300)})}let a=document.getElementById("statusFilter");a&&a.addEventListener("change",()=>{x.status=a.value,$()});let n=document.getElementById("selectAllCheckbox");n&&n.addEventListener("change",()=>{document.querySelectorAll(".interview-checkbox").forEach(c=>{c.checked=n.checked})}),z(),J()}function z(){let t=document.querySelectorAll(".view-toggle-btn"),e=document.getElementById("interviewList"),a=document.getElementById("calendarContainer");t.forEach(n=>{n.addEventListener("click",()=>{t.forEach(u=>u.classList.remove("active")),n.classList.add("active"),n.dataset.view==="calendar"?(e.style.display="none",a.classList.add("show"),H(r)):(e.style.display="block",a.classList.remove("show"))})})}function J(){let t=document.getElementById("prevMonth"),e=document.getElementById("nextMonth"),a=document.getElementById("todayBtn"),n=document.getElementById("currentMonth");function c(){let h=r.getFullYear(),p=r.getMonth()+1;n&&(n.textContent=`${h}\u5E74${p}\u6708`)}c(),t&&t.addEventListener("click",()=>{r.setMonth(r.getMonth()-1),c()}),e&&e.addEventListener("click",()=>{r.setMonth(r.getMonth()+1),c()}),a&&a.addEventListener("click",()=>{r=new Date,c()});let u=document.getElementById("calPrevMonth"),i=document.getElementById("calNextMonth"),m=document.getElementById("calTodayBtn"),g=document.getElementById("calCurrentMonth"),o=document.querySelectorAll(".cal-view-btn");function v(){let h=r.getFullYear(),p=r.getMonth()+1;g&&(g.textContent=`${h}\u5E74${p}\u6708`)}u&&u.addEventListener("click",()=>{I==="month"?(r.setMonth(r.getMonth()-1),D(r)):(r.setDate(r.getDate()-7),k(r)),v()}),i&&i.addEventListener("click",()=>{I==="month"?(r.setMonth(r.getMonth()+1),D(r)):(r.setDate(r.getDate()+7),k(r)),v()}),m&&m.addEventListener("click",()=>{r=new Date,v(),I==="month"?D(r):k(r)}),o.forEach(h=>{h.addEventListener("click",()=>{o.forEach(p=>p.classList.remove("active")),h.classList.add("active"),I=h.dataset.calView,I==="month"?(document.getElementById("monthView").style.display="block",document.getElementById("weekView").classList.remove("show"),D(r)):(document.getElementById("monthView").style.display="none",document.getElementById("weekView").classList.add("show"),k(r))})});let l=document.getElementById("dayDetailPanel"),s=document.createElement("div");s.className="day-detail-overlay",document.body.appendChild(s);let y=document.getElementById("dayDetailClose");y&&y.addEventListener("click",d),s&&s.addEventListener("click",d);function d(){l.classList.remove("show"),s.classList.remove("show")}window.closeDayDetail=d}function H(t){D(t)}function D(t){let e=document.getElementById("calendarDays");if(!e)return;let a=t.getFullYear(),n=t.getMonth(),c=new Date(a,n,1),u=new Date(a,n+1,0),i=c.getDay();i=i===0?7:i;let m=u.getDate(),g=new Date,o="";for(let s=1;s<i;s++){let y=new Date(a,n,1-(i-s));o+=b(y,!0)}for(let s=1;s<=m;s++){let y=new Date(a,n,s);o+=b(y,!1)}let l=Math.ceil((i-1+m)/7)*7-(i-1+m);for(let s=1;s<=l;s++){let y=new Date(a,n+1,s);o+=b(y,!0)}e.innerHTML=o,document.querySelectorAll(".calendar-day").forEach(s=>{s.addEventListener("click",y=>{let d=s.dataset.date;d&&K(d)})})}function b(t,e){let a=E(t),n=t.getDate(),c=new Date,u=t.getFullYear()===c.getFullYear()&&t.getMonth()===c.getMonth()&&t.getDate()===c.getDate(),m=w.filter(s=>{let y=UI.parseDateTime(s.scheduled_at);return E(y)===a}),g=2,o=m.slice(0,g),v=m.length-g,l="";return o.forEach(s=>{let y=UI.parseDateTime(s.scheduled_at),d=`${String(y.getHours()).padStart(2,"0")}:${String(y.getMinutes()).padStart(2,"0")}`,h=B(s.status);l+=`
          <div class="day-interview-dot ${h}" title="${s.candidate_name} - ${s.job_title}">
            <span>${d}</span>
            <span>${s.candidate_name}</span>
          </div>
        `}),v>0&&(l+=`<div class="day-more">+${v} \u66F4\u591A</div>`),`
        <div class="calendar-day ${e?"other-month":""} ${u?"today":""}" data-date="${a}">
          <div class="day-number">${n}</div>
          <div class="day-interviews">${l}</div>
        </div>
      `}function k(t){let e=document.getElementById("weekHeader"),a=document.getElementById("weekGrid");if(!e||!a)return;let n=t.getDay(),c=n===0?-6:1-n,u=new Date(t);u.setDate(t.getDate()+c);let i=[];for(let l=0;l<7;l++){let s=new Date(u);s.setDate(u.getDate()+l),i.push(s)}let m=new Date,g='<div class="week-header-time"></div>';i.forEach(l=>{let s=l.getFullYear()===m.getFullYear()&&l.getMonth()===m.getMonth()&&l.getDate()===m.getDate();g+=`
          <div class="week-header-day ${s?"today":""}">
            <div class="week-header-day-name">${U[l.getDay()]}</div>
            <div class="week-header-day-num">${l.getDate()}</div>
          </div>
        `}),e.innerHTML=g;let o='<div class="week-time-column">';for(let l=8;l<=20;l++)o+=`<div class="week-time-slot">${l}:00</div>`;o+="</div>";let v=w;i.forEach(l=>{let s=E(l);o+='<div class="week-day-column">';for(let d=8;d<=20;d++)o+='<div class="week-day-slot"></div>';v.filter(d=>{let h=UI.parseDateTime(d.scheduled_at);return E(h)===s}).forEach(d=>{let h=UI.parseDateTime(d.scheduled_at),p=h.getHours(),T=h.getMinutes(),q=p+1,P=T,V=((p-8)*60+T)/720*100,Y=((q-p)*60+(P-T))/720*100,N=B(d.status),j=`${String(p).padStart(2,"0")}:${String(T).padStart(2,"0")}`;o+=`
            <div class="week-interview-card ${N}"
                 style="top: ${V}%; height: ${Y}%;"
                 data-id="${d.id}">
              <div class="week-interview-time">${j}</div>
              <div class="week-interview-title">${f(d.job_title)}</div>
              <div class="week-interview-candidate">${f(d.candidate_name)}</div>
            </div>
          `}),o+="</div>"}),a.innerHTML=o,document.querySelectorAll(".week-interview-card").forEach(l=>{l.addEventListener("click",()=>{let s=l.dataset.id,y=w.find(d=>d.id===s);y&&UI.showToast({type:"info",title:y.job_title,message:`${y.candidate_name} - ${C(UI.parseDateTime(y.scheduled_at))}`})})})}function K(t){let e=document.getElementById("dayDetailPanel"),a=document.querySelector(".day-detail-overlay"),n=document.getElementById("dayDetailTitle"),c=document.getElementById("dayDetailContent");if(!e||!n||!c)return;let u=new Date(t),i=`${u.getMonth()+1}\u6708${u.getDate()}\u65E5 ${U[u.getDay()]}`;n.textContent=i;let g=w.filter(o=>{let v=UI.parseDateTime(o.scheduled_at);return E(v)===t});g.length===0?c.innerHTML='<div style="text-align: center; padding: 24px; color: var(--color-text-tertiary);">\u5F53\u65E5\u65E0\u9762\u8BD5\u5B89\u6392</div>':c.innerHTML=g.map(o=>{let v=UI.parseDateTime(o.scheduled_at),l=`${String(v.getHours()).padStart(2,"0")}:${String(v.getMinutes()).padStart(2,"0")}`,s=new Date(v.getTime()+3600*1e3),y=`${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`,d=B(o.status);return`
            <div class="day-detail-interview">
              <div class="day-detail-time">${l}-${y}</div>
              <div class="day-detail-info">
                <div class="day-detail-title">${f(o.job_title)}</div>
                <div class="day-detail-meta">${f(o.candidate_name)} \xB7 ${f(o.interviewer||"")}</div>
              </div>
              <div class="day-detail-status">
                <span class="status-badge ${d}">${L(o.status)}</span>
              </div>
            </div>
          `}).join(""),e.classList.add("show"),a&&a.classList.add("show")}function A(t=null){let e=!!t,a=e?"\u7F16\u8F91\u9762\u8BD5":"\u5B89\u6392\u9762\u8BD5",n=`
        <form id="interviewForm" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="form-group">
            <label class="form-label">\u5019\u9009\u4EBA\u59D3\u540D *</label>
            <input type="text" name="candidate_name" class="form-input" required value="${(t==null?void 0:t.candidate_name)||""}">
          </div>
          <div class="form-group">
            <label class="form-label">\u804C\u4F4D *</label>
            <input type="text" name="job_title" class="form-input" required value="${(t==null?void 0:t.job_title)||""}">
          </div>
          <div class="form-group">
            <label class="form-label">\u5BA2\u6237\u516C\u53F8</label>
            <input type="text" name="client_name" class="form-input" value="${(t==null?void 0:t.client_name)||""}">
          </div>
          <div class="form-group">
            <label class="form-label">\u9762\u8BD5\u5B98</label>
            <input type="text" name="interviewer" class="form-input" value="${(t==null?void 0:t.interviewer)||""}">
          </div>
          <div class="form-group">
            <label class="form-label">\u9762\u8BD5\u65F6\u95F4 *</label>
            <input type="datetime-local" name="scheduled_at" class="form-input" required value="${(t==null?void 0:t.scheduled_at)||""}">
          </div>
          <div class="form-group">
            <label class="form-label">\u9762\u8BD5\u65B9\u5F0F</label>
            <select name="type" class="form-input">
              <option value="video" ${(t==null?void 0:t.type)==="video"?"selected":""}>\u89C6\u9891\u9762\u8BD5</option>
              <option value="onsite" ${(t==null?void 0:t.type)==="onsite"?"selected":""}>\u73B0\u573A\u9762\u8BD5</option>
              <option value="phone" ${(t==null?void 0:t.type)==="phone"?"selected":""}>\u7535\u8BDD\u9762\u8BD5</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">\u5907\u6CE8</label>
            <textarea name="note" class="form-input" rows="3">${(t==null?void 0:t.note)||""}</textarea>
          </div>
        </form>
      `,c=UI.showModal({title:a,content:n,confirmText:e?"\u4FDD\u5B58":"\u521B\u5EFA",cancelText:"\u53D6\u6D88",showCancel:!0,width:"500px",onConfirm:async()=>{var g,o,v,l,s,y,d,h;let u=document.getElementById("interviewForm");if(!u)return;let i=new FormData(u),m={candidate_name:(g=i.get("candidate_name"))==null?void 0:g.toString().trim(),job_title:(o=i.get("job_title"))==null?void 0:o.toString().trim(),client_name:(v=i.get("client_name"))==null?void 0:v.toString().trim(),interviewer:(l=i.get("interviewer"))==null?void 0:l.toString().trim(),scheduled_at:(s=i.get("scheduled_at"))==null?void 0:s.toString(),type:(y=i.get("type"))==null?void 0:y.toString(),note:(d=i.get("note"))==null?void 0:d.toString().trim()};if(!m.candidate_name||!m.job_title||!m.scheduled_at){UI.showToast({type:"error",title:"\u8BF7\u586B\u5199\u5FC5\u586B\u9879",message:"\u5019\u9009\u4EBA\u59D3\u540D\u3001\u804C\u4F4D\u548C\u9762\u8BD5\u65F6\u95F4\u4E3A\u5FC5\u586B\u9879"});return}try{let p;if(e&&t?(p=await API.interviews.update(t.id,m),p.ok&&UI.showToast({type:"success",title:"\u66F4\u65B0\u6210\u529F",message:"\u9762\u8BD5\u4FE1\u606F\u5DF2\u66F4\u65B0"})):(p=await API.interviews.create(m),p.ok&&UI.showToast({type:"success",title:"\u521B\u5EFA\u6210\u529F",message:"\u9762\u8BD5\u5DF2\u5B89\u6392"})),!p.ok){UI.showToast({type:"error",title:"\u64CD\u4F5C\u5931\u8D25",message:((h=p.error)==null?void 0:h.message)||"\u8BF7\u7A0D\u540E\u91CD\u8BD5"});return}$(),c.close()}catch(p){console.error("\u64CD\u4F5C\u5931\u8D25:",p),UI.showToast({type:"error",title:"\u64CD\u4F5C\u5931\u8D25",message:"\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"})}}})}function S(t){return w.find(e=>e.id===t)}function Q(t){let e=S(t);if(!e){UI.showToast({type:"error",message:"\u9762\u8BD5\u8BB0\u5F55\u4E0D\u5B58\u5728"});return}let a=F(e.type),n=L(e.status),c=C(UI.parseDateTime(e.scheduled_at)),u=`
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u5019\u9009\u4EBA:</div>
            <div style="color: var(--color-text-primary); font-weight: 500;">${f(e.candidate_name)}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u804C\u4F4D:</div>
            <div style="color: var(--color-text-primary);">${f(e.job_title)}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u5BA2\u6237:</div>
            <div style="color: var(--color-text-primary);">${f(e.client_name||"-")}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u9762\u8BD5\u5B98:</div>
            <div style="color: var(--color-text-primary);">${f(e.interviewer||"-")}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u65F6\u95F4:</div>
            <div style="color: var(--color-text-primary);">${c}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u65B9\u5F0F:</div>
            <div style="color: var(--color-text-primary);">${a}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u72B6\u6001:</div>
            <div><span class="status-badge ${_(e.status)}">${n}</span></div>
          </div>
          ${e.note?`
          <div style="display: flex; gap: 12px;">
            <div style="color: var(--color-text-tertiary); width: 80px; flex-shrink: 0;">\u5907\u6CE8:</div>
            <div style="color: var(--color-text-primary);">${f(e.note)}</div>
          </div>
          `:""}
        </div>
      `;UI.showModal({title:"\u9762\u8BD5\u8BE6\u60C5",content:u,confirmText:"\u5173\u95ED",showCancel:!1,width:"500px"})}function R(t){let e=S(t);if(!e){UI.showToast({type:"error",message:"\u9762\u8BD5\u8BB0\u5F55\u4E0D\u5B58\u5728"});return}A(e)}async function X(t){let e=S(t);if(!e){UI.showToast({type:"error",message:"\u9762\u8BD5\u8BB0\u5F55\u4E0D\u5B58\u5728"});return}UI.showConfirm({title:"\u786E\u8BA4\u5B8C\u6210",content:`\u786E\u5B9A\u8981\u5C06 ${e.candidate_name} \u7684\u9762\u8BD5\u6807\u8BB0\u4E3A\u5DF2\u5B8C\u6210\u5417\uFF1F`,confirmText:"\u786E\u8BA4\u5B8C\u6210",cancelText:"\u53D6\u6D88",onConfirm:async()=>{var a;try{let n=await API.interviews.update(t,{status:"completed"});n.ok?(UI.showToast({type:"success",title:"\u5DF2\u5B8C\u6210",message:"\u9762\u8BD5\u5DF2\u6807\u8BB0\u4E3A\u5B8C\u6210"}),$()):UI.showToast({type:"error",title:"\u64CD\u4F5C\u5931\u8D25",message:((a=n.error)==null?void 0:a.message)||"\u8BF7\u7A0D\u540E\u91CD\u8BD5"})}catch(n){console.error("\u64CD\u4F5C\u5931\u8D25:",n),UI.showToast({type:"error",title:"\u64CD\u4F5C\u5931\u8D25",message:"\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"})}}})}async function Z(t){let e=S(t);if(!e){UI.showToast({type:"error",message:"\u9762\u8BD5\u8BB0\u5F55\u4E0D\u5B58\u5728"});return}UI.showConfirm({title:"\u786E\u8BA4\u53D6\u6D88",content:`\u786E\u5B9A\u8981\u53D6\u6D88 ${e.candidate_name} \u7684\u9762\u8BD5\u5417\uFF1F`,confirmText:"\u786E\u8BA4\u53D6\u6D88",cancelText:"\u53D6\u6D88",type:"warning",onConfirm:async()=>{var a;try{let n=await API.interviews.update(t,{status:"cancelled"});n.ok?(UI.showToast({type:"success",title:"\u5DF2\u53D6\u6D88",message:"\u9762\u8BD5\u5DF2\u53D6\u6D88"}),$()):UI.showToast({type:"error",title:"\u64CD\u4F5C\u5931\u8D25",message:((a=n.error)==null?void 0:a.message)||"\u8BF7\u7A0D\u540E\u91CD\u8BD5"})}catch(n){console.error("\u64CD\u4F5C\u5931\u8D25:",n),UI.showToast({type:"error",title:"\u64CD\u4F5C\u5931\u8D25",message:"\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"})}}})}function L(t){return{scheduled:"\u5DF2\u5B89\u6392",completed:"\u5DF2\u5B8C\u6210",cancelled:"\u5DF2\u53D6\u6D88"}[t]||t}function _(t){return{scheduled:"upcoming",completed:"completed",cancelled:"cancelled"}[t]||"pending"}function B(t){return _(t)}function F(t){return{video:"\u89C6\u9891",onsite:"\u73B0\u573A",phone:"\u7535\u8BDD"}[t]||t}function O(t){return{video:"online",onsite:"offline",phone:"phone"}[t]||"online"}function E(t){let e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${e}-${a}-${n}`}function C(t){let e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0"),c=String(t.getHours()).padStart(2,"0"),u=String(t.getMinutes()).padStart(2,"0");return`${e}-${a}-${n} ${c}:${u}`}function f(t){if(!t)return"";let e=document.createElement("div");return e.textContent=t,e.innerHTML}})();
