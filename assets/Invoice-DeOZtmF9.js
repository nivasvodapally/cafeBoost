import{r as y,u as v,j as e}from"./vendor-query-CN7mFQaT.js";import{e as w,L as x}from"./vendor-react-DjEwy9M9.js";import{L as _,B as c,C as k,q as C,s as l}from"./index-DpX7Ebl1.js";import{C as p}from"./clock-Cl1Zb3at.js";import{A as T}from"./arrow-left-1BooCOwj.js";import{P as S}from"./printer-Tdn9k4UI.js";import"./vendor-ui-Cv70AIJ4.js";import"./vendor-supabase-Bmp-l0s8.js";import"./vendor-charts-oJXyfEqo.js";function E(){const{id:o}=w();y.useEffect(()=>{document.title="Invoice — CafeBoost"},[]);const{data:n,isLoading:u}=v({queryKey:["invoice",o],queryFn:async()=>{if(!o)return null;const{data:r}=await l.from("orders").select("*").eq("id",o).maybeSingle();if(!r)return null;const[{data:g},{data:N}]=await Promise.all([l.from("order_items").select("id, name, price, quantity").eq("order_id",o),l.from("cafes").select("name, address, city, phone, email, currency, tax_rate, gstin").eq("id",r.cafe_id).maybeSingle()]);return{order:r,items:g??[],cafe:N??null}},enabled:!!o}),s=(n==null?void 0:n.order)??null,h=(n==null?void 0:n.items)??[],t=(n==null?void 0:n.cafe)??null;if(u)return e.jsx("div",{className:"min-h-screen grid place-items-center",children:e.jsx(_,{className:"w-6 h-6 animate-spin"})});if(!s)return e.jsx("div",{className:"min-h-screen grid place-items-center text-muted-foreground",children:"Invoice not found."});if(s.payment_status!=="paid")return e.jsx("div",{className:"min-h-screen grid place-items-center text-center px-4",children:e.jsxs("div",{children:[e.jsx(p,{className:"w-12 h-12 text-muted-foreground/30 mx-auto mb-4"}),e.jsx("p",{className:"font-display text-xl font-bold",children:"Invoice not available yet"}),e.jsx("p",{className:"text-sm text-muted-foreground mt-2",children:"Your invoice will be available here once payment is confirmed."}),e.jsx(x,{to:"/app/orders",children:e.jsx(c,{variant:"outline",className:"mt-6",children:"Back to orders"})})]})});const b=`
@media print {
  @page { margin: 12mm 10mm; }
  html, body {
    background: #fff !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Hide everything outside the invoice card */
  body > *:not(#invoice-print-area),
  nav, header, footer, .sidebar,
  button:not(#print-trigger), .btn, a[class*="Button"] {
    display: none !important;
  }
  #invoice-print-area {
    display: block !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    border: none !important;
  }
  #invoice-card {
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }
  /* Typography — ensure black text on white, keep print-friendly colours */
  #invoice-card * {
    color: #000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  /* Keep background colours for badges and accent elements */
  #invoice-card [class*="bg-success"],
  #invoice-card [class*="bg-accent-soft"] {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Table borders */
  #invoice-card table th,
  #invoice-card table td,
  #invoice-card [class*="border"] {
    border-color: #ccc !important;
  }
  /* Page-break safety */
  #invoice-card table,
  #invoice-card tbody tr,
  #invoice-card footer {
    page-break-inside: avoid;
  }
  /* Links — no underline decoration on print */
  #invoice-card a {
    text-decoration: none !important;
  }
}
`,j=(t==null?void 0:t.currency)??"INR",a=r=>new Intl.NumberFormat(void 0,{style:"currency",currency:j}).format(Number(r)||0),d=s.payment_status==="paid",i=Math.min(Number(s.tax_amount),Number(s.subtotal)),m=Number(s.subtotal)+i-Number(s.discount_amount||0),f=Math.abs(Number(s.total_amount)-m)<1?Number(s.total_amount):m;return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:b}),e.jsx("div",{className:"min-h-screen bg-muted/30 py-8 print:bg-white print:py-0",id:"invoice-print-area",children:e.jsxs("div",{className:"max-w-2xl mx-auto px-4",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4 print:hidden",children:[e.jsx(x,{to:"/app/orders",children:e.jsxs(c,{variant:"ghost",size:"sm",children:[e.jsx(T,{className:"w-4 h-4 mr-1"})," Back to orders"]})}),e.jsxs(c,{variant:"hero",size:"sm",onClick:()=>window.print(),children:[e.jsx(S,{className:"w-4 h-4 mr-2"})," Print invoice"]})]}),e.jsxs(k,{className:"p-8 print:shadow-none print:border-0",id:"invoice-card",children:[e.jsxs("header",{className:"flex items-start justify-between gap-4 pb-6 border-b border-border",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"font-display text-2xl font-bold",children:(t==null?void 0:t.name)??"Cafe"}),(t==null?void 0:t.address)&&e.jsxs("p",{className:"text-xs text-muted-foreground mt-1",children:[t.address,t.city?`, ${t.city}`:""]}),(t==null?void 0:t.phone)&&e.jsxs("p",{className:"text-xs text-muted-foreground",children:["📞 ",t.phone]}),(t==null?void 0:t.gstin)&&e.jsxs("p",{className:"text-xs text-muted-foreground",children:["GSTIN: ",t.gstin]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("p",{className:"text-xs uppercase tracking-wider text-muted-foreground font-semibold",children:t!=null&&t.gstin?"Tax Invoice":"Receipt"}),e.jsx("p",{className:"font-mono text-sm font-bold",children:s.invoice_number??`#${s.id.slice(0,8).toUpperCase()}`}),e.jsx("p",{className:"text-xs text-muted-foreground mt-1",children:new Date(s.created_at).toLocaleString()}),e.jsxs("span",{className:`inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold mt-2 px-2 py-1 rounded-full ${d?"bg-success/15 text-success":"bg-muted text-muted-foreground"}`,children:[d?e.jsx(C,{className:"w-3 h-3"}):e.jsx(p,{className:"w-3 h-3"}),s.payment_status]})]})]}),e.jsxs("section",{className:"grid sm:grid-cols-2 gap-6 py-6 border-b border-border text-sm",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1",children:"Billed to"}),e.jsx("p",{className:"font-medium",children:s.customer_name}),s.customer_phone&&e.jsx("p",{className:"text-muted-foreground text-xs",children:s.customer_phone})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1",children:"Order info"}),e.jsxs("p",{className:"text-xs text-muted-foreground",children:["Source: ",e.jsx("span",{className:"text-foreground",children:s.source})]}),s.table_no&&e.jsxs("p",{className:"text-xs text-muted-foreground",children:["Table: ",e.jsx("span",{className:"text-foreground",children:s.table_no})]}),(t==null?void 0:t.gstin)&&e.jsxs("p",{className:"text-xs text-muted-foreground",children:["SAC Code: ",e.jsx("span",{className:"text-foreground",children:"996331"})]}),e.jsxs("p",{className:"text-xs text-muted-foreground",children:["Status: ",e.jsx("span",{className:"text-foreground",children:s.status})]}),e.jsxs("p",{className:"text-xs text-muted-foreground",children:["Payment: ",e.jsx("span",{className:"text-foreground capitalize",children:s.payment_method==="upi"?"UPI":s.payment_method==="cash"?"Cash":"Pending"})]})]})]}),e.jsxs("table",{className:"w-full text-sm my-6",children:[e.jsx("thead",{children:e.jsxs("tr",{className:"text-xs uppercase tracking-wider text-muted-foreground",children:[e.jsx("th",{className:"text-left py-2 font-semibold",children:"Item"}),e.jsx("th",{className:"text-center py-2 font-semibold w-16",children:"Qty"}),e.jsx("th",{className:"text-right py-2 font-semibold w-24",children:"Price"}),e.jsx("th",{className:"text-right py-2 font-semibold w-28",children:"Total"})]})}),e.jsx("tbody",{children:h.map(r=>e.jsxs("tr",{className:"border-t border-border",children:[e.jsx("td",{className:"py-2.5",children:r.name}),e.jsx("td",{className:"text-center py-2.5",children:r.quantity}),e.jsx("td",{className:"text-right py-2.5",children:a(Number(r.price))}),e.jsx("td",{className:"text-right py-2.5 font-medium",children:a(Number(r.price)*r.quantity)})]},r.id))})]}),e.jsxs("div",{className:"ml-auto w-full sm:w-72 space-y-1 text-sm",children:[e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-muted-foreground",children:"Subtotal"}),e.jsx("span",{children:a(Number(s.subtotal))})]}),i>0&&(t!=null&&t.gstin&&(t!=null&&t.tax_rate)?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex justify-between text-xs",children:[e.jsxs("span",{className:"text-muted-foreground",children:["CGST @ ",(t.tax_rate/2).toFixed(1),"%"]}),e.jsx("span",{children:a(i/2)})]}),e.jsxs("div",{className:"flex justify-between text-xs",children:[e.jsxs("span",{className:"text-muted-foreground",children:["SGST @ ",(t.tax_rate/2).toFixed(1),"%"]}),e.jsx("span",{children:a(i/2)})]})]}):e.jsxs("div",{className:"flex justify-between text-xs",children:[e.jsx("span",{className:"text-muted-foreground",children:"Taxes & charges"}),e.jsx("span",{children:a(i)})]})),Number(s.discount_amount)>0&&e.jsxs("div",{className:"flex justify-between text-xs text-success",children:[e.jsx("span",{children:"Discount"}),e.jsxs("span",{children:["− ",a(Number(s.discount_amount))]})]}),e.jsxs("div",{className:"flex justify-between font-bold text-base pt-2 border-t border-border mt-2",children:[e.jsx("span",{children:"Total"}),e.jsx("span",{children:a(f)})]}),(t==null?void 0:t.gstin)&&e.jsxs("p",{className:"text-[11px] text-muted-foreground mt-1 font-mono",children:["GSTIN: ",t.gstin]}),s.earned_points>0&&e.jsxs("div",{className:"flex justify-between text-xs text-accent-foreground bg-accent-soft px-2 py-1.5 rounded mt-3",children:[e.jsxs("span",{children:["Loyalty points ",d?"earned":"pending"]}),e.jsxs("span",{className:"font-bold",children:["+",s.earned_points," pts"]})]})]}),s.notes&&e.jsxs("div",{className:"mt-6 pt-4 border-t border-border text-xs",children:[e.jsx("p",{className:"text-muted-foreground uppercase tracking-wider font-semibold mb-1",children:"Notes"}),e.jsx("p",{className:"whitespace-pre-wrap",children:s.notes})]}),e.jsxs("footer",{className:"mt-8 pt-4 border-t border-border text-center text-[11px] text-muted-foreground",children:["Thank you for visiting ",(t==null?void 0:t.name)??"us"," · Powered by CafeBoost"]})]})]})})]})}export{E as default};
