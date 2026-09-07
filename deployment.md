# Hướng dẫn triển khai

Tài liệu này gồm bước cài đặt máy chủ và cài đặt ứng dụng trên thiết bị di động cho ứng dụng **Trợ lý Tổng phụ trách Đội**.

## 1. Yêu cầu

- Node.js 20 trở lên
- Trình duyệt hiện đại như Chrome, Edge, Safari hoặc Firefox
- Với cài đặt di động và cookie bảo mật trong production: một domain HTTPS hoặc `localhost`
- Một thư mục có quyền ghi cho dữ liệu SQLite

## 2. Cài đặt máy chủ

### 2.1 Chuẩn bị mã nguồn

Sao chép thư mục dự án lên máy chủ. **Không sao chép** các thư mục cục bộ sau:

- `data/`
- `node_modules/`
- `.agents/`
- `.codex/`
- `reverse-engineering/`

Cài dependencies:

```sh
npm ci
```

### 2.2 Cấu hình đường dẫn runtime

Mọi environment variable đều tùy chọn. Giá trị mặc định phù hợp cho bản chạy thử nội bộ.

| Biến | Mặc định | Mô tả |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Địa chỉ lắng nghe. Dùng `127.0.0.1` khi đặt sau reverse proxy trên cùng máy. |
| `PORT` | `3000` | Cổng lắng nghe. |
| `DATA_FILE` | `data/database.json` | Nguồn import dữ liệu nghiệp vụ từ JSON legacy. Chỉ dùng khi khởi tạo SQLite trống. |
| `AUTH_FILE` | `users.json` cùng thư mục với `DATA_FILE` | Nguồn import tài khoản từ JSON legacy. Hoạt động độc lập với `DATA_FILE`. |
| `SQLITE_FILE` | `database.sqlite` cùng thư mục với `DATA_FILE` | CSDL SQLite đang dùng. |

Ví dụ:

```sh
# Chạy thử nội bộ
npm start

# Chạy kiểu production, có process manager
HOST=127.0.0.1 PORT=3000 SQLITE_FILE=/var/lib/tpt/database.sqlite npm start
```

### 2.3 Chạy lần đầu và tài khoản root

1. Mở URL của máy chủ, ví dụ `http://127.0.0.1:3000`.
2. **Không** mở trực tiếp `frontend/index.html`, vì cách đó bỏ qua API có xác thực.
3. Ở lần chạy đầu, tạo tài khoản root được bảo vệ ngay trong trình duyệt.
4. Lưu mật khẩu root vào password manager. Ứng dụng không có mật khẩu mặc định trong mã nguồn và không có cơ chế bypass đặt lại mật khẩu.

Session được quản lý trong bộ nhớ và bị xóa khi máy chủ khởi động lại. Người dùng cần đăng nhập lại sau mỗi lần restart.

## 3. Triển khai production

### 3.1 Kiến trúc khuyến nghị

Chỉ cho Node server lắng nghe trên `127.0.0.1`. Đặt một HTTPS reverse proxy như Nginx hoặc Caddy phía trước và forward toàn bộ `/` sang Node server. Tệp tĩnh và `/api/*` phải cùng một origin, vì vậy không tách chúng sang các domain khác nhau.

Ví dụ location trong Nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Ứng dụng chỉ dùng `X-Forwarded-Proto` để nhận diện HTTPS và đặt cờ `Secure` cho session cookie.

### 3.2 Quản lý process

Dùng systemd, PM2, Docker hoặc một process manager khác. Ví dụ systemd service:

```ini
[Service]
WorkingDirectory=/opt/tpt
ExecStart=/usr/bin/node backend/server.js
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=SQLITE_FILE=/var/lib/tpt/database.sqlite
Restart=always
User=tpt
```

Nếu import từ JSON legacy, thiết lập thêm `DATA_FILE` và `AUTH_FILE`. Giữ lại các tệp này làm rollback source; máy chủ không tự động xóa chúng.

### 3.3 Dữ liệu và backup

