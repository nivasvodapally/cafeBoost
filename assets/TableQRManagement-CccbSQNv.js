import{r as n,j as e}from"./vendor-query-CN7mFQaT.js";import{u as Z,O as Q}from"./OwnerLayout-pQt75TSj.js";import{c as ee,u as c,L as S,C as p,B as l,D as L,e as U,f as z,g as E,h as se,o as ae,m as F,I as h}from"./index-DpX7Ebl1.js";import{B as I}from"./badge-CFJqGDg_.js";import{L as g}from"./label-ChMPZjbb.js";import{T as j,b as N,c as M,q as te,C as re}from"./qrService-Chno3Aqd.js";import{b as f}from"./browser-JP79f-a9.js";import{U as v}from"./users-DPy_jtJj.js";import{Q as ie}from"./qr-code-B-WUC0Uk.js";import{T as le}from"./trash-2-DaVoHmlc.js";import{M as ne}from"./map-pin-Ctlj96Wl.js";import{D as A}from"./download-C6pnpqls.js";import{P as B}from"./printer-Tdn9k4UI.js";import{C as ce}from"./check-CYGQc3W2.js";import{C as O}from"./copy-CCzH8tmb.js";import{R as oe}from"./refresh-cw-BkVBz_W-.js";import{C as de}from"./clock-Cl1Zb3at.js";import"./vendor-react-DjEwy9M9.js";import"./Logo-dW0Ocq-c.js";import"./ThemeToggle-D9jxaHbI.js";import"./popover-Bqe8T313.js";import"./vendor-ui-Cv70AIJ4.js";import"./vendor-supabase-Bmp-l0s8.js";import"./gift-C73pooFw.js";import"./vendor-date-BH2z48rh.js";import"./user-round-cog-DvOfJZhB.js";import"./log-out-bLgddWjS.js";import"./menu-DcXMXkCl.js";import"./vendor-charts-oJXyfEqo.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=ee("Eye",[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);function Be(){const{cafe:a,loading:P}=Z(),[o,q]=n.useState([]),[H,w]=n.useState(!0),[V,y]=n.useState(null),[W,C]=n.useState(!1),[i,X]=n.useState(null),[r,d]=n.useState({tableNumber:"",tableName:"",capacity:4,locationDescription:"",notes:""}),[T,k]=n.useState(!1),x=n.useCallback(async()=>{if(a!=null&&a.id){w(!0);try{const s=await j.getTables(a.id);q(s)}catch(s){console.error("Error fetching tables:",s),c.error("Failed to load tables")}finally{w(!1)}}},[a==null?void 0:a.id]);n.useEffect(()=>{a!=null&&a.id&&x()},[a==null?void 0:a.id,x]);const Y=async()=>{if(a!=null&&a.id){k(!0);try{await j.createTable({cafeId:a.id,tableNumber:r.tableNumber,tableName:r.tableName||void 0,capacity:r.capacity,locationDescription:r.locationDescription||void 0,notes:r.notes||void 0}),c.success(`Table ${r.tableNumber} created`),d({tableNumber:"",tableName:"",capacity:4,locationDescription:"",notes:""}),x()}catch(s){console.error("Error creating table:",s),c.error("Failed to create table")}finally{k(!1)}}},G=async(s,t)=>{try{await j.updateTableStatus({tableId:s,status:t}),c.success("Table status updated"),x()}catch(u){console.error("Error updating table status:",u),c.error("Failed to update status")}},J=async s=>{if(confirm("Are you sure you want to delete this table? This action cannot be undone."))try{await j.deleteTable(s),c.success("Table deleted"),x()}catch(t){console.error("Error deleting table:",t),c.error("Failed to delete table")}},b=s=>{const t=(a==null?void 0:a.slug)??"your-cafe";return`${te(t,"main")}/table/${encodeURIComponent(s.table_number)}`},D=async s=>{const t=b(s),u=await f.toDataURL(t,{width:1024,margin:2}),m=document.createElement("a");m.href=u,m.download=`${(a==null?void 0:a.slug)||"cafe"}-table-${s.table_number}-qr.png`,m.click(),c.success(`QR code for Table ${s.table_number} downloaded`)},_=async s=>{const t=b(s),u=await f.toDataURL(t,{width:720,margin:2}),m=window.open("","_blank");m&&m.document.write(`
      <html>
        <head>
          <title>${(a==null?void 0:a.name)??"Cafe"} — Table ${s.table_number} QR</title>
          <style>
            body {
              font-family: 'Helvetica Neue', system-ui, sans-serif;
              text-align: center;
              padding: 80px 24px;
              color: #1a1a1a;
              background: #faf7f2;
            }
            h1 {
              font-size: 42px;
              margin-bottom: 8px;
              letter-spacing: -.02em;
            }
            h2 {
              font-size: 18px;
              color: #7a6f5f;
              margin-top: 0;
              font-weight: 500;
            }
            img {
              margin: 36px auto;
              display: block;
              max-width: 380px;
              border-radius: 24px;
              box-shadow: 0 10px 40px rgba(0,0,0,.08);
            }
            p {
              color: #9a8e7d;
              font-size: 11px;
              font-family: 'SF Mono', monospace;
              word-break: break-all;
              margin-top: 20px;
            }
            .footer {
              margin-top: 48px;
              font-size: 13px;
              color: #7a6f5f;
              font-weight: 500;
            }
            .table-info {
              background: white;
              padding: 20px;
              border-radius: 12px;
              margin: 20px auto;
              max-width: 400px;
              text-align: left;
            }
          </style>
        </head>
        <body>
          <h1>${(a==null?void 0:a.name)??"Cafe"}</h1>
          <h2>Table ${s.table_number} • Scan to order</h2>
          <div class="table-info">
            <p><strong>Table:</strong> ${s.table_number} ${s.table_name?`(${s.table_name})`:""}</p>
            <p><strong>Capacity:</strong> ${s.capacity} persons</p>
            ${s.location_description?`<p><strong>Location:</strong> ${s.location_description}</p>`:""}
          </div>
          <img src="${u}" alt="QR"/>
          <p>${t}</p>
          <div class="footer">Powered by CafeBoost</div>
          <script>window.print()<\/script>
        </body>
      </html>
    `)},R=async s=>{const t=b(s);await navigator.clipboard.writeText(t),y(s.id),c.success("Table link copied to clipboard"),setTimeout(()=>y(null),1500)},$=s=>{switch(s){case"available":return"bg-success/15 text-success";case"occupied":return"bg-destructive/15 text-destructive";case"reserved":return"bg-warning/15 text-warning";case"cleaning":return"bg-blue-500/15 text-blue-500";case"out_of_service":return"bg-gray-500/15 text-gray-500";default:return"bg-muted text-muted-foreground"}},K=s=>{switch(s){case"available":return e.jsx(M,{className:"w-4 h-4"});case"occupied":return e.jsx(v,{className:"w-4 h-4"});case"reserved":return e.jsx(de,{className:"w-4 h-4"});case"cleaning":return e.jsx(oe,{className:"w-4 h-4"});case"out_of_service":return e.jsx(re,{className:"w-4 h-4"});default:return e.jsx(N,{className:"w-4 h-4"})}};return P||H?e.jsx(Q,{title:"Table QR Management",subtitle:"Managing table QR codes",children:e.jsx("div",{className:"flex items-center justify-center min-h-[60vh]",children:e.jsxs("div",{className:"text-center",children:[e.jsx(S,{className:"w-12 h-12 animate-spin text-primary mx-auto mb-4"}),e.jsx("p",{className:"text-muted-foreground",children:"Loading tables..."})]})})}):e.jsxs(Q,{title:"Table QR Management",subtitle:`${o.length} tables • ${(a==null?void 0:a.name)||"Your Cafe"}`,action:e.jsxs(L,{children:[e.jsx(ae,{asChild:!0,children:e.jsxs(l,{className:"gap-2",children:[e.jsx(F,{className:"w-4 h-4"}),"Add Table"]})}),e.jsxs(U,{children:[e.jsx(z,{children:e.jsx(E,{children:"Add New Table"})}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(g,{htmlFor:"tableNumber",children:"Table Number *"}),e.jsx(h,{id:"tableNumber",placeholder:"e.g., T1, 12, A5",value:r.tableNumber,onChange:s=>d({...r,tableNumber:s.target.value})})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(g,{htmlFor:"tableName",children:"Table Name (Optional)"}),e.jsx(h,{id:"tableName",placeholder:"e.g., Window View, Corner Booth",value:r.tableName,onChange:s=>d({...r,tableName:s.target.value})})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(g,{htmlFor:"capacity",children:"Capacity"}),e.jsx(h,{id:"capacity",type:"number",min:"1",max:"20",value:r.capacity,onChange:s=>d({...r,capacity:parseInt(s.target.value)||4})})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(g,{htmlFor:"location",children:"Location Description"}),e.jsx(h,{id:"location",placeholder:"e.g., Near entrance, Outdoor patio",value:r.locationDescription,onChange:s=>d({...r,locationDescription:s.target.value})})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(g,{htmlFor:"notes",children:"Notes"}),e.jsx(h,{id:"notes",placeholder:"Any special notes about this table",value:r.notes,onChange:s=>d({...r,notes:s.target.value})})]}),e.jsxs(l,{onClick:Y,disabled:T||!r.tableNumber,className:"w-full gap-2",children:[T?e.jsx(S,{className:"w-4 h-4 animate-spin"}):e.jsx(F,{className:"w-4 h-4"}),"Create Table"]})]})]})]}),children:[e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-4",children:[e.jsx(p,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Total Tables"}),e.jsx("p",{className:"text-2xl font-bold",children:o.length})]}),e.jsx(N,{className:"w-8 h-8 text-primary/30"})]})}),e.jsx(p,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Available"}),e.jsx("p",{className:"text-2xl font-bold",children:o.filter(s=>s.status==="available").length})]}),e.jsx(M,{className:"w-8 h-8 text-success/30"})]})}),e.jsx(p,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Occupied"}),e.jsx("p",{className:"text-2xl font-bold",children:o.filter(s=>s.status==="occupied").length})]}),e.jsx(v,{className:"w-8 h-8 text-destructive/30"})]})}),e.jsx(p,{className:"p-4",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"With QR"}),e.jsx("p",{className:"text-2xl font-bold",children:o.filter(s=>s.qr_code_url).length})]}),e.jsx(ie,{className:"w-8 h-8 text-blue-500/30"})]})})]}),e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",children:o.map(s=>e.jsxs(p,{className:"p-5 overflow-hidden",children:[e.jsxs("div",{className:"flex items-start justify-between mb-4",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(N,{className:"w-4 h-4 text-muted-foreground"}),e.jsxs("h3",{className:"font-semibold text-lg",children:["Table ",s.table_number,s.table_name&&e.jsxs("span",{className:"text-muted-foreground ml-2",children:["(",s.table_name,")"]})]})]}),e.jsxs(I,{className:`gap-1 ${$(s.status)}`,children:[K(s.status),s.status.charAt(0).toUpperCase()+s.status.slice(1)]})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(l,{variant:"ghost",size:"icon",onClick:()=>{X(s),C(!0)},title:"View QR",children:e.jsx(me,{className:"w-4 h-4"})}),e.jsx(l,{variant:"ghost",size:"icon",onClick:()=>J(s.id),title:"Delete table",children:e.jsx(le,{className:"w-4 h-4"})})]})]}),e.jsxs("div",{className:"space-y-3 mb-4",children:[e.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[e.jsx(v,{className:"w-4 h-4 text-muted-foreground"}),e.jsxs("span",{children:["Capacity: ",s.capacity," persons"]})]}),s.location_description&&e.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[e.jsx(ne,{className:"w-4 h-4 text-muted-foreground"}),e.jsx("span",{children:s.location_description})]}),s.notes&&e.jsx("p",{className:"text-sm text-muted-foreground",children:s.notes})]}),e.jsxs("div",{className:"flex flex-wrap gap-2",children:[e.jsxs(l,{variant:"outline",size:"sm",className:"flex-1 gap-2",onClick:()=>D(s),children:[e.jsx(A,{className:"w-3 h-3"}),"QR"]}),e.jsxs(l,{variant:"outline",size:"sm",className:"flex-1 gap-2",onClick:()=>_(s),children:[e.jsx(B,{className:"w-3 h-3"}),"Print"]}),e.jsxs(l,{variant:"outline",size:"sm",className:"flex-1 gap-2",onClick:()=>R(s),children:[V===s.id?e.jsx(ce,{className:"w-3 h-3"}):e.jsx(O,{className:"w-3 h-3"}),"Link"]})]}),e.jsxs("div",{className:"mt-4 pt-4 border-t",children:[e.jsx("p",{className:"text-sm text-muted-foreground mb-2",children:"Quick Status:"}),e.jsx("div",{className:"flex flex-wrap gap-1",children:["available","occupied","reserved","cleaning","out_of_service"].map(t=>e.jsx(l,{variant:"outline",size:"sm",className:`text-xs ${s.status===t?"bg-primary/10 border-primary":""}`,onClick:()=>G(s.id,t),children:t.charAt(0).toUpperCase()+t.slice(1)},t))})]})]},s.id))})]}),e.jsx(L,{open:W,onOpenChange:C,children:e.jsxs(U,{className:"max-w-md",children:[e.jsxs(z,{children:[e.jsx(E,{children:"Table QR Code"}),e.jsxs(se,{children:["Scan this QR code to access Table ",i==null?void 0:i.table_number]})]}),i&&e.jsxs("div",{className:"space-y-4",children:[e.jsx("div",{className:"bg-white p-6 rounded-lg border flex justify-center",children:e.jsx("img",{src:f.createDataURL(b(i),{width:256,margin:1}),alt:`QR Code for Table ${i.table_number}`,className:"w-64 h-64"})}),e.jsxs("div",{className:"space-y-2",children:[e.jsx("p",{className:"text-sm font-medium",children:"Table Details"}),e.jsxs("div",{className:"grid grid-cols-2 gap-2 text-sm",children:[e.jsx("div",{className:"text-muted-foreground",children:"Table Number:"}),e.jsx("div",{className:"font-medium",children:i.table_number}),e.jsx("div",{className:"text-muted-foreground",children:"Status:"}),e.jsx("div",{children:e.jsx(I,{className:$(i.status),children:i.status})}),e.jsx("div",{className:"text-muted-foreground",children:"Capacity:"}),e.jsxs("div",{className:"font-medium",children:[i.capacity," persons"]})]})]}),e.jsxs("div",{className:"flex gap-2",children:[e.jsxs(l,{variant:"outline",className:"flex-1 gap-2",onClick:()=>i&&D(i),children:[e.jsx(A,{className:"w-4 h-4"}),"Download"]}),e.jsxs(l,{variant:"outline",className:"flex-1 gap-2",onClick:()=>i&&_(i),children:[e.jsx(B,{className:"w-4 h-4"}),"Print"]}),e.jsxs(l,{variant:"outline",className:"flex-1 gap-2",onClick:()=>i&&R(i),children:[e.jsx(O,{className:"w-4 h-4"}),"Copy Link"]})]})]})]})})]})}export{Be as default};
