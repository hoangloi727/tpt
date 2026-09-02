# Trợ lý Tổng phụ trách Đội

## Tiếng Việt

Ứng dụng quản lý công tác Đội và thi đua trường học, gồm giao diện PWA và máy chủ Node.js cung cấp API có xác thực, tệp tĩnh và lưu trữ SQLite.

### Tính năng chính

- Quản lý nhiều trường; mọi phiên đăng nhập và yêu cầu dữ liệu nghiệp vụ đều gắn với trường đang chọn.
- Ba vai trò tài khoản: `superadmin` (gồm tài khoản root toàn cục), `admin` của trường và `user` với quyền chi tiết. Người dùng thường mới mặc định chỉ có quyền xem bảng điều khiển.
- Quản lý năm học, tuần học, cơ sở, khối, lớp, nhóm lớp, kế hoạch, công việc, hoạt động, hồ sơ Đội, tài liệu, thiết bị và báo cáo.
- Bộ quy tắc thi đua động theo phiên bản, gồm danh mục và hạng mục con cộng/trừ điểm. Có thể ghi nhận sự việc theo từng ngày từ thứ Hai đến thứ Sáu kèm minh chứng.
- Điểm tuần áp dụng điểm chuẩn một lần rồi cộng các điều chỉnh hằng ngày (hoặc dùng công thức tổng theo cấu hình). Phiếu tuần là ranh giới duyệt và khóa dữ liệu.
- Mỗi nhóm lớp có bảng xếp hạng độc lập; lớp chưa phân nhóm được xếp trong nhóm riêng "Chưa phân nhóm".
- Xuất/nhập tệp cục bộ, điểm khôi phục nội bộ, sao lưu thư mục theo lịch và gói báo cáo; không có nhà cung cấp đồng bộ từ xa.
- PWA lưu bộ nhớ đệm cho phần vỏ giao diện. Dữ liệu CRUD chính vẫn đi qua API có xác thực và được lưu trên máy chủ.

### Hướng dẫn sử dụng

- [`manual.md`](manual.md): hướng dẫn sử dụng website đầy đủ bằng tiếng Việt và tiếng Anh.

### Yêu cầu và khởi chạy

Yêu cầu Node.js 20 trở lên.

```sh
npm start
```

Mở `http://127.0.0.1:3000`. Không mở trực tiếp `frontend/index.html`, vì cách đó bỏ qua API có xác thực cần thiết.

Ở lần chạy đầu tiên khi SQLite chưa có tài khoản hiện hữu hoặc được nhập, trình duyệt yêu cầu tạo tài khoản root được bảo vệ. Không có mật khẩu mặc định hay mật khẩu trong mã nguồn. Mật khẩu chỉ được lưu dưới dạng băm `scrypt`.

Máy chủ tạo phiên trong bộ nhớ và gửi mã phiên bằng cookie `HttpOnly`, `SameSite=Strict`, giới hạn ở đường dẫn `/api`; cookie có cờ `Secure` khi kết nối được nhận diện là HTTPS. Quyền truy cập dữ liệu được kiểm tra tại API, không chỉ bằng việc ẩn giao diện.

### Dữ liệu và sao lưu

Dữ liệu nghiệp vụ và tài khoản mặc định nằm trong `data/database.sqlite`; thư mục `data/` không được Git theo dõi. Backend chịu trách nhiệm CRUD, kiểm tra revision, metadata, nhật ký kiểm toán và nhật ký thao tác.

Khi khởi tạo SQLite trống, dữ liệu JSON cũ từ `DATA_FILE` và tài khoản từ `AUTH_FILE` được nhập theo giao dịch và kiểm tra kết quả. Các tệp JSON cũ không bị tự động xóa để có thể dùng làm bản quay lui. Sao lưu tệp/thư mục và điểm khôi phục của ứng dụng bổ sung cho SQLite, không phải là đồng bộ từ xa.

### Biến môi trường

Tất cả đều tùy chọn:

| Biến | Mô tả | Mặc định |
| --- | --- | --- |
| `HOST` | Địa chỉ máy chủ lắng nghe | `127.0.0.1` |
| `PORT` | Cổng HTTP | `3000` |
| `DATA_FILE` | Nguồn JSON nghiệp vụ cũ để nhập | `data/database.json` |
| `AUTH_FILE` | Nguồn JSON tài khoản cũ để nhập | `users.json` cùng thư mục với `DATA_FILE` |
| `SQLITE_FILE` | Đường dẫn cơ sở dữ liệu SQLite đang dùng | `database.sqlite` cùng thư mục với `DATA_FILE` |

### Cấu trúc dự án