- Backup định kỳ tệp SQLite đang dùng.
- Dừng máy chủ trước khi copy tệp SQLite để có bản backup hoàn toàn nhất quán, hoặc dùng công cụ đảm bảo tính nhất quán của SQLite.
- Không public `data/`, `SQLITE_FILE`, `DATA_FILE` hoặc `AUTH_FILE` qua web server.
- Khi có thể, lưu backup ngoài thư mục ứng dụng.
- Internal snapshot và export của ứng dụng chỉ bổ trợ, không thay thế backup máy chủ.

### 3.4 Checklist bảo mật

- Dùng HTTPS trong production.
- Giữ Node listener ở chế độ private, sau reverse proxy hoặc firewall.
- Chỉ cấp quyền truy cập máy chủ cho nhân sự nhà trường được ủy quyền.
- Không commit database SQLite, JSON import legacy, environment file hoặc backup.
- Theo dõi log máy chủ và cập nhật Node.js định kỳ.

## 4. Cập nhật máy chủ

1. Thông báo cho người dùng và đảm bảo họ đã đăng xuất hoặc dừng thao tác ghi.
2. Backup database SQLite đang dùng.
3. Dừng process cũ.
4. Thay thế mã nguồn ứng dụng.
5. Chạy:

```sh
npm ci
npm run check
```

6. Khởi động lại ứng dụng với đúng các giá trị `SQLITE_FILE`, `DATA_FILE` và `AUTH_FILE` cũ.
7. Mở website và kiểm tra đăng nhập, điều hướng và một thao tác chỉ đọc trước khi mở lại cho người dùng.

Schema migration chạy tự động trong lúc khởi động. Không xóa các tệp rollback/import cũ.

## 5. Cài đặt trên di động

Ứng dụng là một Progressive Web App (PWA). Không cần gói phát hành riêng trên app store.

### Android / Chrome

1. Mở URL HTTPS của ứng dụng.
2. Đăng nhập một lần để ứng dụng tải đầy đủ.
3. Mở menu của trình duyệt.
4. Chọn **Install app** hoặc **Add to Home screen**.
5. Xác nhận cài đặt.

### iOS / Safari

1. Mở URL HTTPS của ứng dụng.
2. Đăng nhập một lần để ứng dụng tải đầy đủ.
3. Chạm nút Share.
4. Chạm **Add to Home Screen**.
5. Xác nhận tên ứng dụng và chạm **Add**.

Sau khi cài, mở ứng dụng bằng biểu tượng trên màn hình chính. PWA sẽ chạy ở chế độ standalone.

## 6. Hoạt động offline và cập nhật trên di động

- PWA cache application shell để có thể mở giao diện khi offline.
- Dữ liệu CRUD có xác thực vẫn cần server và kết nối mạng; ứng dụng không phải sản phẩm đồng bộ dữ liệu offline.
- Service worker dùng shell cache có version (`tpt-shell-v23`). Khi triển khai tệp frontend mới, tăng version cache trong `frontend/sw.js` và cập nhật các đường dẫn tệp thay đổi trong danh sách `SHELL`.
- Người dùng thấy banner cập nhật sau khi phiên bản mới tải xong. Họ có thể cập nhật sau khi đóng các bản nháp chưa lưu.
- Nếu ứng dụng đã cài hiển thị phiên bản cũ, hãy đóng hoàn toàn rồi mở lại, hoặc xóa site data trong trình duyệt và cài lại.

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| Trình duyệt chỉ mở shell đăng nhập khi offline | PWA shell đã tải, nhưng dữ liệu server cần kết nối mạng. Hãy kết nối lại. |
| Người dùng bị đăng xuất sau khi restart máy chủ | Đây là hành vi đúng vì session nằm trong bộ nhớ. |
| Cookie không có cờ `Secure` | Kiểm tra reverse proxy gửi `X-Forwarded-Proto: https`, hoặc truy cập trực tiếp qua HTTPS. |
| Lần chạy đầu không có dữ liệu | SQLite đang trống. Chỉ thiết lập `DATA_FILE`/`AUTH_FILE` khi khởi tạo từ backup JSON legacy. |
| Không cài được PWA | Dùng HTTPS hoặc `localhost`, chờ trang tải xong, và kiểm tra site permission trong trình duyệt. |
| Không thấy bản cập nhật | Tăng version cache trong `frontend/sw.js`, deploy lại, và nhắc người dùng đóng ứng dụng đã cài. |
