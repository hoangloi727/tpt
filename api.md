# API nội bộ cùng origin / Private Same-Origin API

## Tiếng Việt

### 1. Phạm vi và mục đích

Đây là hợp đồng client an toàn cho API nội bộ của ứng dụng. API phục vụ frontend được cung cấp từ cùng một nguồn (origin) bởi máy chủ ứng dụng; đây không phải là API công khai, không có cam kết tương thích cho tích hợp bên thứ ba và không hỗ trợ CORS. Không gọi trực tiếp API này từ một website có origin khác.

Tài liệu này chỉ dựa trên `backend/api.js`, `backend/auth.js`, `backend/repository.js`, `backend/stores.js` và `frontend/scripts/api-data-provider.js`. Đây không phải là đặc tả OpenAPI và không mô tả endpoint nào ngoài các route có trong những tệp đó.

Base URL trên frontend cùng origin:

```text
/api
```

Ví dụ khi chạy tại địa chỉ cục bộ mặc định:

```text
http://127.0.0.1:3000/api
```

### 2. Định dạng yêu cầu và phản hồi

- Tất cả body API đều là JSON UTF-8. Gửi `Content-Type: application/json` khi có body.
- Nên gửi `Accept: application/json` cho yêu cầu đọc.
- Phản hồi là JSON với `Content-Type: application/json; charset=utf-8` và `Cache-Control: no-store`.
- Không có route `multipart/form-data`. Tệp nhị phân phải nằm trong Blob envelope JSON được mô tả bên dưới.
- Giới hạn body JSON thô là `100 * 1024 * 1024` byte (100 MiB). Vượt giới hạn sẽ trả về `413`. Base64 và toàn bộ nội dung JSON còn lại đều được tính vào giới hạn này.
- Không có giới hạn riêng cho từng tệp và không có giới hạn response nào được công bố trong các tệp nguồn. Không nên suy diễn rằng có thể upload một tệp 100 MiB vì base64 làm tăng kích thước.
- ID store và ID bản ghi trong path phải được URL-encode.

### 3. Xác thực và phiên

Máy chủ chấp nhận hai cách truyền token phiên:

1. Cookie `tpt_session`, là cơ chế tiêu chuẩn cho frontend cùng origin.
2. Header `Authorization: Bearer <session-token>`.

Nếu cả hai cùng có mặt, Bearer được ưu tiên. Các endpoint đăng nhập và khởi tạo chỉ trả về `{ "user": ... }` trong JSON và đặt token bằng cookie; không có endpoint nào trong hợp đồng này cấp token Bearer trong body. Vì vậy, client trình duyệt thông thường phải dùng cookie. Không đọc cookie bằng JavaScript và không tạo cơ chế trích xuất token riêng.

Thuộc tính cookie:

- tên `tpt_session`;
- `Path=/api`;
- `HttpOnly`;
- `SameSite=Strict`;
- `Secure` khi kết nối socket sử dụng TLS hoặc giá trị `X-Forwarded-Proto` đầu tiên là `https`.

Phiên được lưu trong bộ nhớ máy chủ, có TTL trượt 12 giờ và được gia hạn sau mỗi lần xác minh thành công. Khởi động lại tiến trình sẽ làm mất tất cả phiên. Việc đổi mật khẩu, vô hiệu hóa tài khoản hoặc các thao tác quản trị tương ứng có thể thu hồi mọi phiên của người dùng.

Với `fetch`, luôn dùng:

```js
credentials: "same-origin"
```

Ngoài `GET /auth/status`, `POST /auth/setup` và `POST /session`, mọi route đều cần phiên hợp lệ. `DELETE /session` vẫn trả về thành công và xóa cookie nếu phiên đã hết hạn.

### 4. Mô hình người dùng

Đối tượng người dùng công khai có các trường sau:

```json
{
  "id": "uuid",
  "username": "ten-dang-nhap",
  "displayName": "Ten hien thi",
  "role": "superadmin | admin | user",
  "schoolId": "school-id hoac null",
  "permissions": ["dashboard"],
  "disabled": false,
  "root": false,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "lastLoginAt": "ISO-8601 hoac null"
}
```

Người dùng trong phiên còn có `selectedSchoolId` và `selectedSchoolName`. `superadmin` có `schoolId: null` nhưng vẫn thao tác dữ liệu trong trường đang chọn.

Tên đăng nhập được trim, chuyển thành chữ thường và phải khớp `^[a-z0-9][a-z0-9._-]{2,31}$`. Mật khẩu phải có ít nhất 10 ký tự. Tên hiển thị được trim và cắt còn tối đa 120 ký tự. Quyền được chuẩn hóa thành chữ thường, loại bỏ giá trị trùng lặp và chỉ giữ các giá trị khớp `^[a-z0-9*:_-]{1,80}$`; nếu danh sách rỗng thì dùng `dashboard`. `superadmin` luôn có `*`.

### 5. Khởi tạo lần đầu và phiên đăng nhập

#### `GET /api/auth/status`

Công khai. Trả về trạng thái khởi tạo và danh sách trường:

```json
{
  "setupRequired": true,
  "schools": [{ "id": "school-id", "name": "Ten truong" }]
}
```

#### `POST /api/auth/setup`

Công khai nhưng chỉ hoạt động khi chưa có bất kỳ tài khoản nào. Tạo tài khoản root `superadmin`, tạo phiên và trả về `201`.

Nếu `schools` từ `/auth/status` không rỗng, hãy gửi `schoolId` hợp lệ:

```json
{
  "username": "root.admin",
  "displayName": "Quan tri he thong",
  "password": "mat-khau-toi-thieu-10-ky-tu",
  "schoolId": "school-id"
}
```

Nếu chưa có trường, hãy gửi `schoolName`; máy chủ sẽ tạo trường đầu tiên:

```json
{
  "username": "root.admin",
  "displayName": "Quan tri he thong",
  "password": "mat-khau-toi-thieu-10-ky-tu",
  "schoolName": "Ten truong"
}
```

Thành công:

```json
{ "user": { "role": "superadmin", "root": true, "selectedSchoolId": "school-id" } }
```

Nếu root đã tồn tại, phản hồi là `409`. Việc kiểm tra `setupRequired` không thay thế cho xử lý xung đột phía máy chủ.

#### `POST /api/session`

Đăng nhập vào một trường cụ thể:

```json
{
  "username": "user.name",
  "password": "mat-khau",
  "schoolId": "school-id"
}
```

Trả về `200 { "user": ... }` và đặt cookie. Trường phải tồn tại. Tài khoản không phải `superadmin` chỉ có thể đăng nhập vào `schoolId` được gán cho tài khoản. Thông tin đăng nhập không hợp lệ, tài khoản bị vô hiệu hóa hoặc chọn sai trường đều nhận cùng một phản hồi `401`. Nếu chưa khởi tạo root, phản hồi là `409`.

#### `GET /api/session`

Trả về `{ "user": ... }` cho phiên hiện tại.

#### `DELETE /api/session`

Thu hồi phiên hiện tại, xóa cookie và trả về:

```json
{ "ok": true }
```

