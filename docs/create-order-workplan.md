# Create Order — plan triển khai đã điều chỉnh

Tài liệu này thay thế cấu trúc group/payment trong bản Word cũ. ERD cập nhật: `create-order-erd.dbml`.

## Cấu trúc

- Một checkout tạo một order cho mỗi shop. Các đơn liên kết trực tiếp bằng `orders.checkout_id`.
- Không có bảng `order_groups` hoặc `order_payments` trong schema cuối.
- Mỗi order có shipping method/rate, phí, khoảng ngày giao và trạng thái riêng.
- Payment lưu ngay trên order: `payment_method_id`, `payment_method_data` (JSON snapshot), `payment_status`, `paid_at`.
- Items không lặp `shop_id`; shop được xác định qua order.
- Customer khác User. Email chuẩn hóa dùng để tìm customer; quyền xem dựa vào tài khoản đã đăng nhập, không dựa vào email nhập ở checkout.
- Địa chỉ tách cột. `order_addresses` giữ địa chỉ lúc đặt; không ghi đè profile customer cũ khi dùng cùng email.

## Luồng

Checkout → lưu nháp xong → POST create order → khóa checkout → kiểm tra tạo trùng/version/quyền
→ kiểm tra địa chỉ → đọc lại giá/tồn kho → chia theo shop → kiểm tra shipping/COD
→ so sánh quote → tìm/tạo customer → tạo orders/items/addresses → trừ tồn kho
→ hoàn tất checkout → commit → mở danh sách đơn theo checkout.

Tất cả shop thành công hoặc rollback toàn bộ. Thay đổi giá/phí/ngày giao phải xác nhận quote mới.
Số tiền được tính bằng integer cents và lưu DECIMAL. Tiền hiện tại: VND.
Ngày giao dự kiến là ngày lịch, tính theo Asia/Ho_Chi_Minh; không phải SLA ngày làm việc.

## API

- `POST /api/orders`: body `{ checkout_token, version, request_id }`. Trả `{ checkout_token, currency, orders: [...] }`.
- `GET /api/orders/:id`: một đơn thuộc tài khoản đăng nhập.
- `GET /api/checkout/:token/orders`: các đơn của lần checkout, vẫn kiểm tra tài khoản.

`request_id` là UUID v4. Cùng checkout gửi lại trả các đơn cũ, không trừ tồn kho lần nữa.
Khóa unique `(checkout_id, shop_id)` trên orders; `(user_id, order_request_id)` trên checkout chống tái dùng request cho checkout khác.

## Thứ tự triển khai và kiểm tra

1. Migration/model: sáu bảng mới `geo_countries`, `provinces`, `customers`, `orders`, `order_items`, `order_addresses`.
2. Service: transaction, tồn kho, quote, customer và snapshot.
3. Validator/controller/router: ba API trên.
4. Frontend: bổ sung street/house number/apartment/ward; nút Checkout chờ autosave; khóa gửi lặp.
5. Kết quả: thông tin từng đơn, địa chỉ, vận chuyển riêng, ngày giao, COD và items/tổng tiền.
6. Kiểm thử: nhiều shop/phương thức khác nhau, quyền truy cập, idempotency, quote, rollback và cạnh tranh tồn kho.

## Migration và chạy thử

`20261001090000` là migration v1 đã chạy trên database test; được giữ nguyên để không sửa lịch sử migration.
`20261001100000` chuyển dữ liệu v1 sang cấu trúc cuối rồi bỏ hai bảng cũ. Không xóa order/item/address.
Migration chuyển đổi forward-only: muốn quay lại v1 cần khôi phục backup database.

Chạy `npm run db:migrate` trên database phát triển trước khi dùng API mới.
Kiểm thử backend: `npm test`. Frontend: `npm --prefix frontend test` và `npm --prefix frontend run build`.

Đăng nhập → Cart → chọn sản phẩm → Checkout → nhập địa chỉ và shipping từng shop/COD → Checkout.
Màn kết quả: `/checkout/:checkoutToken/orders`; chi tiết riêng: `/orders/:id`.
Tồn kho được trừ ngay khi tạo đơn pending. Hủy đơn/hoàn kho, cổng thanh toán và quản trị vòng đời đơn chưa thuộc phạm vi này.
