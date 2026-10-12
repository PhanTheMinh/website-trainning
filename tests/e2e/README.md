# Kiểm thử tìm kiếm tên Order và Customer

Integration test gọi API Express qua Supertest với MySQL test thật. Fixture tạo hai shop,
ba khách có email riêng và các checkout nhiều shop. Các tên Order được gán riêng để
kiểm thử tìm kiếm; bộ test không kiểm tra tính năng tự sinh tên theo user.

```powershell
node node_modules/jest/bin/jest.js --runInBand tests/seller-orders-names.integration.test.js
```

E2E dùng trình duyệt thật, frontend Vue, API thật và database test. Không mock API.
Đăng nhập bằng API thật để tập trung kiểm tra luồng danh sách và search.
Fixture cố tình cho tên người nhận khác tên Customer để phát hiện sai nguồn hiển thị.

Trên máy hiện tại dùng Playwright đi kèm runtime Codex và Edge:

```powershell
$env:ORDER_SEARCH_E2E = '1'
$env:PLAYWRIGHT_MODULE = 'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node node_modules/jest/bin/jest.js --runInBand tests/seller-orders-names.e2e.test.js
Remove-Item Env:ORDER_SEARCH_E2E
Remove-Item Env:PLAYWRIGHT_MODULE
```

Máy khác cần chỉ định PLAYWRIGHT_MODULE tới module Playwright có sẵn hoặc cài Playwright
để require('playwright') hoạt động. E2E_BROWSER_CHANNEL chọn browser channel; mặc định
Windows dùng msedge, hệ điều hành khác dùng Chromium của Playwright.

Jest setup đặt NODE_ENV=test; cấu hình database sử dụng DB_TEST_NAME hoặc tên test mặc định.
Database test cần migration và dữ liệu nền như category, country và province giống các
integration test hiện có. Fixture tự dọn các bản ghi test sau khi chạy.

E2E tự khởi động backend cổng 3101 và Vite cổng 5181, sau đó tắt cả hai. Hai cổng phải
đang trống. Không trỏ bộ test vào database production. E2E được bỏ qua mặc định khi
ORDER_SEARCH_E2E khác 1 để các lần chạy Jest thông thường không tự mở trình duyệt.

Kết quả chạy sau khi thêm test:

- Integration tên và liên kết: 15/15 đạt; integration tình huống biên: 41/41 đạt.
- Test service tìm kiếm và sắp xếp: 8/8 đạt.
- E2E: 7/7 đạt sau khi SellerOrderListView dùng order_name và customer_name từ API.
- Test search cũ đã được cập nhật theo nghiệp vụ tìm tên, không tìm ID.
- Lần kiểm tra mới nhất chạy cả bốn file search: 71/71 test đạt.
- E2E bổ sung tìm một phần tên, trim từ khóa, tải lại trang, xóa search và giữ bộ lọc.
- Integration bổ sung đầu vào không hợp lệ, ký tự đặc biệt, tên trùng, giới hạn shop,
  sắp xếp khi giá trị bằng nhau, nhiều sản phẩm trong một đơn và shop đình chỉ.