#### `POST /api/session/school`

Chỉ dành cho `superadmin`. Thay đổi phạm vi trường của phiên hiện tại:

```json
{ "schoolId": "school-id" }
```

Trả về `{ "user": ... }` với `selectedSchoolId` và `selectedSchoolName` mới.

### 6. Tài khoản, quản trị và tình trạng hệ thống

#### `PATCH /api/account`

Cho phép người dùng tự cập nhật tài khoản của mình. Body chỉ được chứa ba key sau; bất kỳ key nào khác cũng khiến yêu cầu trả về `400`:

```json
{
  "displayName": "Ten moi",
  "currentPassword": "mat-khau-hien-tai",
  "password": "mat-khau-moi-toi-thieu-10-ky-tu"
}
```

Có thể chỉ gửi `displayName`. Khi gửi `password`, phải gửi đúng `currentPassword`; sau khi đổi mật khẩu thành công, tất cả phiên của tài khoản sẽ bị thu hồi và cookie hiện tại bị xóa, vì vậy người dùng phải đăng nhập lại. Phản hồi thành công là đối tượng người dùng công khai, không được bọc trong key `user`.

#### `GET /api/health`

Cần đăng nhập. Trả về:

```json
{
  "ok": true,
  "schema": 15,
  "previousSchema": 15,
  "user": {}
}
```

Đây là health check có xác thực và làm lộ thông tin phiên, không phải health check công khai dành cho Internet.

#### `GET /api/admin/schools`

Chỉ dành cho `superadmin`. Trả về danh sách `{ id, name }` của tất cả các trường.

#### `POST /api/admin/schools`

Chỉ dành cho `superadmin`. Body:

```json
{ "name": "Ten truong" }
```

Tên được trim, giới hạn ở 200 ký tự, không được để trống và phải là duy nhất khi so sánh không phân biệt chữ hoa/chữ thường theo locale tiếng Việt. Trả về `201 { "id": ..., "name": ... }`.

#### `GET /api/admin/users`

Chỉ dành cho `superadmin` hoặc `admin`. `admin` thấy người dùng trong trường đang chọn. `superadmin` thấy người dùng trong trường đang chọn cùng các tài khoản `superadmin` toàn cục.

#### `POST /api/admin/users`

Chỉ dành cho `superadmin` hoặc `admin`. Tạo người dùng trong trường đang chọn:

```json
{
  "username": "user.name",
  "displayName": "Nguoi dung",
  "password": "mat-khau-toi-thieu-10-ky-tu",
  "role": "user",
  "permissions": ["dashboard", "store:tasks:write"]
}
```

`role` khác `admin`/`superadmin` được chuẩn hóa thành `user`. Một `admin` không thể tạo `superadmin`; giá trị đó bị hạ xuống thành `admin`. Máy chủ tự gán trường đang chọn, vì vậy không gửi `schoolId`. Trả về `201` cùng đối tượng người dùng công khai.

#### `PATCH /api/admin/users/:id`

Chỉ dành cho `superadmin` hoặc `admin`, và chỉ khi tài khoản đích nằm trong phạm vi được phép. Các thay đổi an toàn từ client gồm `username`, `displayName`, `password`, `role`, `permissions`, `disabled`. Không gửi `schoolId`; máy chủ buộc tài khoản thuộc trường đang chọn. `admin` không thể quản lý `superadmin` hoặc nâng cấp tài khoản thành `superadmin`. Không thể thay đổi vai trò và trạng thái disabled của tài khoản root.

Việc thay đổi mật khẩu hoặc vô hiệu hóa tài khoản sẽ thu hồi các phiên của tài khoản đó. Chuyển vai trò khỏi `user` hoặc vô hiệu hóa tài khoản cũng xóa các phân công chấm điểm của tài khoản. Trả về đối tượng người dùng công khai đã cập nhật.

#### `DELETE /api/admin/users/:id`

Chỉ dành cho `superadmin` hoặc `admin` theo cùng các quy tắc phạm vi. Không thể xóa tài khoản đang được phiên hiện tại sử dụng và không thể xóa tài khoản root. Thành công trả về `{ "removed": true }`; nếu không tìm thấy mục tương ứng trong store người dùng thì trả về `404 { "removed": false }`. Phiên và phân công chấm điểm của tài khoản được thu hồi hoặc xóa khi phù hợp.

### 7. Export, import và backup

#### `GET /api/export`

Cần quyền `data:export` (vai trò `admin`/`superadmin` mặc nhiên bỏ qua các kiểm tra quyền thông thường). Xuất tất cả store, bao gồm cả bản ghi đã soft-delete, trong phạm vi trường đang chọn:

```json
{
  "app": "Tro ly Tong phu trach Doi",
  "version": "3.1.0-rc.1",
  "schema": 15,
  "exported_at": "ISO-8601",
  "school_profile_id": "school-id",
  "data": {
    "profiles": [],
    "schools": []
  }
}
```

Payload export có thể chứa tài liệu, attachment, nhật ký và dữ liệu nhạy cảm của trường. Hãy bảo vệ payload như một bản sao lưu riêng tư; không đưa vào Git hoặc cung cấp công khai.

#### `POST /api/import/replace`

Cần quyền `data:import`. Body chỉ là `{ "payload": ... }`. Đây là thao tác thay thế dữ liệu của trường đang chọn, không phải merge:

```json
{
  "payload": {
    "schema": 15,
    "data": {}
  }
}
```

`payload.data` phải tồn tại, `payload.schema` phải là số nguyên và không được lớn hơn schema máy chủ. Trả về `true` khi thành công. Máy chủ sở hữu phạm vi trường, metadata, cách giải quyết xung đột và các hiệu ứng nhật ký; client không được gửi tùy chọn import để điều khiển các ngữ nghĩa này. Store `schools` được ánh xạ vào trường hiện tại thay vì thay đổi tenant. Store không có mảng tương ứng trong payload sẽ được giữ nguyên. Các store sau luôn bị bỏ qua khi restore từ backup bên ngoài:

```text
operation_journal
internal_snapshots
form_drafts
restore_staging
backup_handles
```

#### `POST /api/import/merge`

Cần quyền `data:import`. Body chỉ là:

```json
{
  "payload": {
    "schema": 15,
    "data": {}
  }
}
```

Máy chủ thực hiện toàn bộ merge trong một transaction. Với mỗi ID, bản ghi đến được chọn nếu chưa có bản ghi hiện tại, có `revision` lớn hơn, hoặc có cùng `revision` nhưng `updated_at` mới hơn; nếu không, máy chủ giữ bản ghi hiện tại. Các store bị loại khỏi backup bên ngoài nêu trên bị bỏ qua, cũng như các store điểm cũ khi import schema trước 10. Metadata của bản ghi được chọn được bảo toàn và phạm vi trường vẫn do máy chủ áp đặt. Phản hồi thống kê có dạng:

```json
{
  "inserted": 2,
  "updated": 3,
  "kept_current": 4,
  "stores": {
    "tasks": { "inserted": 1, "updated": 2, "kept_current": 1 }
  }
}
```

