# RunStore frontend

Giao diện Vue 3/Vite cho RunStore.

## Cấu hình

Trong development, Vite tự chuyển tiếp `/api`, `/health` và `/uploads` tới API
ở `http://localhost:3000`. Khi production không khai báo `VITE_API_BASE_URL`,
frontend gọi API cùng origin với trang web; nếu API nằm ở origin khác, đặt biến
tại thời điểm build.

```env
VITE_API_BASE_URL=http://localhost:3000
```

Khi có domain production, đặt `VITE_PUBLIC_SITE_URL` thành origin HTTPS tuyệt
đối; quá trình build sẽ dùng origin đó cho URL ảnh Open Graph.

## Lệnh

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run preview
```

Các trang tài khoản chỉ điều khiển trải nghiệm giao diện; mọi quyền truy cập và
quyền sở hữu dữ liệu vẫn được kiểm tra lại tại API.
