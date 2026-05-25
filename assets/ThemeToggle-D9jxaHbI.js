import{r as a,j as e}from"./vendor-query-CN7mFQaT.js";import{c as h,y as m,B as s}from"./index-DpX7Ebl1.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=h("Moon",[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const o=h("Sun",[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]]);function u(){const{theme:l,setTheme:r,resolvedTheme:c}=m(),[n,i]=a.useState(!1);if(a.useEffect(()=>{i(!0)},[]),!n)return e.jsx(s,{variant:"ghost",size:"icon",disabled:!0,"aria-label":"Toggle theme",children:e.jsx(o,{className:"h-4 w-4"})});const t=c==="dark";return e.jsx(s,{variant:"ghost",size:"icon",onClick:()=>r(t?"light":"dark"),"aria-label":t?"Switch to light mode":"Switch to dark mode",children:t?e.jsx(o,{className:"h-4 w-4"}):e.jsx(d,{className:"h-4 w-4"})})}export{u as T};