`stores` chứa thống kê cho từng store đủ điều kiện có mảng trong payload. Máy chủ ghi một operation-journal entry cho merge đã commit.

#### `POST /api/migrations/enhanced-data`

Route migration nội bộ chỉ dành cho manager (`admin` hoặc `superadmin`). Route này chuẩn hóa dữ liệu cũ trong trường đang chọn để bổ sung/đồng bộ metadata nâng cao; không dùng làm endpoint ghi dữ liệu nghiệp vụ thông thường. Body không có tham số điều khiển. Thao tác chạy trong một transaction và trả về số bản ghi đã chuẩn hóa:

```json
{ "normalized": 12 }
```

Ứng dụng còn lưu các hiện vật backup/restore/report trong những store như `internal_snapshots`, `backup_handles`, `backup_records`, `restore_staging` và `report_packages`. Đây vẫn là dữ liệu server-backed. Giá trị `FileSystemHandle` của trình duyệt không được lưu qua API: bộ mã hóa frontend chuyển chúng thành `null`. API không cung cấp provider persistence phía trình duyệt hoặc endpoint backup file/directory riêng.

### 8. API store tổng quát

`store` phải là một tên trong danh mục tại mục 9. Store không hợp lệ trả về `404`.

#### Liệt kê: `GET /api/stores/:store`

Theo mặc định, chỉ trả về các bản ghi chưa bị soft-delete:

```text
GET /api/stores/tasks
```

Thêm `?includeDeleted=1` để lấy cả các bản ghi đã soft-delete. Giá trị khác `1` không bật chế độ này.

#### Lấy một bản ghi: `GET /api/stores/:store/:id`

Trả về bản ghi hoặc `404 { "error": "..." }`. Thêm `?optional=1` để nhận `200 null` khi bản ghi không tồn tại.

#### Put/upsert: `POST /api/stores/:store`

Thao tác được gọi là `put`, nhưng HTTP method thực tế là `POST`, không phải `PUT`:

```json
{
  "row": {
    "id": "record-id",
    "revision": 3,
    "title": "Noi dung"
  }
}
```

Bỏ `id` khi tạo bản ghi mới để máy chủ sinh UUID. Khi cập nhật, gửi `id` và `revision` mới nhất đã đọc từ máy chủ. Phản hồi là bản ghi đã chuẩn hóa, bao gồm metadata của máy chủ.

Body có thể chứa `archivedYearReason` ở cấp cao nhất bên cạnh `row`. Chỉ manager được gửi trường này, lý do sau khi trim phải có ít nhất 10 ký tự, và chỉ dùng khi một năm học đã lưu trữ được mở để hiệu chỉnh. Máy chủ dùng lý do để cho phép ghi năm đã đóng và ghi lý do vào dấu vết audit/operation journal; người dùng không phải manager nhận `403`, còn lý do quá ngắn nhận `400`.

#### Bulk put: `POST /api/stores/:store/bulk`

```json
{
  "rows": [
    { "id": "a", "revision": 1 },
    { "id": "b", "revision": 2 }
  ]
}
```

Trả về số lượng bản ghi đã ghi. ID lặp lại trong cùng một batch sẽ trả về `400`. Các lượt ghi được thực hiện trong một mutation và persist cùng nhau; nếu bất kỳ row nào bị từ chối thì mutation sẽ không được persist. Mỗi row cập nhật nên mang revision mới nhất.

Bulk write cũng nhận một `archivedYearReason` tùy chọn ở cấp cao nhất bên cạnh `rows`, với cùng giới hạn manager, tối thiểu 10 ký tự, mục đích hiệu chỉnh năm đã lưu trữ và dấu vết audit phía máy chủ như single write.

#### Xóa một bản ghi: `DELETE /api/stores/:store/:id`

Mặc định, bản ghi được soft-delete bằng cách đặt `deleted_at`, sau đó API trả về bản ghi đã cập nhật. Với các store mặc định hard-delete ở mục 9, bản ghi bị xóa vật lý theo chính sách máy chủ. Tham số `?hard=1` yêu cầu vai trò Admin/Superadmin; khi được chấp nhận, bản ghi bị xóa vật lý và phản hồi là `true`. Nếu không tìm thấy bản ghi, phản hồi là `200 null`.

Hard delete là thao tác hủy dữ liệu. Chỉ sử dụng trong UI hoặc luồng quản trị đã xác nhận, không dùng làm cách giải quyết xung đột. Việc xóa store `schools` qua route tổng quát luôn bị từ chối để bảo vệ trường đang đăng nhập.

#### Xóa toàn bộ store: `DELETE /api/stores/:store`

Xóa vật lý tất cả bản ghi của store trong trường đang chọn và trả về `true`. Đây là thao tác nguy hiểm, không có body xác nhận và chỉ Admin/Superadmin được thực hiện.

#### Các ràng buộc dữ liệu đáng chú ý

- Nhìn chung, không thể thay đổi các bản ghi gắn với năm học khi năm học ở trạng thái `read_only` hoặc `archived`.
- Không thể thay đổi hoặc xóa bộ tiêu chí đã được sử dụng trong bảng điểm tuần theo các ràng buộc của repository.
- Việc xóa lớp bị chặn nếu đã có lịch sử điểm hoặc xếp hạng; khi được phép, thao tác xóa lớp cũng dọn dẹp các quan hệ phân công, nhóm lớp và lớp hoạt động liên quan.
- Điểm hằng ngày phải tham chiếu đến lớp, năm, tuần, bảng điểm và tiêu chí hợp lệ; ngày phải từ thứ Hai đến thứ Sáu; không thể thay đổi hoặc xóa điểm trong bảng điểm `approved`/`locked`.
- Phân công chấm điểm phải nhắm đến người dùng có role `user` trong cùng trường và cùng năm; một lớp không được phân công trùng lặp.
- Các ràng buộc cụ thể có thể trả về `400` hoặc `409`; client không được cố gắng vô hiệu hóa chúng bằng options.

### 9. Danh mục store

Danh sách store hợp lệ, theo đúng thứ tự của máy chủ:

```text
profiles
schools
campuses
school_years
semesters
school_weeks
grades
classes
class_groups
homeroom_teachers
plans
plan_targets
tasks
task_check_items
task_dependencies
calendar_events
activity_categories
activities
activity_classes
activity_check_items
criteria_sets
criteria_groups
criteria
weekly_score_sheets
score_grader_assignments
score_entries
score_evidence
ranking_snapshots
team_units
team_positions
team_members
training_records
programs
program_results
commendations
documents
attachments
equipment
equipment_transactions
report_templates
generated_reports
audit_logs
app_settings
config_categories
config_items
custom_field_definitions
document_folders
document_links
file_versions
migration_logs
task_templates
score_component_versions
license_events
operation_journal
internal_snapshots
form_drafts
restore_staging
backup_handles
backup_records
year_transition_logs
report_packages
```

Lưu ý: `audit_logs`, `operation_journal`, `internal_snapshots`, `restore_staging`, `backup_handles`, `migration_logs`, `license_events` và các store vận hành/backup tương tự là chi tiết nội bộ của ứng dụng. Việc một tên xuất hiện trong danh mục không có nghĩa là mọi client đều nên ghi vào đó.

