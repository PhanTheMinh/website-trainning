# RunStore

Ứng dụng bán đồ chạy bộ gồm API Node.js/Express, MySQL/Sequelize và giao diện Vue 3/Vite.

## Yêu cầu

- Node.js 20.19+ hoặc 22.12+
- MySQL đang chạy
- Hai database riêng cho development và test

## Cài đặt

```bash
npm install
npm --prefix frontend install
```

Sao chép `.env.example` thành `.env`, điền thông tin database và một
`SESSION_SECRET` ngẫu nhiên đủ dài. Không commit file `.env`.

Áp dụng schema development:

```bash
npm run db:migrate
```

## Chạy local

Mở hai terminal:

```bash
npm run dev
```

```bash
npm --prefix frontend run dev
```

Mặc định API chạy tại `http://localhost:3000` và frontend tại
`http://localhost:5173`.

## Thư viện ảnh sản phẩm

- Có thể chọn nhiều ảnh chung cùng lúc, tối đa 12 ảnh và 5 MB mỗi ảnh.
- Mỗi variant có thư viện độc lập tối đa 8 ảnh; có thể thêm, xóa và đổi thứ tự.
- API giữ riêng `images` của product và `variants[].images`. Trường
  `gallery_images` là danh sách tổng hợp dùng để hiển thị trang sản phẩm.
- Một lần lưu hỗ trợ tối đa 48 file ảnh variant mới.

## Dữ liệu sản phẩm demo

```bash
npm run db:seed:demo-products
```

Lệnh trên thêm 20 sản phẩm minh họa từ Adidas, Xtep, Coolmate, T8 và Motive
vào tài khoản đang sở hữu nhiều sản phẩm nhất. Ảnh được tải từ trang sản phẩm
chính thức, mô tả được biên soạn lại cho bài tập và mỗi variant có SKU riêng.
Có thể chạy lại an toàn; sản phẩm đã tồn tại sẽ được bỏ qua theo SKU.

## Kiểm tra trước khi commit

```bash
npm run check
```

Lệnh này lint backend/frontend, tự đồng bộ migration của database test, chạy
toàn bộ Jest/Vitest test và build frontend production. Có thể xem coverage
backend bằng `npm run test:coverage`.

## Triển khai

- Đặt `NODE_ENV=production` và dùng HTTPS.
- `TRUST_PROXY` mặc định là `1` ở production; điều chỉnh theo số reverse proxy
  thực tế, hoặc đặt `0` nếu Node nhận HTTPS trực tiếp.
- Giữ `SESSION_COOKIE_SAME_SITE=lax` khi frontend/API cùng site. Chỉ dùng
  `none` khi chúng ở hai site HTTPS khác nhau.
- Khai báo chính xác `FRONTEND_ORIGINS`; nhiều origin được phân cách bằng dấu
  phẩy.
- Chạy `npm run db:migrate` trước khi khởi động phiên bản ứng dụng mới.
- Thư mục `src/uploads` cần persistent storage và quyền ghi của tiến trình API.
