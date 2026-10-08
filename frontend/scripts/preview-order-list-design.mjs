// Local visual QA of the real seller components. All order data/actions below are in-memory fixtures.
import { createServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from 'node:console'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const id = 'virtual:seller-order-preview'
const order = { id: 1201, order_code: 'ORD-SAMPLE-1201', created_at: '2026-10-01T08:00:00Z', shop_id: 1,
  status: 'pending', order_status: 'pending', payment_status: 'unpaid', financial_status: 'unpaid', fulfillment_status: 'unfulfilled',
  lock_version: 1, allowed_actions: ['confirm', 'cancel'], sub_total: '2500000.00', shipping_fee: '30000.00', order_total: '2530000.00',
  shipping_method_name: 'Standard delivery', estimated_delivery_from: '2026-10-05', estimated_delivery_to: '2026-10-07',
  payment_method_data: { type: 'cod', name: 'Cash on delivery' }, events: [],
  address: { recipient_first_name: 'Minh', recipient_last_name: 'Anh', email: 'sample@example.com', phone: '090 123 4567',
    street: 'Nguyen Van Linh', house_number: '123', city: 'Ho Chi Minh City', country_name: 'Vietnam' },
  items: [{ id: 1, product_name: 'Daily Training Running Shoes', quantity: 1, unit_price: '2200000.00', line_total: '2200000.00', sku: 'SHOE-42', variant_data: [{ name: 'Color', value: 'White' }, { name: 'Size', value: '42' }] },
    { id: 2, product_name: 'Performance Crew Socks', quantity: 2, unit_price: '150000.00', line_total: '300000.00', sku: 'SOCK-M', variant_data: [{ name: 'Size', value: 'M' }] }] }
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5183, strictPort: true }, plugins: [{
  name: 'seller-order-preview',
  resolveId(name) { if (name === id) return '\0' + id },
  load(name) {
    if (name !== '\0' + id) return
    return `import {createApp,h} from 'vue'; import {createRouter,createMemoryHistory,RouterView} from 'vue-router';
      import List from '/scripts/OrderListDesignDemo.vue'; import Detail from '/src/views/SellerOrderDetailView.vue';
      import SiteHeader from '/src/components/SiteHeader.vue'; import SiteFooter from '/src/components/SiteFooter.vue';
      import '/src/styles.css'; import '/src/styles/tokens.css';
      import '@fontsource/be-vietnam-pro/latin-400.css'; import '@fontsource/be-vietnam-pro/latin-600.css';
      const order=${JSON.stringify(order)}; const realFetch=window.fetch.bind(window);
      window.fetch=async(url,opts)=>{
        const value=String(url);if(!value.includes('/api/shops/me/orders'))return realFetch(url,opts);
        const u=new URL(value,location.origin);let data;
        if(opts?.method==='POST'||opts?.method==='PATCH'){
          const payload=JSON.parse(opts.body);const action=u.pathname.endsWith('/fulfillment')?payload.fulfillment_status:u.pathname.split('/').pop();
          if(action==='confirm'){order.status=order.order_status='confirmed';order.allowed_actions=['processing','cancel']}
          else if(action==='cancel'){order.status=order.order_status='cancelled';order.fulfillment_status='cancelled';order.cancellation_reason=payload.reason;order.allowed_actions=[]}
          else if(action==='mark-paid'){order.status=order.order_status='completed';order.payment_status=order.financial_status='paid';order.paid_at=new Date().toISOString();order.allowed_actions=[]}
          else{order.fulfillment_status=action;order.allowed_actions=action==='processing'?['shipped','cancel']:action==='shipped'?['delivered']:['mark-paid'];if(action==='shipped')order.shipped_at=new Date().toISOString();if(action==='delivered')order.delivered_at=new Date().toISOString()}
          order.lock_version++;order.events.push({id:order.events.length+1,action,created_at:new Date().toISOString(),actor:{full_name:'Demo seller'},reason:payload.reason,next_state:{order_status:order.order_status,financial_status:order.financial_status,fulfillment_status:order.fulfillment_status}});data={success:true,data:order};
        }else if(u.pathname.endsWith('/orders')){
          const matches=['order_status','financial_status','fulfillment_status'].every(k=>!u.searchParams.get(k)||u.searchParams.get(k)==='all'||u.searchParams.get(k)===order[k]);
          const q=(u.searchParams.get('q')||'').toLowerCase();const found=matches&&(!q||'minh anh'.includes(q)||order.order_code.toLowerCase().includes(q));
          data={success:true,data:found?[{...order,recipient_name:'Minh Anh',item_quantity:3}]:[],pagination:{page:1,limit:10,totalItems:found?1:0,totalPages:1}};
        }else data={success:true,data:{...order,id:Number(u.pathname.split('/').pop())}};
        return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
      };
      const routes=[{path:'/orders',name:'seller-order-list',component:List},{path:'/orders/:id',name:'seller-order-detail',component:Detail}];
      for(const name of ['management','my-products','my-shop','shipping-method-list','shipping-country-list','shipping-setting-list','payment-method-list','products','home','cart','categories','profile'])routes.push({path:'/sample/'+name,name,component:List});
      const router=createRouter({history:createMemoryHistory(),routes});await router.push('/orders');
      const user={id:1,full_name:'Demo seller'};
      createApp({render:()=>h('div',[h(SiteHeader,{currentUser:user,cartCount:0}),h(RouterView,{}, {default:({Component})=>h(Component,{currentUser:user,sessionLoading:false})}),h(SiteFooter)])}).use(router).mount('#app');
      document.querySelector('#theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'};`
  },
  configureServer(vite) {
    vite.middlewares.use('/__seller-orders-preview', async (req, res) => {
      const html = await vite.transformIndexHtml('/__seller-orders-preview', `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order List — design demo</title><style>.qa-bar{display:flex;align-items:center;justify-content:center;gap:16px;padding:8px;font:12px system-ui;color:var(--rs-muted);background:var(--rs-subtle)}.qa-bar button{color:var(--rs-text);background:var(--rs-surface);border:1px solid var(--rs-border);border-radius:4px;padding:6px 10px}</style></head><body><div class="qa-bar">Order List design demo · sample data<button id="theme">Toggle theme</button></div><div id="app"></div><script type="module" src="/@id/${id}"></script></body></html>`)
      res.setHeader('Content-Type', 'text/html'); res.end(html)
    })
  }
}] })
await server.listen()
log('Seller order sample preview: http://127.0.0.1:5183/__seller-orders-preview')