Các store mặc định hard-delete:

```text
operation_journal
internal_snapshots
form_drafts
restore_staging
backup_handles
backup_records
migration_logs
license_events
app_settings
```

### 10. Quyền và phạm vi trường

Mọi thao tác đọc/ghi store đều được máy chủ giới hạn theo `user.selectedSchoolId`. Khi ghi, máy chủ ghi đè `school_profile_id` bằng trường đang chọn; client không được dùng `school_profile_id` để chuyển tenant. Khi đọc một ID thuộc trường khác, kết quả được coi như không tìm thấy, ngoại trừ các quy tắc authorization chuyên biệt có thể trả về `403`.

Quyền tổng quát:

- `superadmin` và `admin` bỏ qua các kiểm tra permission thông thường.
- Người dùng có `store:<store>:read` được phép đọc store đó.
- Người dùng có `store:<store>:write` được phép ghi store đó, tùy thuộc vào các hạn chế chuyên biệt bên dưới.
- Quyền `dashboard` cho phép đọc: `app_settings`, `calendar_events`, `campuses`, `class_groups`, `classes`, `criteria`, `criteria_groups`, `criteria_sets`, `school_weeks`, `school_years`, `score_entries`, `semesters`, `schools`, `tasks`, `weekly_score_sheets`.
- `score_grader_assignments` luôn có thể đọc sau khi đăng nhập, nhưng manager thấy tất cả phân công trong trường, còn người dùng thông thường chỉ thấy phân công của chính mình.
- Chỉ `superadmin`/`admin` được ghi `class_groups`, `criteria_sets`, `criteria_groups`, `criteria` và `score_grader_assignments`.
- Chỉ manager được xóa `classes`.
- Người dùng thông thường chỉ được ghi/xóa `score_entries` nếu họ có ít nhất một phân công và cả row hiện có lẫn row đề xuất đều thuộc năm/lớp được phân công. Họ không được clear toàn bộ store điểm.
- Backend có một luồng hẹp cho phép người chấm điểm ghi `audit_logs` của `score_entries`, nhưng client thông thường không nên tự tạo audit. Hãy để luồng ứng dụng và máy chủ sở hữu nhật ký.
- `data:export` và `data:import` kiểm soát export/import.
- `POST /session/school` và chức năng quản trị trường chỉ dành cho `superadmin`; chức năng quản trị người dùng dành cho `superadmin`/`admin`.

Ẩn route trong UI chỉ mang tính trình bày. Client phải dự kiến máy chủ có thể trả về `403` và không được coi trạng thái UI là cơ chế authorization.

### 11. Revision, metadata, audit và các điều khiển nội bộ

Máy chủ sở hữu các trường metadata và hiệu ứng sau:

- `id` nếu client không cung cấp khi tạo;
- `school_profile_id` từ phiên;
- `created_at` và `updated_at`;
- `revision`;
- `source` và `device_id` mặc định;
- `school_year_id`/`academic_year_id` được đồng bộ khi có một trong hai;
- audit entry và operation-journal entry của mutation.

Để cập nhật an toàn, hãy đọc bản ghi mới nhất, chỉnh sửa rồi gửi lại `revision` của bản ghi. Nếu revision được cung cấp là một số hữu hạn nhưng khác revision hiện tại, máy chủ trả về:

```http
HTTP/1.1 409 Conflict
Content-Type: application/json; charset=utf-8

{
  "error": "Ban ghi da thay doi o noi khac; du lieu chua duoc ghi de.",
  "name": "RevisionConflictError"
}
```

Không tự động retry bằng cách bỏ `revision`; hãy tải lại, cho phép người dùng đối chiếu thay đổi và gửi bản cập nhật dựa trên revision mới. Thao tác tạo/cập nhật thông thường sẽ tăng revision và đặt `updated_at` ở phía máy chủ.

**Các tùy chọn nội bộ dành riêng:** `audit`, `journal`, `allowArchivedYear`, `preserveMetadata`, `resolveConflict`. Nếu body của generic single write, bulk write hoặc import gửi bất kỳ key nào trong số này bên trong `options`, máy chủ từ chối với `400`; các tùy chọn import không được chuyển tiếp vào repository. Chúng chỉ phục vụ các luồng nội bộ được kiểm soát. `archivedYearReason` là trường top-level riêng, không phải một `options` bypass. Không ghi trực tiếp vào `operation_journal` và không coi `audit_logs` là một store nghiệp vụ thông thường.

### 12. Blob envelope

Frontend mã hóa đệ quy Blob để truyền trong JSON:

```json
{
  "__type": "Blob",
  "type": "application/pdf",
  "name": "bao-cao.pdf",
  "data": "JVBERi0xLjQK...base64..."
}
```

- `__type` phải là chuỗi `Blob`.
- `type` mặc định là `application/octet-stream` nếu Blob không có MIME type.
- `name` lấy từ `value.name` nếu có, nếu không thì là chuỗi rỗng.
- `data` là base64 của toàn bộ byte.
- Mảng và object lồng nhau được mã hóa/giải mã đệ quy.
- Khi đọc, provider chuyển envelope thành `Blob`; tên file không được gán lại vào Blob đã giải mã, vì vậy nếu tên file quan trọng, hãy lưu thêm tên trong metadata của bản ghi.
- `FileSystemHandle` được mã hóa thành `null`, không phải Blob envelope.

Sử dụng `ApiDataProvider` hiện có để tránh lỗi mã hóa nhị phân. Không gửi `FormData`, raw bytes hoặc data URL khi schema bản ghi yêu cầu Blob envelope.

### 13. Lỗi

Lỗi có cấu trúc sau:

```json
{
  "error": "Thong diep tieng Viet",
  "name": "Error hoac RevisionConflictError"
}
```

Các status cần xử lý gồm:

- `400 Bad Request`: JSON không hợp lệ, trường/row không hợp lệ hoặc hành động bị ràng buộc nghiệp vụ từ chối.
- `401 Unauthorized`: không có phiên, phiên hết hạn hoặc đăng nhập thất bại.
- `403 Forbidden`: tài khoản không có đủ quyền hoặc đối tượng nằm ngoài phạm vi được phép.
- `404 Not Found`: route/store/bản ghi không tồn tại.
- `405 Method Not Allowed`: method không được hỗ trợ trên route store đã khớp.
- `409 Conflict`: dữ liệu trùng lặp, trạng thái không cho phép chỉnh sửa, setup đã hoàn tất hoặc xung đột revision.
- `413 Payload Too Large`: body vượt quá 100 MiB.
- `500 Internal Server Error`: lỗi nội bộ; chỉ trả về thông báo lỗi máy chủ chung.

Client phải dựa vào HTTP status và `name`, không parse nội dung thông báo tiếng Việt. Phản hồi thành công hợp lệ có thể là `null`, `true`, một số hoặc một mảng, không phải lúc nào cũng là object.

### 14. Ví dụ curl với cookie jar

