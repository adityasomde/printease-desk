import{a as e}from"./rolldown-runtime-BYbx6iT9.js";import{n as t,r as n}from"./vendor-motion-C9iDXck-.js";import{$ as r,B as i,E as a,H as o,T as s,lt as c,q as l,tt as u}from"./vendor-react-DUQ7Phay.js";import{Y as d}from"./index-CR0jbRv8.js";import{t as f}from"./Card-ZLRREQB7.js";import{t as p}from"./HubLocationCard-DCPMfBR5.js";import{t as m}from"./HubActiveOrdersManager-BsVBereZ.js";import{t as h}from"./Metric-ERgUvjJP.js";import{t as g}from"./HubAfterOrderSettingsCard-Dj69MtfV.js";var _=e(n(),1),v=t();function y(e){return String(e||``).toLowerCase().replace(/\s+/g,`_`)}function b(e){let t=String(e?.paymentStatus||e?.payment_status||``).toLowerCase();return t===`verified`||t===`collected`||t===`paid`||t.includes(`verif`)}var x=new Set([`collected`,`refund_requested`,`printing_failed`,`cancelled`]),S=`https://printhubdesi.vercel.app`;function C(){let e=typeof window<`u`?window.location.origin:``;return!e||e===`null`||e.startsWith(`file://`)||e.startsWith(`app://`)?S:e}async function w(e){e&&(window.printeaseDesktop?.openExternalUrl&&(await window.printeaseDesktop.openExternalUrl(e))?.success||window.open(e,`_blank`,`noopener,noreferrer`))}async function T(e,t){if(!e||window.printeaseDesktop?.downloadUrl&&(await window.printeaseDesktop.downloadUrl({url:e,fileName:t}))?.success)return;let n=document.createElement(`a`);n.href=e,n.download=t,n.rel=`noopener noreferrer`,document.body.appendChild(n),n.click(),n.remove()}var E={onlineAgents:0,availablePrinters:0,queuedJobs:0,failedJobsToday:0};function D({currentHub:e,hubOrders:t,updateOrderStatus:n,refreshOrders:S,onOrderSaved:D,onAfterOrderSettingsUpdate:O,navigate:k}){let[A,j]=(0,_.useState)([]),[M,N]=(0,_.useState)([]),[P,F]=(0,_.useState)([]),[ee,I]=(0,_.useState)(E),[L,R]=(0,_.useState)(!1),[te,z]=(0,_.useState)(``),[ne,re]=(0,_.useState)(``),[ie,ae]=(0,_.useState)(``),[oe,B]=(0,_.useState)(``),[V,H]=(0,_.useState)(!1),U=t||[],W=typeof window<`u`&&e?.code?`${C()}/upload?centre=${encodeURIComponent(e.code)}`:``,G=W?`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(W)}`:``,K=W?`https://api.qrserver.com/v1/create-qr-code/?size=900x900&data=${encodeURIComponent(W)}`:``,q=U.reduce((e,t)=>e+t.pages*t.copies,0),J=U.filter(b).reduce((e,t)=>e+Number(t.amount||0),0),Y=U.filter(e=>!x.has(y(e.status))).length,X=A[0]||null;M.find(e=>e.isDefault)||M[0],X&&(X.paused||X.status);async function Z(){R(!0),z(``);try{let e=await d();j(Array.isArray(e.agents)?e.agents:[]),N(Array.isArray(e.printers)?e.printers:[]),F(Array.isArray(e.printJobs)?e.printJobs:[]),I(e.analytics||E),B(new Date().toISOString())}catch(e){z(e.message||`Could not load agent status.`)}finally{R(!1)}}if((0,_.useEffect)(()=>{if(e?.id){Z();let e=setInterval(()=>{Z()},3e3),t=()=>{document.visibilityState===`visible`&&Z()};return window.addEventListener(`focus`,t),document.addEventListener(`visibilitychange`,t),()=>{clearInterval(e),window.removeEventListener(`focus`,t),document.removeEventListener(`visibilitychange`,t)}}},[e?.id]),!e)return(0,v.jsx)(f,{children:`Please login as print hub.`});async function Q(){if(W)try{await navigator.clipboard.writeText(W),H(!0),setTimeout(()=>H(!1),1800)}catch{z(`Could not copy centre upload link.`)}}async function $(){if(!K)return;let t=String(e.name||`PrintEase Centre`).replace(/[<>&"]/g,e=>({"<":`&lt;`,">":`&gt;`,"&":`&amp;`,'"':`&quot;`})[e]),n=`
      <!doctype html>
      <html>
        <head>
          <title>PrintEase Upload QR - ${t}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }
            main {
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 18px;
              padding: 36px;
              text-align: center;
            }
            h1 {
              margin: 0;
              font-size: 34px;
              line-height: 1.15;
            }
            p {
              margin: 0;
              font-size: 18px;
              color: #475569;
            }
            img {
              width: min(720px, 86vw);
              height: min(720px, 86vw);
              image-rendering: crisp-edges;
            }
            .code {
              display: inline-block;
              border: 2px solid #0f172a;
              border-radius: 14px;
              padding: 10px 18px;
              font-size: 24px;
              font-weight: 800;
              letter-spacing: 0;
            }
            .link {
              max-width: 760px;
              overflow-wrap: anywhere;
              font-size: 13px;
              color: #64748b;
            }
            @media print {
              main { padding: 18mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <main>
            <h1>${t}</h1>
            <p>Scan to upload documents directly to this print centre.</p>
            <div class="code">Centre Code: ${String(e.code||``).replace(/[<>&"]/g,e=>({"<":`&lt;`,">":`&gt;`,"&":`&amp;`,'"':`&quot;`})[e])}</div>
            <img src="${K}" alt="PrintEase upload QR" />
            <p class="link">${W.replace(/[<>&"]/g,e=>({"<":`&lt;`,">":`&gt;`,"&":`&amp;`,'"':`&quot;`})[e])}</p>
          </main>
          <script>
            window.addEventListener("load", () => {
              setTimeout(() => window.print(), 350);
            });
          <\/script>
        </body>
      </html>
    `;if(window.printeaseDesktop?.printHtml){let t=await window.printeaseDesktop.printHtml({title:`PrintEase Upload QR - ${e.name||e.code||`Centre`}`,html:n});t?.success||z(t?.message||`Could not print QR code.`);return}let r=window.open(``,`_blank`,`noopener,noreferrer,width=900,height=1100`);if(!r){z(`Allow popups to print the QR code.`);return}r.document.write(n),r.document.close()}return(0,v.jsxs)(`div`,{className:`space-y-6`,children:[(0,v.jsxs)(`div`,{className:`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`,children:[(0,v.jsxs)(`div`,{children:[(0,v.jsx)(`h2`,{className:`text-2xl sm:text-3xl font-bold`,children:`Print Hub Dashboard`}),(0,v.jsxs)(`p`,{className:`text-slate-600 text-sm sm:text-base`,children:[e.name,` · Code `,e.code]})]}),(0,v.jsx)(`button`,{onClick:()=>k(`hubPricing`),className:`rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white w-full sm:w-auto`,children:`Manage Pricing`})]}),(0,v.jsxs)(`div`,{className:`grid gap-4 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-4`,children:[(0,v.jsx)(h,{title:`Total Orders`,value:U.length,icon:(0,v.jsx)(l,{})}),(0,v.jsx)(h,{title:`Active Orders`,value:Y,icon:(0,v.jsx)(a,{})}),(0,v.jsx)(h,{title:`Pages Printed`,value:q,icon:(0,v.jsx)(c,{})}),(0,v.jsx)(h,{title:`Collected Amount`,value:`₹${J}`,icon:(0,v.jsx)(o,{})})]}),(0,v.jsx)(f,{children:(0,v.jsxs)(`div`,{className:`grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center`,children:[(0,v.jsxs)(`div`,{children:[(0,v.jsxs)(`div`,{className:`flex items-center gap-2`,children:[(0,v.jsx)(s,{size:22}),(0,v.jsx)(`h3`,{className:`text-xl font-bold`,children:`Customer Upload QR`})]}),(0,v.jsxs)(`p`,{className:`mt-2 text-sm text-slate-600`,children:[`Customers scan this QR to open the upload page with `,(0,v.jsx)(`b`,{children:e.name}),` selected automatically.`]}),(0,v.jsxs)(`div`,{className:`mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600`,children:[(0,v.jsx)(`span`,{className:`font-semibold text-slate-900`,children:`Link: `}),(0,v.jsx)(`span`,{className:`break-all`,children:W})]}),(0,v.jsxs)(`div`,{className:`mt-4 flex flex-wrap gap-2`,children:[(0,v.jsxs)(`button`,{type:`button`,onClick:Q,className:`inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white`,children:[(0,v.jsx)(u,{size:16}),V?`Copied`:`Copy Link`]}),(0,v.jsxs)(`button`,{type:`button`,onClick:()=>w(W).catch(()=>z(`Could not open upload page.`)),className:`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold`,children:[(0,v.jsx)(i,{size:16}),`Open Upload Page`]}),(0,v.jsxs)(`button`,{type:`button`,onClick:()=>T(K,`PrintEase-${e.code||`centre`}-upload-qr.png`).catch(()=>z(`Could not download QR code.`)),className:`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold`,children:[(0,v.jsx)(r,{size:16}),`Download QR`]}),(0,v.jsxs)(`button`,{type:`button`,onClick:$,className:`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold`,children:[(0,v.jsx)(a,{size:16}),`Print QR`]})]})]}),G&&(0,v.jsx)(`div`,{className:`mx-auto rounded-3xl border bg-white p-3 shadow-sm lg:mx-0`,children:(0,v.jsx)(`img`,{src:G,alt:`Upload QR for ${e.name}`,className:`h-44 w-44 rounded-2xl`})})]})}),(0,v.jsxs)(`div`,{className:`grid gap-6 grid-cols-1 md:grid-cols-2 max-w-4xl`,children:[(0,v.jsx)(p,{currentCentre:e}),(0,v.jsx)(g,{currentCentre:e,onSettingsUpdate:O})]}),(0,v.jsx)(m,{currentHub:e,hubOrders:t,updateOrderStatus:n,refreshOrders:S,onOrderSaved:D,navigate:k,agents:A,agentPrinters:M,printJobs:P,refreshAgentStatus:Z,agentLoading:L})]})}export{D as default};