- `backend/server.js`: khởi tạo cơ sở dữ liệu, API và máy chủ tệp tĩnh.
- `backend/api.js`: tuyến API, phiên, cookie và phân quyền.
- `backend/auth.js`: tài khoản, băm mật khẩu và quản lý phiên.
- `backend/repository.js`, `backend/sqlite-database.js`, `backend/stores.js`: kho dữ liệu, SQLite và danh sách store.
- `frontend/index.html`: phần vỏ HTML tĩnh.
- `frontend/styles/app.css`: kiểu giao diện ứng dụng.
- `frontend/scripts/app.js`: composition root, điều hướng và điều phối tính năng trình duyệt.
- `frontend/scripts/app-schema.js`, `browser-runtime.js`, `form-drafts.js`, `custom-fields.js`: cấu hình, tích hợp trình duyệt và biểu mẫu.
- `frontend/scripts/score-engine.js`, `report-formatters.js`, `backup-codec.js`, `backup-service.js`: tính điểm, báo cáo và sao lưu.
- `frontend/scripts/api-reference.js`, `pwa-runtime.js`: trang tham chiếu API nội bộ và vòng đời PWA.
- `frontend/scripts/api-data-provider.js`: bộ chuyển đổi CRUD qua HTTP (`window.ApiDataProvider`).
- `frontend/manifest.webmanifest`, `frontend/sw.js`: manifest và service worker của PWA.
- `data/`: dữ liệu chạy cục bộ, bị loại khỏi Git.

### Kiểm tra

```sh
npm run check
```

Lệnh này kiểm tra cú pháp các tệp JavaScript chính; dự án hiện chưa có bộ kiểm thử hành vi tự động.

### Mô tả API

- [`api.md`](api.md): mô tả kỹ thuật và hướng dẫn tích hợp API nội bộ bằng tiếng Việt và tiếng Anh.

## English

A school youth-team administration and competition application with a PWA frontend and a Node.js server that provides an authenticated API, static assets, and SQLite persistence.

### Key features

- Multi-school management; every login session and business-data request is scoped to the selected school.
- Three account roles: `superadmin` (including the global root account), school `admin`, and permission-based `user`. New ordinary users default to dashboard-only access.
- Management of academic years, school weeks, campuses, grades, classes, class groups, plans, tasks, activities, team records, documents, equipment, and reports.
- Versioned dynamic competition rulesets with scoring categories and subcategories. Incidents can be recorded for each Monday-through-Friday school day with supporting evidence.
- Weekly scores apply the base score once and then add daily adjustments (or use the configured sum formula). The weekly sheet is the approval and locking boundary.
- Each class group has an independent ranking; ungrouped classes compete in a separate "Ungrouped" group.
- Local file export/import, internal restore points, scheduled directory backups, and report packages; there is no remote synchronization provider.
- The PWA caches the application shell. Primary CRUD data still uses the authenticated API and server-side persistence.

### Manual

- [`manual.md`](manual.md): complete Vietnamese and English website user manual.

### Requirements and startup

Node.js 20 or newer is required.

```sh
npm start
```

Open `http://127.0.0.1:3000`. Do not open `frontend/index.html` directly because that bypasses the required authenticated API.

On the first run, when SQLite has no existing or imported account, the browser requires creation of the protected root account. There is no default or source-defined password. Passwords are stored only as `scrypt` hashes.

The server keeps sessions in memory and sends the session token in an `HttpOnly`, `SameSite=Strict` cookie restricted to `/api`; the cookie is marked `Secure` when the connection is recognized as HTTPS. Data authorization is enforced by the API, not only by hiding UI routes.

### Data and backups

Business data and accounts are stored in `data/database.sqlite` by default; `data/` is excluded from Git. The backend owns CRUD, revision checks, metadata, audit logs, and operation journals.

When an empty SQLite database is initialized, legacy business JSON from `DATA_FILE` and account JSON from `AUTH_FILE` are imported transactionally and verified. Legacy JSON files are never deleted automatically, so they remain available as rollback copies. Application file/directory backups and restore points supplement SQLite; they are not remote synchronization.

### Environment variables

All variables are optional:

| Variable | Description | Default |
| --- | --- | --- |
| `HOST` | Server bind address | `127.0.0.1` |
| `PORT` | HTTP port | `3000` |
| `DATA_FILE` | Legacy business JSON import source | `data/database.json` |
| `AUTH_FILE` | Legacy account JSON import source | `users.json` beside `DATA_FILE` |
| `SQLITE_FILE` | Active SQLite database path | `database.sqlite` beside `DATA_FILE` |

### Project structure

- `backend/server.js`: initializes the database, API, and static-file server.
- `backend/api.js`: API routes, sessions, cookies, and authorization.
- `backend/auth.js`: accounts, password hashing, and session management.
- `backend/repository.js`, `backend/sqlite-database.js`, `backend/stores.js`: repository, SQLite layer, and store registry.
- `frontend/index.html`: static HTML shell.
- `frontend/styles/app.css`: application styles.
- `frontend/scripts/app.js`: browser composition root, routing, and feature orchestration.
- `frontend/scripts/app-schema.js`, `browser-runtime.js`, `form-drafts.js`, `custom-fields.js`: configuration, browser integration, and forms.
- `frontend/scripts/score-engine.js`, `report-formatters.js`, `backup-codec.js`, `backup-service.js`: scoring, reports, and backups.
- `frontend/scripts/api-reference.js`, `pwa-runtime.js`: private API reference page and PWA lifecycle.
- `frontend/scripts/api-data-provider.js`: HTTP CRUD adapter (`window.ApiDataProvider`).
- `frontend/manifest.webmanifest`, `frontend/sw.js`: PWA manifest and service worker.
- `data/`: local runtime data, excluded from Git.

### Verification

```sh
npm run check
```

This command syntax-checks the main JavaScript files; the project does not currently include an automated behavior test suite.

### API documentation

- [`api.md`](api.md): technical specification and integration guide for the private API, in Vietnamese and English.