Đặt base URL và cookie jar riêng cho phiên làm việc. Tệp cookie chứa token phiên; không commit hoặc chia sẻ tệp này:

```sh
BASE_URL="http://127.0.0.1:3000/api"
COOKIE_JAR="./tpt-cookie.jar"
```

Kiểm tra trạng thái khởi tạo lần đầu:

```sh
curl --fail-with-body \
  -H "Accept: application/json" \
  "$BASE_URL/auth/status"
```

Khởi tạo root khi chưa có trường:

```sh
curl --fail-with-body \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -X POST \
  --data '{"username":"root.admin","displayName":"Quan tri","password":"replace-with-a-strong-password","schoolName":"Truong cua toi"}' \
  "$BASE_URL/auth/setup"
```

Đăng nhập (lấy `schoolId` từ `/auth/status`):

```sh
curl --fail-with-body \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -X POST \
  --data '{"username":"root.admin","password":"replace-with-a-strong-password","schoolId":"thcs-local-profile-001"}' \
  "$BASE_URL/session"
```

Đọc và cập nhật một bản ghi. Thay `revision` bằng giá trị vừa đọc:

```sh
curl --fail-with-body \
  -b "$COOKIE_JAR" \
  -H "Accept: application/json" \
  "$BASE_URL/stores/tasks/task-123?optional=1"

curl --fail-with-body \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -X POST \
  --data '{"row":{"id":"task-123","revision":4,"title":"Noi dung moi"}}' \
  "$BASE_URL/stores/tasks"
```

Xuất backup của trường đang chọn:

```sh
curl --fail-with-body \
  -b "$COOKIE_JAR" \
  -H "Accept: application/json" \
  -o school-backup.json \
  "$BASE_URL/export"
```

Đăng xuất:

```sh
curl --fail-with-body \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X DELETE \
  "$BASE_URL/session"
```

### 15. Ví dụ fetch cùng origin

Helper an toàn:

```js
async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `API failed (${response.status})`);
    error.name = payload?.name || "ApiError";
    error.status = response.status;
    throw error;
  }
  return payload;
}
```

Đăng nhập và đọc tasks:

```js
await api("/session", {
  method: "POST",
  body: JSON.stringify({ username, password, schoolId }),
});

const tasks = await api("/stores/tasks");
```

Cập nhật có revision và xử lý xung đột:

```js
const current = await api(`/stores/tasks/${encodeURIComponent(taskId)}?optional=1`);

try {
  const saved = await api("/stores/tasks", {
    method: "POST",
    body: JSON.stringify({
      row: { ...current, title: "Noi dung moi", revision: current.revision },
    }),
  });
} catch (error) {
  if (error.status === 409 && error.name === "RevisionConflictError") {
    // Tai lai va yeu cau nguoi dung doi chieu thay doi.
  }
  throw error;
}
```

Với Blob, ưu tiên `window.ApiDataProvider` vì `request()` của provider này giải mã Blob, còn `put()`/`bulkPut()` mã hóa Blob trước khi gửi.

### 16. Cảnh báo về bảo mật và triển khai

- Chỉ cung cấp API và frontend trên cùng origin. Không thêm CORS hoặc coi cơ chế cookie này là API tích hợp công khai.
- Bảo vệ máy chủ bằng HTTPS trong môi trường triển khai thực tế. Cấu hình reverse proxy để `X-Forwarded-Proto` phản ánh chính xác giao thức; thuộc tính `Secure` của cookie phụ thuộc vào TLS socket hoặc header này.
- Không ghi log `Authorization`, cookie, mật khẩu, body setup/login hoặc nội dung backup.
- Cookie có thuộc tính `HttpOnly` và `SameSite=Strict`; không hạ thấp các biện pháp bảo vệ này để hỗ trợ client khác origin.
- Bearer token có quyền tương đương cookie phiên. Nếu một thành phần đáng tin cậy sử dụng Bearer, không đưa token vào URL, localStorage, log hoặc mã nguồn.
- Import replace, hard delete và clear có thể hủy dữ liệu. Hãy hạn chế quyền, tạo backup trước và yêu cầu xác nhận trên UI.
- Phiên trong bộ nhớ không được chia sẻ giữa các process và sẽ mất khi restart. Không triển khai nhiều instance như thể chúng dùng chung session nếu chưa có thay đổi kiến trúc rõ ràng.
- `/api/auth/status` công khai danh sách tên/ID trường, còn `/api/health` yêu cầu xác thực. Không mở rộng thông tin công khai ngoài hợp đồng này.
- Không gửi các điều khiển nội bộ `audit`, `journal`, `allowArchivedYear`, `preserveMetadata`, `resolveConflict`; không dựa vào các trường metadata do client cung cấp để vượt qua quyền sở hữu của máy chủ.

---

## English

### 1. Scope and purpose

This is the safe client contract for the application's private API. The API serves the frontend delivered from the same origin by the application server; it is not a public API, carries no third-party integration compatibility commitment, and has no CORS support. Do not call it directly from a website on another origin.

This document is based only on `backend/api.js`, `backend/auth.js`, `backend/repository.js`, `backend/stores.js`, and `frontend/scripts/api-data-provider.js`. It is not an OpenAPI specification and does not describe endpoints beyond the routes in those files.

Same-origin frontend base URL:

```text
/api
```

Example at the default local address:

```text
http://127.0.0.1:3000/api
```

### 2. Request and response format

- All API bodies are UTF-8 JSON. Send `Content-Type: application/json` when there is a body.
- Send `Accept: application/json` for reads.
- Responses are JSON with `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`.
- There is no `multipart/form-data` route. Binary files must be carried in the JSON Blob envelope described below.
- The raw JSON body limit is `100 * 1024 * 1024` bytes (100 MiB). Exceeding it returns `413`. Base64 and all other JSON content count toward this limit.
- The source files define no separate per-file limit and no advertised response limit. Do not infer that a 100 MiB file can be uploaded, because base64 increases its size.
- Store and record IDs in paths must be URL-encoded.

### 3. Authentication and sessions

The server accepts a session token in either form:

1. The `tpt_session` cookie, which is the standard same-origin frontend mechanism.
2. An `Authorization: Bearer <session-token>` header.

Bearer takes precedence when both are present. Login and setup return only `{ "user": ... }` in JSON and set the token as a cookie; no endpoint in this contract issues a Bearer token in its body. Normal browser clients must therefore use the cookie. Do not read the cookie from JavaScript or create a separate token-extraction mechanism.

Cookie attributes:

- name `tpt_session`;
- `Path=/api`;
- `HttpOnly`;
- `SameSite=Strict`;
- `Secure` when the socket uses TLS or the first `X-Forwarded-Proto` value is `https`.

Sessions are server-memory state with a sliding 12-hour TTL, refreshed after each successful verification. Restarting the process loses all sessions. Password changes, account disabling, and corresponding administrative operations may revoke every session for a user.

With `fetch`, always use:

```js
credentials: "same-origin"
```

Every route except `GET /auth/status`, `POST /auth/setup`, and `POST /session` requires a valid session. `DELETE /session` still succeeds and clears the cookie if the session has already expired.

