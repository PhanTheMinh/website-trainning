// Local-only visual QA. Sample data never reaches the database or production build.
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { log } from 'node:console'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const moduleId = 'virtual:order-ui-preview'
const address = { recipient_first_name: 'Alex', recipient_last_name: 'Morgan', email: 'alex@example.com', phone: '+1 202 555 0100',
  street: 'Market Street', house_number: '120', apartment: 'Unit 4', city: 'San Francisco', province_name: 'California', postal_code: '94103', country_name: 'United States' }
const orders = [
  { id: 1201, shop: { name: 'Stride Running' }, status: 'pending', order_code: 'ORD-SAMPLE-REFERENCE-1201', sub_total: '2500000.00', shipping_fee: '30000.00', order_total: '2530000.00', shipping_method_name: 'Standard delivery',
    estimated_delivery_from: '2026-10-05', estimated_delivery_to: '2026-10-07', address, payment_status: 'unpaid', payment_method_data: { type: 'cod', name: 'Cash on delivery', instructions: 'Pay the courier when your package arrives.' }, createdAt: '2026-10-01T08:00:00Z',
    items: [{ id: 1, product_name: 'Daily Training Running Shoes', quantity: 1, unit_price: '2200000.00', line_total: '2200000.00', sku: 'SHOE-SAMPLE', variant_data: [{ name: 'Color', value: 'Cloud white' }, { name: 'Size', value: 'US 9' }] }, { id: 2, product_name: 'Performance Crew Socks', quantity: 2, unit_price: '150000.00', line_total: '300000.00', sku: 'SOCK-SAMPLE', variant_data: [{ name: 'Color', value: 'Black' }] }] },
  { id: 1202, shop: { name: 'Pace Essentials' }, status: 'pending', order_code: 'ORD-SAMPLE-REFERENCE-1202', sub_total: '450000.00', shipping_fee: '50000.00', order_total: '500000.00', shipping_method_name: 'Express delivery',
    estimated_delivery_from: '2026-10-03', estimated_delivery_to: '2026-10-04', address, payment_status: 'unpaid', payment_method_data: { type: 'cod', name: 'Cash on delivery' }, createdAt: '2026-10-01T08:00:00Z',
    items: [{ id: 3, product_name: 'Lightweight Running Tee', quantity: 1, unit_price: '450000.00', line_total: '450000.00', sku: 'TEE-SAMPLE', variant_data: [{ name: 'Size', value: 'M' }] }] }
]
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5181, strictPort: true }, plugins: [{
  name: 'order-ui-preview',
  resolveId(id) { if (id === moduleId) return '\0' + moduleId },
  load(id) {
    if (id !== '\0' + moduleId) return
    return `import {createApp} from 'vue'; import {createRouter,createMemoryHistory} from 'vue-router';
      import OrderDetailView from '/src/views/OrderDetailView.vue'; import '/src/styles.css'; import '/src/styles/tokens.css';
      import '@fontsource/be-vietnam-pro/latin-400.css'; import '@fontsource/be-vietnam-pro/latin-600.css';
      const realFetch=window.fetch.bind(window);window.fetch=(url,opts)=>String(url).includes('/api/checkout/preview/orders')?Promise.resolve(new Response(JSON.stringify({success:true,data:{orders:${JSON.stringify(orders)}}}),{headers:{'Content-Type':'application/json'}})):realFetch(url,opts);
      const router=createRouter({history:createMemoryHistory(),routes:[{path:'/preview',name:'checkout-orders',component:OrderDetailView},{path:'/checkout',name:'checkout',component:OrderDetailView},{path:'/products',name:'products',component:OrderDetailView}]});
      await router.push({name:'checkout-orders',params:{}});router.currentRoute.value.params.checkoutToken='preview';
      createApp(OrderDetailView,{currentUser:{id:1},sessionLoading:false}).use(router).mount('#app');
      document.querySelector('#theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'};
      document.querySelector('#mobile').onclick=()=>document.querySelector('#app').classList.toggle('mobile-preview');`
  },
  configureServer(vite) {
    vite.middlewares.use('/__order-ui-preview', async (req, res) => {
      const html = await vite.transformIndexHtml('/__order-ui-preview', `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Order UI preview — sample data</title><style>.preview-bar{display:flex;gap:16px;align-items:center;padding:14px 24px;background:var(--rs-surface);border-bottom:1px solid var(--rs-border);color:var(--rs-muted);font:13px system-ui}.preview-bar button{background:var(--rs-subtle);color:var(--rs-text);border:1px solid var(--rs-border);padding:8px 12px;border-radius:6px}.mobile-preview{max-width:390px;margin:auto}.mobile-preview .order-layout{grid-template-columns:1fr}.mobile-preview .order-sidebar{position:static}.mobile-preview .order-hero{flex-wrap:wrap}.mobile-preview .order-hero .order-action{margin-left:0}.mobile-preview .section{padding-inline:16px}.mobile-preview .order-card__heading{flex-wrap:wrap}.mobile-preview .order-items li{flex-wrap:wrap}</style></head><body><div class="preview-bar"><strong>Runstore</strong><span>UI preview · sample data</span><button id="theme">Toggle theme</button><button id="mobile">Toggle narrow preview</button></div><div id="app"></div><script type="module" src="/@id/virtual:order-ui-preview"></script></body></html>`)
      res.setHeader('Content-Type', 'text/html'); res.end(html)
    })
  }
}] })
await server.listen()
log('Order UI sample preview: http://127.0.0.1:5181/__order-ui-preview')
