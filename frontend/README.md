# Website Trainning Frontend

Frontend Vue.js cho website ban do the thao, duoc tao bang Vite de ket noi voi backend Node.js.

## Cau truc chinh

- `src/services/apiClient.js`: cau hinh `fetch` client va base URL backend.
- `src/services/backendService.js`: vi du service goi API mau.
- `src/App.vue`: webbase ban do the thao gom hero, danh muc, san pham, gio hang mini.
- `src/assets/sports-store-hero.png`: anh hero cho trang chu.
- `src/components/BackendConnectionTest.vue`: component test ket noi backend.
- `src/components/AuthPanel.vue`: form login/register mau.
- `.env.development`: bien moi truong cho local development.
- `.env.example`: file mau de chia se cau hinh.

## Cau hinh backend URL

Sua file `.env.development`:

```env
VITE_API_BASE_URL=http://localhost:3000
```

Neu backend cua ban chay port khac, vi du `8080`, doi thanh:

```env
VITE_API_BASE_URL=http://localhost:8080
```

Vite chi expose bien moi truong co prefix `VITE_`.

## Chay frontend

```bash
cd frontend
npm install
npm run dev
```

Mac dinh frontend se chay tai:

```text
http://localhost:5173
```

## Test ket noi backend

1. Dam bao backend Node.js dang chay.
2. Dam bao backend co route test, vi du `GET /health`.
3. Mo frontend va bam `Test API`.

Neu backend chua co route health check, co the them nhanh:

```js
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})
```

Neu frontend va backend khac origin, backend Node.js can bat CORS, vi du voi Express:

```bash
npm install cors
```

```js
import cors from 'cors'

app.use(cors({ origin: 'http://localhost:5173' }))
```

## API san pham goi y

Frontend hien dang dung du lieu mau trong `src/App.vue`. Khi backend co API san pham,
ban co the dung service `getProducts()` trong `src/services/backendService.js` de goi:

```http
GET /products
```

## API auth goi y

Frontend hien dang mock login/register tren client de test giao dien. Khi backend san
sang, co the noi cac ham trong `src/services/authService.js` toi cac endpoint:

```http
POST /auth/login
POST /auth/register
GET /auth/profile
PUT /auth/profile
```