### 4. User model

The public user object has these fields:

```json
{
  "id": "uuid",
  "username": "username",
  "displayName": "Display name",
  "role": "superadmin | admin | user",
  "schoolId": "school-id or null",
  "permissions": ["dashboard"],
  "disabled": false,
  "root": false,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "lastLoginAt": "ISO-8601 or null"
}
```

A session user additionally has `selectedSchoolId` and `selectedSchoolName`. A `superadmin` has `schoolId: null` but still operates within the selected school.

Usernames are trimmed, lowercased, and must match `^[a-z0-9][a-z0-9._-]{2,31}$`. Passwords must contain at least 10 characters. Display names are trimmed and truncated to 120 characters. Permissions are lowercased, deduplicated, and limited to values matching `^[a-z0-9*:_-]{1,80}$`; an empty result falls back to `dashboard`. A `superadmin` always has `*`.

### 5. First-run setup and login session

#### `GET /api/auth/status`

Public. Returns setup state and the school list:

```json
{
  "setupRequired": true,
  "schools": [{ "id": "school-id", "name": "School name" }]
}
```

#### `POST /api/auth/setup`

Public, but only works while no account exists. Creates the root `superadmin`, creates a session, and returns `201`.

If `schools` from `/auth/status` is non-empty, send a valid `schoolId`:

```json
{
  "username": "root.admin",
  "displayName": "System administrator",
  "password": "password-at-least-10-characters",
  "schoolId": "school-id"
}
```

If there is no school, send `schoolName`; the server creates the first school:

```json
{
  "username": "root.admin",
  "displayName": "System administrator",
  "password": "password-at-least-10-characters",
  "schoolName": "School name"
}
```

Success:

```json
{ "user": { "role": "superadmin", "root": true, "selectedSchoolId": "school-id" } }
```

If root already exists, the response is `409`. Checking `setupRequired` does not replace server-side conflict handling.

#### `POST /api/session`

Logs into a specific school:

```json
{
  "username": "user.name",
  "password": "password",
  "schoolId": "school-id"
}
```

Returns `200 { "user": ... }` and sets the cookie. The school must exist. A non-`superadmin` account can only log into its assigned `schoolId`. Invalid credentials, a disabled account, and the wrong school all produce the same `401`. If root setup is still required, the response is `409`.

#### `GET /api/session`

Returns `{ "user": ... }` for the current session.

#### `DELETE /api/session`

Revokes the current session, clears the cookie, and returns:

```json
{ "ok": true }
```

#### `POST /api/session/school`

`superadmin` only. Changes the current session's school scope:

```json
{ "schoolId": "school-id" }
```

Returns `{ "user": ... }` with the new `selectedSchoolId` and `selectedSchoolName`.

### 6. Account, administration, and health

#### `PATCH /api/account`

Lets a user update their own account. The body may contain only the following three keys; any other key makes the request return `400`:

```json
{
  "displayName": "New name",
  "currentPassword": "current-password",
  "password": "new-password-at-least-10-characters"
}
```

`displayName` may be sent alone. Sending `password` requires the correct `currentPassword`; after a successful password change, all sessions for the account are revoked and the current cookie is cleared, so the user must log in again. The successful response is the public user object, not wrapped in a `user` key.

#### `GET /api/health`

Authentication required. Returns:

```json
{
  "ok": true,
  "schema": 15,
  "previousSchema": 15,
  "user": {}
}
```

This is an authenticated health check that exposes session details, not a public Internet health probe.

#### `GET /api/admin/schools`

`superadmin` only. Returns all schools as `{ id, name }`.

#### `POST /api/admin/schools`

`superadmin` only. Body:

```json
{ "name": "School name" }
```

The name is trimmed, limited to 200 characters, required, and unique case-insensitively under Vietnamese locale comparison. Returns `201 { "id": ..., "name": ... }`.

#### `GET /api/admin/users`

`superadmin` or `admin` only. An `admin` sees users in the selected school. A `superadmin` sees users in the selected school plus global `superadmin` accounts.

#### `POST /api/admin/users`

`superadmin` or `admin` only. Creates a user in the selected school:

```json
{
  "username": "user.name",
  "displayName": "User",
  "password": "password-at-least-10-characters",
  "role": "user",
  "permissions": ["dashboard", "store:tasks:write"]
}
```

A `role` other than `admin`/`superadmin` is normalized to `user`. An `admin` cannot create a `superadmin`; that value is reduced to `admin`. The server assigns the selected school, so do not send `schoolId`. Returns `201` with the public user.

#### `PATCH /api/admin/users/:id`

`superadmin` or `admin` only, and only when the target account is within the allowed scope. Safe client changes are `username`, `displayName`, `password`, `role`, `permissions`, and `disabled`. Do not send `schoolId`; the server forces the selected school. An `admin` cannot manage or promote a `superadmin`. A root account's role and disabled state cannot be changed.

Changing the password or disabling an account revokes that account's sessions. Changing the role away from `user` or disabling it also clears its grader assignments. Returns the updated public user.

#### `DELETE /api/admin/users/:id`

`superadmin` or `admin` only under the same scope rules. The account used by the current session cannot be deleted, and the root account cannot be deleted. Success returns `{ "removed": true }`; a missing user-store entry returns `404 { "removed": false }`. Sessions and grader assignments are revoked/removed as applicable.

### 7. Export, import, and backups

#### `GET /api/export`

Requires `data:export` (`admin`/`superadmin` roles bypass normal permission checks). Exports every store, including soft-deleted records, in the selected school scope:

```json
{
  "app": "Tro ly Tong phu trach Doi",
  "version": "3.1.0-rc.1",
  "schema": 15,
  "exported_at": "ISO-8601",
  "school_profile_id": "school-id",
  "data": {
    "profiles": [],
    "schools": []
  }
}
```

An export may contain documents, attachments, logs, and sensitive school data. Protect it as a private backup; do not add it to Git or serve it publicly.

#### `POST /api/import/replace`

Requires `data:import`. The body is only `{ "payload": ... }`. This replaces data for the selected school; it is not a merge:

```json
{
  "payload": {
    "schema": 15,
    "data": {}
  }
}
```

`payload.data` must exist, `payload.schema` must be an integer, and it cannot exceed the server schema. Returns `true` on success. The server owns school scope, metadata, conflict behavior, and journal effects; clients must not send import options to control these semantics. The `schools` store is mapped onto the current school rather than changing tenants. A store without an array in the payload remains unchanged. These stores are always skipped when restoring an external backup:

```text
operation_journal
internal_snapshots
form_drafts
restore_staging
backup_handles
```

#### `POST /api/import/merge`

Requires `data:import`. Its only body is:

```json
{
  "payload": {
    "schema": 15,
    "data": {}
  }
}
```

The server performs the entire merge in one transaction. For each ID, it selects the incoming record when no current record exists, its `revision` is greater, or its `revision` is equal and its `updated_at` is newer; otherwise it keeps the current record. The external-backup excluded stores above are skipped, as are legacy score stores when importing a schema below 10. Selected record metadata is preserved while the server still enforces school scope. The statistics response has this shape:

```json
{
  "inserted": 2,
  "updated": 3,
  "kept_current": 4,
  "stores": {
    "tasks": { "inserted": 1, "updated": 2, "kept_current": 1 }
  }
}
```

`stores` contains statistics for each eligible store represented by an array in the payload. The server writes an operation-journal entry for the committed merge.

#### `POST /api/migrations/enhanced-data`

This is a manager-only (`admin` or `superadmin`) internal migration route. It normalizes older data in the selected school by filling/synchronizing enhanced metadata; it is not a general business-data write endpoint. The body has no control parameters. The operation runs in one transaction and returns the number of normalized records:

```json
{ "normalized": 12 }
```

The application also keeps backup/restore/report artifacts in stores such as `internal_snapshots`, `backup_handles`, `backup_records`, `restore_staging`, and `report_packages`. These remain server-backed data. Browser `FileSystemHandle` values are not persisted through the API: the frontend encoder converts them to `null`. The API supplies no browser-side persistence provider or separate file/directory backup endpoint.

### 8. Generic store API

`store` must be one of the names in section 9. An invalid store returns `404`.

#### List: `GET /api/stores/:store`

By default, returns only records not soft-deleted:

```text
GET /api/stores/tasks
```

Add `?includeDeleted=1` to include soft-deleted records. Values other than `1` do not enable this mode.

#### Get one: `GET /api/stores/:store/:id`

Returns a record or `404 { "error": "..." }`. Add `?optional=1` to receive `200 null` when it does not exist.

#### Put/upsert: `POST /api/stores/:store`

The operation is called `put`, but its actual HTTP method is `POST`, not `PUT`:

```json
{
  "row": {
    "id": "record-id",
    "revision": 3,
    "title": "Content"
  }
}
```

Omit `id` when creating a record so the server generates a UUID. For an update, send `id` and the latest `revision` read from the server. Returns the normalized record, including server metadata.

The body may include top-level `archivedYearReason` beside `row`. Only a manager may send it, its trimmed value must contain at least 10 characters, and it is used only when an archived school year has been opened for correction. The server uses the reason to permit the closed-year write and records it in the audit/operation-journal trail; a non-manager receives `403`, while a short reason receives `400`.

#### Bulk put: `POST /api/stores/:store/bulk`

```json
{
  "rows": [
    { "id": "a", "revision": 1 },
    { "id": "b", "revision": 2 }
  ]
}
```

Returns the number of records written. Duplicate IDs within one batch return `400`. Writes run in one persisted mutation; if any row is rejected, the mutation is not persisted. Every updated row should carry its latest revision.

Bulk writes likewise accept one optional top-level `archivedYearReason` beside `rows`, with the same manager-only, 10-character minimum, archived-year correction purpose, and server audit-trail rules as a single write.

#### Delete one: `DELETE /api/stores/:store/:id`

The default is a soft delete that sets `deleted_at` and returns the updated record. Stores listed for server-policy hard deletion in section 9 are physically removed by default. The explicit `?hard=1` parameter requires Admin/Superadmin; when accepted, the record is physically removed and the response is `true`. A missing record returns `200 null`.

Hard deletion destroys data. Use it only in confirmed administrative UI/flows, not as conflict resolution. Deleting the `schools` store through the generic route is always rejected to protect the login school.

#### Clear a store: `DELETE /api/stores/:store`

Physically removes all records in the store for the selected school and returns `true`. This is dangerous, has no confirmation body, and is restricted to Admin/Superadmin.

#### Notable data constraints

- Records associated with a school year generally cannot be changed when the year is `read_only` or `archived`.
- Criteria sets already used by weekly score sheets cannot be modified/deleted under the repository constraints.
- Class deletion is blocked after score or ranking history exists; an allowed deletion also cleans related assignments, class groups, and activity-class relationships.
- Daily scores must reference a valid class, year, week, sheet, and criterion; dates must be Monday through Friday; scores cannot be changed or deleted for `approved`/`locked` sheets.
- Grader assignments must target a `user` in the same school and year, and classes cannot be assigned more than once.
- Specific constraints may return `400` or `409`; clients must not attempt to disable them with options.

### 9. Store inventory

Valid stores, in server order:

```text
profiles
schools
campuses
school_years
semesters
school_weeks
grades
classes
class_groups
homeroom_teachers
plans
plan_targets
tasks
task_check_items
task_dependencies
calendar_events
activity_categories
activities
activity_classes
activity_check_items
criteria_sets
criteria_groups
criteria
weekly_score_sheets
score_grader_assignments
score_entries
score_evidence
ranking_snapshots
team_units
team_positions
team_members
training_records
programs
program_results
commendations
documents
attachments
equipment
equipment_transactions
report_templates
generated_reports
audit_logs
app_settings
config_categories
config_items
custom_field_definitions
document_folders
document_links
file_versions
migration_logs
task_templates
score_component_versions
license_events
operation_journal
internal_snapshots
form_drafts
restore_staging
backup_handles
backup_records
year_transition_logs
report_packages
```

Note: `audit_logs`, `operation_journal`, `internal_snapshots`, `restore_staging`, `backup_handles`, `migration_logs`, `license_events`, and similar operational/backup stores are application internals. A name being in the inventory does not mean every client should write it.

Stores that hard-delete by default:

```text
operation_journal
internal_snapshots
form_drafts
restore_staging
backup_handles
backup_records
migration_logs
license_events
app_settings
```

### 10. Permissions and school scope

Every store read/write is server-scoped to `user.selectedSchoolId`. On writes, the server overwrites `school_profile_id` with the selected school; clients must not use `school_profile_id` to switch tenants. Reading an ID from another school behaves as missing, except that dedicated authorization checks may return `403`.

General permissions:

- `superadmin` and `admin` bypass normal permission checks.
- A user with `store:<store>:read` can read that store.
- A user with `store:<store>:write` can write that store, subject to the special restrictions below.
- `dashboard` permits reads from `app_settings`, `calendar_events`, `campuses`, `class_groups`, `classes`, `criteria`, `criteria_groups`, `criteria_sets`, `school_weeks`, `school_years`, `score_entries`, `semesters`, `schools`, `tasks`, and `weekly_score_sheets`.
- `score_grader_assignments` is always readable after login, but managers see all assignments in the school while ordinary users see only their own.
- Only `superadmin`/`admin` may write `class_groups`, `criteria_sets`, `criteria_groups`, `criteria`, and `score_grader_assignments`.
- Only managers may delete `classes`.
- An ordinary user may write/delete `score_entries` only when they have at least one assignment and both the existing and proposed rows fall within an assigned year/class. They cannot clear the entire score store.
- The backend has a narrow path for graders to write `score_entries` audit logs, but normal clients should not create audit records themselves. Leave log ownership to the application flow and server.
- `data:export` and `data:import` control export/import.
- `POST /session/school` and school administration are `superadmin`-only; user administration is for `superadmin`/`admin`.

Hiding routes in the UI is presentational only. Clients must expect server `403` responses and must not treat UI state as authorization.

### 11. Revisions, metadata, audit, and internal controls

The server owns these metadata fields and effects:

- `id` when the client omits it on creation;
- `school_profile_id` from the session;
- `created_at` and `updated_at`;
- `revision`;
- default `source` and `device_id`;
- synchronized `school_year_id`/`academic_year_id` when either is present;
- mutation audit entries and operation-journal entries.

For a safe update, read the latest record, edit it, and send its `revision`. If a supplied finite revision differs from the current revision, the server returns:

```http
HTTP/1.1 409 Conflict
Content-Type: application/json; charset=utf-8

{
  "error": "The record changed elsewhere; it was not overwritten.",
  "name": "RevisionConflictError"
}
```

The actual server error text is Vietnamese. Do not automatically retry by omitting `revision`; reload, let the user reconcile changes, and submit an update based on the new revision. Normal creates/updates increment revision and set `updated_at` on the server.

**Reserved internal options:** `audit`, `journal`, `allowArchivedYear`, `preserveMetadata`, and `resolveConflict`. If a generic single-write, bulk-write, or import body sends any of these keys inside `options`, the server rejects it with `400`; import options are not forwarded to the repository. They exist only for controlled internal flows. `archivedYearReason` is a separate top-level field, not an `options` bypass. Do not write `operation_journal` directly, and do not treat `audit_logs` as an ordinary business store.

### 12. Blob envelopes

The frontend recursively encodes a Blob for JSON transport:

```json
{
  "__type": "Blob",
  "type": "application/pdf",
  "name": "report.pdf",
  "data": "JVBERi0xLjQK...base64..."
}
```

- `__type` is the string `Blob`.
- `type` defaults to `application/octet-stream` when the Blob has no MIME type.
- `name` comes from `value.name` when available, otherwise it is an empty string.
- `data` is base64 for all bytes.
- Nested arrays and objects are encoded/decoded recursively.
- On read, the provider converts the envelope into a `Blob`; it does not restore the name onto the decoded Blob, so also keep a filename in record metadata when it matters.
- A `FileSystemHandle` is encoded as `null`, not as a Blob envelope.

Use the existing `ApiDataProvider` to avoid binary encoding mistakes. Do not send `FormData`, raw bytes, or a data URL where the record schema expects a Blob envelope.

### 13. Errors

Errors have this shape:

```json
{
  "error": "Vietnamese message",
  "name": "Error or RevisionConflictError"
}
```

Statuses to handle include:

- `400 Bad Request`: invalid JSON, invalid fields/rows, or a business constraint rejected the action.
- `401 Unauthorized`: no session, expired session, or failed login.
- `403 Forbidden`: insufficient permission or a target outside the permitted scope.
- `404 Not Found`: missing route/store/record.
- `405 Method Not Allowed`: unsupported method on a matched store route.
- `409 Conflict`: duplicate data, non-writable state, completed setup, or revision conflict.
- `413 Payload Too Large`: body exceeds 100 MiB.
- `500 Internal Server Error`: internal failure; only a generic server message is returned.

Clients should use the HTTP status and `name`, not parse Vietnamese message wording. Valid success responses can be `null`, `true`, a number, or an array, not always an object.

### 14. curl examples with a cookie jar

Set the base URL and a private cookie jar for the working session. The cookie file contains a session token; do not commit or share it:

```sh
BASE_URL="http://127.0.0.1:3000/api"
COOKIE_JAR="./tpt-cookie.jar"
```

Check first-run state:

```sh
curl --fail-with-body \
  -H "Accept: application/json" \
  "$BASE_URL/auth/status"
```

Set up root when no school exists:

```sh
curl --fail-with-body \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -X POST \
  --data '{"username":"root.admin","displayName":"Administrator","password":"replace-with-a-strong-password","schoolName":"My school"}' \
  "$BASE_URL/auth/setup"
```

Log in (take `schoolId` from `/auth/status`):

```sh
curl --fail-with-body \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -X POST \
  --data '{"username":"root.admin","password":"replace-with-a-strong-password","schoolId":"thcs-local-profile-001"}' \
  "$BASE_URL/session"
```

Read and update a record. Replace `revision` with the value just read:

```sh
curl --fail-with-body \
  -b "$COOKIE_JAR" \
  -H "Accept: application/json" \
  "$BASE_URL/stores/tasks/task-123?optional=1"

curl --fail-with-body \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -X POST \
  --data '{"row":{"id":"task-123","revision":4,"title":"Updated content"}}' \
  "$BASE_URL/stores/tasks"
```

Export a backup of the selected school:

```sh
curl --fail-with-body \
  -b "$COOKIE_JAR" \
  -H "Accept: application/json" \
  -o school-backup.json \
  "$BASE_URL/export"
```

Log out:

```sh
curl --fail-with-body \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X DELETE \
  "$BASE_URL/session"
```

### 15. Same-origin fetch examples

A safe helper:

```js
async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `API failed (${response.status})`);
    error.name = payload?.name || "ApiError";
    error.status = response.status;
    throw error;
  }
  return payload;
}
```

Log in and read tasks:

```js
await api("/session", {
  method: "POST",
  body: JSON.stringify({ username, password, schoolId }),
});

const tasks = await api("/stores/tasks");
```

Revision-aware update and conflict handling:

```js
const current = await api(`/stores/tasks/${encodeURIComponent(taskId)}?optional=1`);

try {
  const saved = await api("/stores/tasks", {
    method: "POST",
    body: JSON.stringify({
      row: { ...current, title: "Updated content", revision: current.revision },
    }),
  });
} catch (error) {
  if (error.status === 409 && error.name === "RevisionConflictError") {
    // Reload and ask the user to reconcile the changes.
  }
  throw error;
}
```

For Blobs, prefer `window.ApiDataProvider`: its `request()` decodes Blob envelopes and its `put()`/`bulkPut()` methods encode Blobs before sending them.

### 16. Security and deployment cautions

- Serve the API and frontend on the same origin only. Do not add CORS or treat this cookie mechanism as a public integration API.
- Protect real deployments with HTTPS. Configure the reverse proxy so `X-Forwarded-Proto` accurately reflects the protocol; the cookie's `Secure` attribute depends on the TLS socket or this header.
- Do not log `Authorization`, cookies, passwords, setup/login bodies, or backup contents.
- The cookie is `HttpOnly` and `SameSite=Strict`; do not weaken those protections to support a cross-origin client.
- A Bearer token has the same authority as the session cookie. If a trusted component uses Bearer, never put it in URLs, localStorage, logs, or source code.
- Replace import, hard delete, and clear can destroy data. Restrict permissions, make a backup first, and require UI confirmation.
- In-memory sessions are not shared between processes and disappear on restart. Do not deploy multiple instances as though they share sessions without an explicit architectural change.
- `/api/auth/status` publicly lists school names/IDs, while `/api/health` is authenticated. Do not expand public information beyond this contract.
- Do not send the internal controls `audit`, `journal`, `allowArchivedYear`, `preserveMetadata`, or `resolveConflict`; do not rely on client-supplied metadata to bypass server ownership.
