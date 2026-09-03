# Hướng dẫn sử dụng website Trợ lý Tổng phụ trách Đội

Tài liệu này mô tả phiên bản website hiện có. Phần tiếng Việt được trình bày trước, sau đó là phần tiếng Anh tương đương. Ứng dụng là giao diện PWA kết nối với máy chủ Node.js qua API có xác thực; dữ liệu nghiệp vụ và tài khoản được lưu trong SQLite trên máy chủ.

## Mục lục

### Tiếng Việt

1. [Giới thiệu và phạm vi](#vi-01)
2. [Yêu cầu và khởi động](#vi-02)
3. [Lần chạy đầu và tài khoản root](#vi-03)
4. [Đăng nhập, khóa phiên và đăng xuất](#vi-04)
5. [Vai trò và quyền](#vi-05)
6. [Phạm vi dữ liệu và điều hướng](#vi-06)
7. [Tìm kiếm, thêm nhanh và phím tắt](#vi-07)
8. [CRUD dùng chung, bản nháp, revision và chỉ đọc](#vi-08)
9. [Tổng quan](#vi-09)
10. [Hôm nay](#vi-10)
11. [Kế hoạch](#vi-11)
12. [Công việc và checklist](#vi-12)
13. [Lịch hoạt động](#vi-13)
14. [Thi đua lớp và xếp hạng nhóm độc lập](#vi-14)
15. [Hoạt động Đội](#vi-15)
16. [Tổ chức Liên đội](#vi-16)
17. [Rèn luyện - phong trào](#vi-17)
18. [Khen thưởng](#vi-18)
19. [Hồ sơ - minh chứng](#vi-19)
20. [Thiết bị Đội](#vi-20)
21. [Báo cáo](#vi-21)
22. [Trợ lý tổng hợp](#vi-22)
23. [Sao lưu và khôi phục](#vi-23)
24. [Tài khoản của tôi](#vi-24)
25. [Quản lý người dùng](#vi-25)
26. [Thiết lập](#vi-26)
27. [Vòng đời năm học](#vi-27)
28. [PWA và ngoại tuyến](#vi-28)
29. [Tệp hỗ trợ, giới hạn đã biết và xử lý sự cố](#vi-29)
30. [Checklist vận hành ngày, tuần và cuối năm](#vi-30)

### English

1. [Introduction and scope](#en-01)
2. [Requirements and startup](#en-02)
3. [First run and the root account](#en-03)
4. [Login, session lock, and logout](#en-04)
5. [Roles and permissions](#en-05)
6. [Data scope and navigation](#en-06)
7. [Search, quick add, and shortcuts](#en-07)
8. [Shared CRUD, drafts, revisions, and read-only behavior](#en-08)
9. [Dashboard](#en-09)
10. [Today](#en-10)
11. [Plans](#en-11)
12. [Tasks and checklist](#en-12)
13. [Calendar](#en-13)
14. [Scoring and independent group rankings](#en-14)
15. [Activities](#en-15)
16. [Organization](#en-16)
17. [Programs](#en-17)
18. [Commendations](#en-18)
19. [Documents and evidence](#en-19)
20. [Equipment](#en-20)
21. [Reports](#en-21)
22. [Assistant](#en-22)
23. [Backup and restore](#en-23)
24. [My account](#en-24)
25. [User management](#en-25)
26. [Settings](#en-26)
27. [Academic-year lifecycle](#en-27)
28. [PWA and offline use](#en-28)
29. [Supported files, known limitations, and troubleshooting](#en-29)
30. [Daily, weekly, and year-end operating checklists](#en-30)

---
## Tiếng Việt

<a id="vi-01"></a>
## 1. Giới thiệu và phạm vi

Website hỗ trợ quản lý công tác Đội, công việc, thi đua lớp, hồ sơ và báo cáo cho một hoặc nhiều trường. Mỗi phiên đăng nhập gắn với một trường đang chọn; các bộ chọn năm học, học kỳ, tuần và cơ sở tiếp tục thu hẹp dữ liệu hiển thị.

Các nguyên tắc quan trọng:

1. Dữ liệu CRUD chính được đọc và ghi qua API có xác thực, không phải cơ sở dữ liệu trong trình duyệt.
2. Máy chủ lưu dữ liệu và tài khoản trong `data/database.sqlite` theo mặc định.
3. API kiểm tra quyền, revision, phạm vi trường và các khóa nghiệp vụ. Việc ẩn một trang trên giao diện không thay thế kiểm tra phía máy chủ.
4. PWA chỉ cung cấp bộ nhớ đệm cho phần vỏ ứng dụng. Không có nhà cung cấp đồng bộ từ xa.
5. Tệp sao lưu, thư mục sao lưu, điểm khôi phục và báo cáo chốt là các cơ chế khác nhau; xem [mục 23](#vi-23).

<a id="vi-02"></a>
## 2. Yêu cầu và khởi động

Yêu cầu Node.js 20 trở lên.

1. Mở terminal tại thư mục dự án.
2. Chạy `npm start`.
3. Mở `http://127.0.0.1:3000` trong Chrome, Edge hoặc Safari hiện hành.
4. Giữ terminal và tiến trình máy chủ hoạt động trong suốt thời gian sử dụng.

Không mở trực tiếp `frontend/index.html`. Cách đó bỏ qua API có xác thực nên đăng nhập và dữ liệu nghiệp vụ không hoạt động đúng.

Máy chủ mặc định lắng nghe tại `127.0.0.1:3000`. Người quản trị triển khai có thể thay đổi bằng `HOST` và `PORT`; có thể đổi vị trí SQLite bằng `SQLITE_FILE`. `DATA_FILE` và `AUTH_FILE` chỉ là nguồn nhập JSON cũ khi khởi tạo SQLite trống.

<a id="vi-03"></a>
## 3. Lần chạy đầu và tài khoản root

Khi SQLite chưa có tài khoản hiện hữu hoặc được nhập, màn hình đầu tiên yêu cầu tạo root.

1. Nhập tên trường đầu tiên nếu hệ thống chưa có trường.
2. Nhập tên hiển thị của root.
3. Chọn tên đăng nhập hợp lệ và nhập mật khẩu.
4. Nhập lại mật khẩu rồi chọn **Tạo tài khoản root**.
5. Hoàn thành trình hướng dẫn ban đầu hoặc bỏ qua từng bước để cấu hình sau trong **Thiết lập**.

Root là tài khoản `superadmin` toàn cục được bảo vệ. Không có mật khẩu mặc định hoặc mật khẩu đặt trong mã nguồn. Mật khẩu được máy chủ băm bằng `scrypt`.

Trình hướng dẫn ban đầu thực sự áp dụng tên/mã/địa chỉ trường và tên các cơ sở. Các lựa chọn năm học/ngày và tùy chọn giữ bộ tiêu chí trong onboarding chưa được áp dụng đầy đủ; hãy kiểm tra và cấu hình lại tại **Thiết lập > Cơ sở - năm học - học kỳ - tuần** và **Cấu hình thi đua**.

<a id="vi-04"></a>
## 4. Đăng nhập, khóa phiên và đăng xuất

1. Chọn trường trên màn hình đăng nhập.
2. Nhập tên đăng nhập và mật khẩu.
3. Chọn **Đăng nhập**.
4. Theo dõi tên hiển thị và vai trò ở thanh trạng thái.

Sau ba lần đăng nhập thất bại, ứng dụng bắt đầu trì hoãn lần thử tiếp theo theo cấp số nhân, tối đa 30 giây. Mật khẩu không được trình duyệt ghi nhớ bởi ứng dụng.

Phiên máy chủ nằm trong bộ nhớ và cookie phiên là `HttpOnly`, `SameSite=Strict`, giới hạn tại `/api`; cookie có `Secure` khi máy chủ nhận diện HTTPS. Khởi động lại máy chủ làm mất các phiên đang nằm trong bộ nhớ.

Khóa tự động xảy ra sau 5, 10, 15 hoặc 30 phút không hoạt động, theo cấu hình tại **Thiết lập > Khóa phiên và bảo mật**; mặc định là 10 phút. Thời gian ở nền cũng được tính. Để khóa ngay hoặc đăng xuất:

1. Mở **Tài khoản của tôi** và chọn **Đăng xuất**; hoặc
2. Mở **Thiết lập > Khóa phiên và bảo mật** và chọn **Khóa ngay**.

Đổi mật khẩu kết thúc tất cả phiên của tài khoản đó và yêu cầu đăng nhập lại.

<a id="vi-05"></a>
## 5. Vai trò và quyền

| Vai trò | Phạm vi hiện có |
| --- | --- |
| `Superadmin` | Toàn quyền; root thuộc vai trò này; có thể tạo trường, chuyển trường trên thanh trên cùng, và quản lý `Superadmin`, `Admin`, `User` theo các giới hạn bảo vệ. |
| `Admin` | Toàn quyền trong trường đang quản lý; có thể quản lý `Admin` và `User`, nhưng không thể tạo hoặc quản lý `Superadmin`. |
| `User` | Chỉ có các trang và store được cấp quyền. `User` mới mặc định có quyền dashboard. Có thể được phân công chấm điểm cho các lớp cụ thể trong một năm học. |

Quyền của `User` có hai lớp:

1. Khóa trang như `dashboard`, `tasks` hoặc `page:tasks` quyết định trang xuất hiện trên menu.
2. Khóa API như `store:tasks:read` và `store:tasks:write` quyết định có thể đọc hoặc ghi store hay không.

Một quyền trang không tự động bảo đảm quyền đọc/ghi API. Quyền nhập/xuất dữ liệu dùng `data:import` và `data:export`. `Admin` và `Superadmin` có toàn quyền theo vai trò. Trang **Tài khoản của tôi** luôn có thể truy cập sau đăng nhập. `User` được phân công lớp có thể mở **Thi đua lớp** và chỉ chấm các lớp được giao; `Admin`/`Superadmin` quản lý mọi lớp.

<a id="vi-06"></a>
## 6. Phạm vi dữ liệu và điều hướng

Thanh bên chứa 19 trang đối với Admin/Superadmin; User chỉ thấy các trang được cấp quyền. Chọn biểu tượng menu để thu gọn/mở rộng thanh bên. Trên màn hình nhỏ, nút phạm vi mở hộp chọn ngữ cảnh.

Trang **API nội bộ** chỉ hiển thị cho Admin và Superadmin. Trang này là tài liệu tham chiếu chỉ đọc, có bộ lọc endpoint và chuyển đổi tiếng Việt/English; trang không gửi thử request để tránh thao tác ghi hoặc xóa ngoài ý muốn. Tài liệu đầy đủ nằm trong [`api.md`](api.md) của mã nguồn.

Thiết lập phạm vi trước khi nhập dữ liệu:

1. `Superadmin` chọn **Trường** nếu cần chuyển trường.
2. Chọn **Năm học**.
3. Chọn **Học kỳ** hoặc mọi học kỳ.
4. Chọn **Tuần**.
5. Chọn **Cơ sở** hoặc toàn trường.

Trang hiện tại được ghi trong phần `#` của URL, vì vậy nút Back/Forward của trình duyệt có thể đổi trang. Khi đổi trường, ứng dụng đặt lại năm, học kỳ, tuần, cơ sở, bộ tiêu chí và lựa chọn điểm rồi tải lại ngữ cảnh.

Dữ liệu có `school_year_id`, `semester_id` hoặc `campus_id` được lọc theo phạm vi tương ứng. Bản ghi `campus_id: all` xuất hiện trong mọi cơ sở. Hãy luôn kiểm tra các bộ chọn trước khi cho rằng dữ liệu bị thiếu.

<a id="vi-07"></a>
## 7. Tìm kiếm, thêm nhanh và phím tắt

**Tìm kiếm toàn cục** bắt đầu khi nhập từ hai ký tự. Nó tìm tối đa năm kết quả cho mỗi nhóm: công việc, lớp, hoạt động, kế hoạch và hồ sơ trong phạm vi hiện tại. Kết quả mở trang liên quan, không mở thẳng biểu mẫu của bản ghi.

1. Nhấn `Ctrl+K` để đặt con trỏ vào ô tìm kiếm.
2. Nhập ít nhất hai ký tự; tìm kiếm không phân biệt dấu tiếng Việt.
3. Dùng `ArrowDown`/`ArrowUp` để chọn gợi ý và `Enter` để mở.

**Thêm nhanh** chỉ hiện cho `Admin`/`Superadmin`:

1. Chọn **+ Thêm nhanh** hoặc nhấn `Ctrl+Enter` khi không có hộp thoại mở.
2. Chọn công việc, lịch hoạt động, Hoạt động Đội, ghi nhận, kế hoạch hoặc lớp học.

Các phím khác: `Escape` đóng hộp thoại; `Tab` và `Shift+Tab` được giữ trong hộp thoại; tại bảng điểm, `Enter` đi xuống cùng cột và `Shift+Enter` đi lên.

<a id="vi-08"></a>
## 8. CRUD dùng chung, bản nháp, revision và chỉ đọc

Các trang Kế hoạch, Hoạt động, Tổ chức, Rèn luyện, Khen thưởng và Thiết bị dùng quy trình CRUD chung:

1. Chọn **Thêm mới**, nhập các trường bắt buộc và chọn **Lưu**.
2. Dùng ô tìm trong trang và bộ lọc cơ sở.
3. Chọn **Sửa** để cập nhật hoặc **Xóa** để xóa mềm.
4. Chọn **Xuất CSV** để tải các cột đang được định nghĩa cho trang.

Biểu mẫu trong hộp thoại tự lưu bản nháp sau khi thay đổi. Khi mở lại cùng loại biểu mẫu trong vòng 30 ngày, có thể **Khôi phục nháp** hoặc **Bỏ nháp**. Khôi phục chỉ điền lại biểu mẫu, chưa ghi vào dữ liệu chính. Lưu thành công xóa bản nháp tương ứng.

API sở hữu metadata, nhật ký thao tác, nhật ký kiểm toán và revision. Nếu bản ghi đã thay đổi ở nơi khác, thao tác có thể báo **Xung đột dữ liệu - cần xem lại** thay vì ghi đè. Tải lại dữ liệu, đối chiếu rồi nhập lại thay đổi cần thiết.

Chỉ một thẻ trình duyệt có quyền ghi. Thẻ thứ hai ở chế độ chỉ đọc và hiển thị banner; thẻ đó có thể xem và xuất sao lưu nhưng không thể ghi. Đóng thẻ đang ghi rồi tải lại thẻ chỉ đọc để nhận quyền ghi. Năm học đã đóng cũng chỉ đọc, trừ khi quản trị viên mở quyền sửa có lý do cho phiên/thẻ hiện tại.

<a id="vi-09"></a>
## 9. Tổng quan

Trang **Tổng quan** hiển thị phạm vi đang chọn:

1. Việc hôm nay, việc đến hạn trong ba ngày và việc quá hạn.
2. Hoạt động sắp diễn ra.
3. Lớp chưa nhập đủ điểm ngày và số lớp thuộc bảng đã duyệt.
4. Tiến độ công việc, trạng thái bảng tuần, lớp đã có dữ liệu và lần sao lưu gần nhất.
5. Ba vị trí đầu của từng nhóm lớp trong xếp hạng tạm thời.

Chọn thẻ KPI để mở trang tương ứng. `Admin`/`Superadmin` có nút tạo báo cáo, thêm công việc và sao lưu ngay. Xếp hạng trên Tổng quan chỉ để theo dõi nội bộ nếu bảng chưa được duyệt.

<a id="vi-10"></a>
## 10. Hôm nay

Trang **Hôm nay** tập hợp việc chưa hoàn thành có hạn đến hôm nay hoặc bắt đầu hôm nay, lịch trong ngày, checklist trực tuần, số việc chờ phối hợp và ghi chú nhanh.

1. Đánh dấu ô cạnh công việc để chuyển sang hoàn thành 100%; bỏ dấu chuyển trạng thái về đang làm và giữ tiến độ cũ.
2. Chọn **Ghi nhận nhanh** để lưu một ghi chú, đề xuất điểm cộng/trừ hoặc việc chờ phối hợp. Ghi nhận này được lưu dạng hồ sơ nháp và không tự thay đổi bảng thi đua.
3. Nhập ghi chú nhanh rồi chọn **Lưu ghi chú**; ghi chú được lưu trong Hồ sơ.
4. Chọn **Kết thúc ngày** để xem số việc đã hoàn thành và còn lại. Hệ thống không tự đổi hạn hoặc trạng thái việc chưa xong.

Checklist trực tuần hiển thị trên trang này là checklist giao diện tạm thời; các dấu chọn của ba mục đó không được lưu thành bản ghi nghiệp vụ. Muốn checklist được lưu, tạo checklist trong một công việc.

<a id="vi-11"></a>
## 11. Kế hoạch

**Kế hoạch** quản lý kế hoạch năm học, học kỳ, tháng và tuần. Bản ghi gồm mã, tên, cấp, thời gian, mục tiêu, chỉ tiêu, căn cứ, phối hợp, nguồn lực, rủi ro, trạng thái và tiến độ.

1. Chọn **+ Thêm mới**.
2. Nhập mã, tên, cấp, ngày bắt đầu/kết thúc, mục tiêu và trạng thái.
3. Bổ sung chỉ tiêu đo được, căn cứ, phối hợp, nguồn lực và rủi ro nếu có.
4. Chọn cơ sở áp dụng rồi lưu.
5. Dùng tìm kiếm, lọc cơ sở, sửa, xóa mềm hoặc **Xuất CSV**.

Trạng thái có sẵn là dự thảo, đang thực hiện và đã kết thúc. Trang không tự tạo công việc từ kế hoạch.

<a id="vi-12"></a>
## 12. Công việc và checklist

Trang này có chế độ danh sách và Kanban, tìm kiếm, lọc trạng thái/ưu tiên, phân trang 100 việc ở danh sách và tối đa 50 thẻ đầu mỗi cột Kanban.

Tạo công việc:

1. Chọn **+ Công việc**.
2. Nhập tiêu đề, nhóm, cơ sở, ngày bắt đầu, hạn, ưu tiên, trạng thái, tiến độ và đơn vị phối hợp.
3. Nếu cần, chọn lặp hằng ngày, tuần, tháng hoặc năm và ngày kết thúc lặp.
4. Nhập checklist, mỗi dòng một mục; thêm `!` đầu dòng cho mục bắt buộc.
5. Ghi trở ngại, kết quả rồi lưu.

Không thể đặt hoàn thành nếu còn checklist bắt buộc chưa xong. Có thể sửa, nhân bản hoặc xóa mềm công việc. **Thư viện mẫu** thêm các công việc tham khảo với hạn sau bảy ngày; hãy sửa lại trước khi dùng.

Công việc lặp được sinh khi `Admin`/`Superadmin` mở ứng dụng, không phải bởi bộ lập lịch nền. Checklist của mẫu lặp được sao chép với trạng thái chưa hoàn thành. Tùy chọn **Mẫu công việc dùng chung** trong hộp tạo năm học hiện chưa được xử lý; nó không sao chép mẫu.

<a id="vi-13"></a>
## 13. Lịch hoạt động

Lịch hiển thị lưới tháng từ thứ Hai đến Chủ nhật.

1. Dùng mũi tên để đổi tháng hoặc chọn **Hôm nay**.
2. Chọn **+ Sự kiện**; nhập tên, ngày, giờ, địa điểm, người phụ trách, cơ sở, số giờ nhắc trước và checklist an toàn.
3. Chọn một sự kiện trên lịch để sửa hoặc xóa mềm.
4. Chọn **In lịch** để dùng hộp thoại in của trình duyệt.

Nếu thiếu địa điểm, phụ trách hoặc checklist an toàn, ứng dụng vẫn lưu nhưng hiển thị cảnh báo. Trường nhắc trước chỉ được lưu; hiện không có thông báo nền được lập lịch từ trường này.

<a id="vi-14"></a>
## 14. Thi đua lớp và xếp hạng nhóm độc lập

### Chuẩn bị

1. Trong **Thiết lập**, tạo lớp và nhóm lớp; mỗi lớp thuộc tối đa một nhóm trong năm học.
2. `Admin`/`Superadmin` mở **Bộ tiêu chí**, tạo bộ quy tắc, danh mục và nội dung cộng/trừ; đặt bộ đang áp dụng.
3. Bộ đã phát sinh bảng tuần bị khóa cấu trúc. Muốn thay đổi, nhân bản thành phiên bản mới.
4. Nếu dùng `User`, chọn **Phân công chấm điểm** và giao mỗi lớp cho tối đa một `User`.

### Nhập điểm

1. Chọn đúng năm, học kỳ, tuần, cơ sở và bộ tiêu chí.
2. `Admin`/`Superadmin` chọn **Khởi tạo bảng tuần**.
3. Chọn ngày từ thứ Hai đến thứ Sáu.
4. Với tiêu chí trực tiếp, nhập số, `ĐẠT`/`KHÔNG ĐẠT`, `KAD`/`N/A`, hoặc `MIỄN`; nhập `0` nghĩa là đã có dữ liệu bằng không, còn ô trống là chưa nhập.
5. Với danh mục sự việc, chọn **Thêm ghi nhận**, nhập người được ghi nhận và nội dung đã cấu hình; điểm được tính tự động.
6. Có thể dán vùng ô từ Excel vào các tiêu chí trực tiếp; ô danh mục sự việc bị bỏ qua.
7. **Hoàn tác** chỉ hoàn tác thay đổi điểm gần nhất trong phiên và không hoạt động sau khi duyệt/khóa.

Điểm tuần bằng điểm chuẩn một lần cộng tổng điều chỉnh thứ Hai đến thứ Sáu khi công thức là `base`; công thức `sum` cộng các thành phần, và dữ liệu cũ có thể dùng `weighted`. `KAD` và `MIỄN` được tính là đã nhập nhưng không cộng điểm.

### Duyệt, khóa và xếp hạng

1. Chuyển `draft` sang `complete` chỉ khi mọi lớp/ngày/tiêu chí đều có dữ liệu, `KAD` hoặc `MIỄN`.
2. Gửi kiểm tra: `complete` sang `review`.
3. Duyệt: `review` sang `approved`; ứng dụng lưu snapshot xếp hạng.
4. Khóa: `approved` sang `locked`; ứng dụng tạo điểm khôi phục bảo vệ, snapshot tiêu chí và snapshot xếp hạng.
5. Muốn sửa bảng khóa, nhập lý do tối thiểu năm ký tự để chuyển sang `unlocked`, sau đó gửi kiểm tra lại.

Mỗi nhóm lớp có bảng xếp hạng độc lập. Lớp chưa thuộc nhóm chỉ cạnh tranh trong nhóm **Chưa phân nhóm**. Điểm bằng nhau nhận cùng hạng trong nhóm. Trước khi duyệt, xếp hạng là tạm thời; sau duyệt/khóa, báo cáo dùng snapshot chính thức. Tab **Kiểm tra bất thường** chỉ cảnh báo thiếu dữ liệu, vượt giới hạn hoặc thiếu tham chiếu minh chứng; nó không kết luận sai phạm. Tab **Nhật ký điều chỉnh** hiển thị thay đổi điểm và trạng thái bảng.

Giới hạn: có cờ **Bắt buộc minh chứng** trong cấu hình tiêu chí và màn hình bất thường có thể cảnh báo, nhưng màn hình nhập điểm hiện không có thao tác tải minh chứng điểm. Hãy lưu tệp tại **Hồ sơ - minh chứng** và quản lý liên kết ngoài màn hình điểm; không tuyên bố rằng tệp đã được gắn vào ô điểm.

<a id="vi-15"></a>
## 15. Hoạt động Đội

Trang quản lý tên hoạt động, nhóm, chủ điểm, ngày, địa điểm, phụ trách, đối tượng/quy mô, mục tiêu, phương án an toàn/dự phòng, kết quả và trạng thái.

1. Tạo hoạt động và bắt buộc nhập tên, nhóm, ngày, địa điểm, phụ trách, phương án an toàn và trạng thái.
2. Chọn cơ sở, lưu, rồi cập nhật kết quả sau hoạt động.
3. Tìm, lọc cơ sở, sửa, xóa mềm hoặc xuất CSV.

Hoạt động Đội và sự kiện Lịch là hai store riêng; tạo ở trang này không tự tạo một sự kiện lịch.

<a id="vi-16"></a>
## 16. Tổ chức Liên đội

Trang lưu thành viên Ban Chỉ huy, Chi đội, đội nghi lễ, phát thanh măng non, đội tự quản và câu lạc bộ.

1. Nhập họ tên, mã nội bộ, lớp, đội/ban, chức vụ, nhiệm kỳ và kết quả bồi dưỡng.
2. Chọn cơ sở áp dụng rồi lưu.
3. Dùng tìm kiếm, lọc, sửa, xóa mềm và CSV.

Danh mục đội/ban có thể được quản lý tại **Thiết lập > Tổ chức Đội - phong trào**. Ngừng một mục danh mục không đổi tên dữ liệu lịch sử.

<a id="vi-17"></a>
## 17. Rèn luyện - phong trào

Trang theo dõi chương trình, chuyên hiệu, công trình và việc tốt.

1. Nhập tên chương trình/chuyên hiệu và đối tượng/lớp.
2. Bổ sung kết quả công nhận, ngày công nhận, hoạt động tham gia và minh chứng/ghi chú.
3. Chọn trạng thái đang theo dõi hoặc đã công nhận và lưu.
4. Tìm, lọc, sửa, xóa mềm hoặc xuất CSV.

Trường minh chứng ở đây là văn bản/ghi chú; nó không tự tải tệp vào kho Hồ sơ.

<a id="vi-18"></a>
## 18. Khen thưởng

Trang lưu hồ sơ khen thưởng tập thể hoặc cá nhân: loại, cấp, đối tượng, thành tích, thời gian, nội dung liên quan, trạng thái xét duyệt, quyết định và ghi chú.

1. Tạo hồ sơ ở trạng thái dự thảo, chờ duyệt hoặc đã duyệt.
2. Cập nhật số quyết định và ghi chú khi có.
3. Tìm, lọc cơ sở, sửa, xóa mềm và xuất CSV.

Danh mục loại/cấp khen thưởng được cấu hình tại **Thiết lập > Khen thưởng**. Trạng thái ở đây không tạo tệp quyết định tự động.

<a id="vi-19"></a>
## 19. Hồ sơ - minh chứng

Đây là kho tài liệu lưu metadata và dữ liệu tệp trên máy chủ qua API. Có thư mục, dạng lưới/danh sách, tìm kiếm, ghim, liên kết phân hệ, phiên bản và Thùng rác.

Tải và quản lý tệp:

1. Chọn thư mục hoặc tạo thư mục mới.
2. Chọn **+ Tải tệp**, kéo thả nhiều tệp hoặc dán ảnh từ clipboard.
3. Ứng dụng làm sạch tên, kiểm tra phần mở rộng, giới hạn dung lượng và SHA-256; tệp trùng cần xác nhận.
4. Chọn **Mở** để xem ảnh, PDF hoặc văn bản; định dạng Office/ZIP phải tải xuống để mở bằng ứng dụng phù hợp.
5. Chọn **Sửa** để đổi tên, thư mục, ngày, số hiệu, đơn vị ban hành, thẻ, mô tả, ghim và liên kết tới plans, tasks, calendar, activities, scores, commendations, programs, equipment hoặc reports.
6. Chọn **Thay phiên bản** để lưu bản mới; bản cũ được lưu trữ và vẫn có thể tải xuống.

Xóa chuyển tài liệu và tệp liên quan vào Thùng rác. **Khôi phục** đưa chúng trở lại. **Xóa vĩnh viễn** hiện chỉ ghi `purge_requested_at` cùng trạng thái xóa mềm; yêu cầu purge không đồng nghĩa dữ liệu nhị phân đã bị xóa vật lý ngay khỏi SQLite.

Ô **Loại tệp** (PDF/Hình ảnh/Office) hiện chưa có trình xử lý nên bộ lọc loại tài liệu không hoạt động. Tìm kiếm theo tên, số hiệu, thẻ và mô tả vẫn hoạt động. Nút **Bảo vệ lưu trữ** chỉ yêu cầu chính sách lưu bền của trình duyệt; dữ liệu tệp chính vẫn ở máy chủ.

<a id="vi-20"></a>
## 20. Thiết bị Đội

Trang kiểm kê tên, mã, nhóm, số lượng, đơn vị tính, tình trạng, nơi lưu, ngày kiểm kê, hoạt động đang sử dụng và ghi chú hư hỏng/bổ sung.

1. Tạo thiết bị với tên, mã, số lượng, đơn vị và tình trạng.
2. Cập nhật tình trạng như Tốt, Cần sửa, Hỏng hoặc Đang mượn.
3. Ghi hoạt động sử dụng và vị trí lưu.
4. Tìm, lọc, sửa, xóa mềm hoặc xuất CSV.

Trang lưu trạng thái kiểm kê; không có quy trình mượn-trả theo giao dịch riêng hoặc tự động trừ số lượng.

<a id="vi-21"></a>
## 21. Báo cáo

Các loại xem trước gồm công tác tuần, thi đua lớp, tiến độ công việc, hoạt động và thiết bị.

1. Chọn loại báo cáo, A4 ngang/dọc, nơi nhận và trạng thái gửi.
2. Kiểm tra nội dung xem trước; số liệu nguồn không sửa trực tiếp tại báo cáo.
3. Chọn **In/Lưu PDF** để dùng chức năng in của trình duyệt.
4. Chọn **Lưu nháp** để lưu một phiên bản có thể tạo lại.
5. Chọn **Chốt báo cáo**, xác nhận đã đối chiếu; phiên bản chốt lưu HTML/text tĩnh, bộ lọc, checksum, cấu hình và trở thành bất biến.
6. Nếu nguồn thay đổi sau khi chốt, tạo phiên bản mới thay vì sửa bản cũ.
7. **Gói báo cáo chốt** tạo `.tptbackup` gồm báo cáo chốt và tệp đính kèm liên quan đang có trong năm.

Xếp hạng chính thức chỉ xuất hiện khi bảng tuần đã duyệt hoặc khóa. **Xuất CSV** có dữ liệu xếp hạng riêng chỉ cho loại thi đua; với mọi loại không phải thi đua, triển khai hiện tại xuất bảng công việc. Vì vậy CSV của hoạt động, thiết bị hoặc báo cáo tuần không phản ánh đúng phần xem trước tương ứng; dùng In/Lưu PDF hoặc CSV riêng trên trang nguồn.

<a id="vi-22"></a>
## 22. Trợ lý tổng hợp

Trợ lý là bộ quy tắc cục bộ trên dữ liệu đã lưu, không phải dịch vụ AI từ xa. Nó không tự sửa hoặc tạo số liệu.

1. Chọn câu hỏi nhanh hoặc nhập câu hỏi rồi nhấn `Enter`/chọn **Tra cứu**.
2. Có thể hỏi về việc hôm nay, quá hạn, lớp chưa nhập điểm, bất thường, báo cáo, tiến độ, hoạt động hoặc sao lưu.
3. Kiểm tra dấu thời gian và phạm vi trong câu trả lời.
4. Chọn **Mở dữ liệu nguồn** để xác minh.

Câu hỏi ngoài các mẫu từ khóa có thể trả lời rằng trợ lý chưa nhận diện được. “Tạo nháp báo cáo” chỉ tạo nội dung tóm tắt trên màn hình và liên kết đến Báo cáo; nó không tự lưu một bản báo cáo.

<a id="vi-23"></a>
## 23. Sao lưu và khôi phục

### Các loại bảo vệ

| Loại | Nội dung |
| --- | --- |
| Tự lưu | Ghi thay đổi hiện tại vào SQLite qua API. |
| Điểm khôi phục nội bộ | Snapshot dữ liệu cấu trúc, không nhân đôi dữ liệu tệp. Mặc định giữ 7 ngày, 4 tuần, 12 tháng; snapshot bảo vệ không tự xóa. |
| Sao lưu nhanh | JSON dữ liệu/cấu hình và metadata tệp, không có dữ liệu nhị phân tệp. |
| Sao lưu đầy đủ | `.tptbackup` có toàn bộ dữ liệu tệp và SHA-256. |
| Gói năm học | `.tptbackup` lọc theo năm đang chọn và gồm dữ liệu dùng chung/tệp liên quan. |
| Báo cáo chốt | Hồ sơ nghiệp vụ bất biến, không thay thế sao lưu. |

Tạo sao lưu:

1. Mở **Sao lưu - khôi phục** và chọn **Tạo bản sao lưu**.
2. Chọn Nhanh, Đầy đủ hoặc Gói năm học.
3. Chọn tải xuống hoặc thư mục đã được cấp quyền.
4. Chọn không mã hóa hoặc AES-GCM; mật khẩu mã hóa tối thiểu tám ký tự và không có cơ chế khôi phục nếu quên.
5. Chờ thanh tiến trình hoàn tất; chỉ gói hoàn chỉnh mới được ghi nhận.
6. Di chuyển bản tải xuống ra thiết bị/vị trí an toàn và kiểm tra tên, dung lượng, checksum trong nhật ký.

Khôi phục tệp:

1. Chọn **Chọn tệp phục hồi** và mở `.json`, `.tdt` hoặc `.tptbackup`.
2. Nhập mật khẩu nếu tệp mã hóa.
3. Đọc kết quả kiểm tra định dạng, schema, APP_ID, hồ sơ trường, checksum, số tệp và xung đột.
4. Chọn **Hợp nhất** để dùng ID/revision/thời điểm và giữ bản hiện tại khi không cũ hơn, hoặc **Thay thế** để thay dữ liệu nghiệp vụ trong một giao dịch.
5. Xác nhận; ứng dụng tạo snapshot bảo vệ trước khi ghi.

Khôi phục snapshot nội bộ giữ tệp đính kèm hiện tại vì snapshot không chứa blob. Thư mục sao lưu chỉ hoạt động trên trình duyệt có `showDirectoryPicker`; handle/quyền thư mục không được API lưu bền vì `FileSystemHandle` bị loại khi gửi lên máy chủ. Do đó sau tải lại hoặc trên thiết bị khác có thể phải chọn/cấp lại thư mục. Sao lưu thư mục theo lịch và snapshot định kỳ chỉ được kiểm tra khi ứng dụng đang mở và người quản trị đăng nhập; không chạy nền đáng tin cậy khi PWA đã đóng.

<a id="vi-24"></a>
## 24. Tài khoản của tôi

Mọi vai trò đều có trang này.

1. Sửa **Tên hiển thị** rồi lưu.
2. Tên đăng nhập, vai trò, quyền và trường chỉ do `Admin`/`Superadmin` quản lý.
3. Để đổi mật khẩu, nhập mật khẩu hiện tại, mật khẩu mới tối thiểu 10 ký tự và nhập lại.
4. Sau khi đổi, đăng nhập lại vì mọi phiên của tài khoản đã kết thúc.
5. Chọn **Đăng xuất** để kết thúc phiên hiện tại.

<a id="vi-25"></a>
## 25. Quản lý người dùng

Trang này dành cho `Admin` và `Superadmin`.

1. `Superadmin` có thể chọn **+ Thêm trường**, sau đó chuyển trường bằng bộ chọn trên thanh trên cùng.
2. Chọn **+ Thêm người dùng**; tên đăng nhập dài 3-32 ký tự, chỉ gồm chữ thường ASCII, số, `.`, `_`, `-`; mật khẩu tối thiểu 10 ký tự.
3. Chọn vai trò và nhập các khóa quyền cách nhau bằng dấu phẩy cho `User`.
4. Sửa tên, mật khẩu, vai trò, quyền hoặc khóa tài khoản.
5. Xóa tài khoản khi cần; không thể xóa tài khoản đang đăng nhập.

Root không thể đổi vai trò hoặc bị xóa; giao diện chỉ cho đổi tên/mật khẩu. `Admin` không thể quản lý `Superadmin`. Đổi mật khẩu hoặc khóa tài khoản thu hồi phiên; chuyển người dùng khỏi vai trò `User` hoặc khóa tài khoản cũng xóa phân công chấm điểm của họ.

<a id="vi-26"></a>
## 26. Thiết lập

**Trung tâm cấu hình** có 14 tab:

1. **Thông tin trường:** tên, mã, địa chỉ, người lập báo cáo, chức danh và logo PNG/JPEG/WebP tối đa 2 MB.
2. **Cơ sở - năm học - học kỳ - tuần:** thêm/sửa/xóa cơ sở chưa dùng; quản lý vòng đời năm học.
3. **Lớp và giáo viên chủ nhiệm:** thêm lớp, nhóm lớp và nhập CSV/dán Excel năm cột; xem trước lỗi trước khi nhập. Lớp có lịch sử điểm/xếp hạng không thể xóa, chỉ nên ngừng hoạt động.
4. **Cấu hình thi đua:** mở trình quản lý bộ quy tắc có phiên bản.
5. **Danh mục hoạt động:** loại hoạt động và loại lịch.
6. **Công việc và checklist:** nhóm, trạng thái và ưu tiên.
7. **Hồ sơ - tài liệu:** loại và trạng thái hồ sơ.
8. **Tổ chức Đội - phong trào:** nhóm, chức vụ, chương trình và chuyên hiệu.
9. **Khen thưởng:** loại và cấp.
10. **Thiết bị:** nhóm, tình trạng và đơn vị.
11. **Báo cáo và mẫu in:** loại báo cáo và mẫu.
12. **Giao diện:** A4 ngang/dọc và tùy chọn chế độ gọn. Khổ in được áp dụng; chế độ gọn hiện chỉ được lưu, chưa có thay đổi hiển thị rõ ràng.
13. **Dữ liệu - sao lưu:** mở trang sao lưu; đặt giới hạn mỗi tệp 1-250 MB và ba ngưỡng dung lượng tăng dần.
14. **Khóa phiên và bảo mật:** chọn 5/10/15/30 phút, khóa ngay và xem APP_ID/hồ sơ trường/thiết bị.

Các danh mục cấu hình cho phép tìm, thêm, sửa, nhân bản, đổi thứ tự, ngừng/bật và khôi phục mẫu. Mục ngừng dùng không xuất hiện khi tạo mới nhưng tên cũ vẫn giữ trong lịch sử. Có thể xuất/nhập cấu hình JSON; hãy sao lưu trước khi nhập.

<a id="vi-27"></a>
## 27. Vòng đời năm học

Tạo năm học mới:

1. Mở **Thiết lập > Cơ sở - năm học - học kỳ - tuần** và chọn **Tạo năm học mới**.
2. Nhập tên, ngày bắt đầu và kết thúc.
3. Chọn sao chép lớp/giáo viên và bộ tiêu chí nếu cần.
4. Xác nhận; ứng dụng tạo snapshot bảo vệ, hai học kỳ, 40 tuần, đặt năm mới hiện hành, tạo ID mới cho lớp/nhóm và đưa bộ tiêu chí sao chép về dự thảo.
5. Kiểm tra các ngày tuần, lớp, nhóm và bộ tiêu chí trước khi nhập dữ liệu.

Không sao chép điểm, xếp hạng, công việc phát sinh, hoạt động hoặc báo cáo cũ. Tùy chọn **Mẫu công việc dùng chung** đang hiển thị nhưng chưa được xử lý.

Đóng năm học:

1. Hoàn tất và khóa mọi bảng thi đua.
2. Hoàn thành mọi công việc và chốt/xử lý mọi báo cáo nháp.
3. Chọn **Đóng năm đang chọn** và xác nhận đối chiếu.
4. Ứng dụng tạo snapshot bảo vệ, báo cáo tổng kết bất biến, chuyển năm sang archived/chỉ đọc, tạo gói năm học và snapshot sau đóng.
5. Lưu tệp `.tptbackup` tải xuống ở nơi độc lập.

Muốn hiệu chỉnh năm đã đóng, chọn **Mở sửa có lý do**, nhập tối thiểu 10 ký tự. Quyền chỉ tồn tại trong thẻ/phiên hiện tại và thao tác được ghi nhật ký; đóng lại quyền sau khi sửa.

<a id="vi-28"></a>
## 28. PWA và ngoại tuyến

Service worker lưu phần vỏ gồm HTML, CSS, JavaScript, logo và manifest. Với tài nguyên không thuộc `/api/`, chiến lược là thử mạng trước rồi dùng cache nếu mạng lỗi. Yêu cầu `/api/` không được cache.

1. Mở website qua HTTP/HTTPS để service worker đăng ký.
2. Dùng chức năng cài ứng dụng của trình duyệt nếu trình duyệt cung cấp.
3. Khi có bản mới, chọn **Cập nhật khi an toàn** sau khi lưu/đóng bản nháp; ứng dụng không cập nhật nếu đang lưu hoặc có bản nháp chờ.

Giới hạn ngoại tuyến là **shell-only offline**: phần vỏ có thể mở từ cache, nhưng đăng nhập, đọc/ghi CRUD, tệp và hầu hết nội dung cần API/máy chủ. Chỉ báo Ngoại tuyến nhắc rằng phải kết nối lại để đọc/ghi. Manifest hiện không khai báo `icons`, vì vậy việc cài PWA có thể dùng biểu tượng mặc định hoặc không được một số nền tảng đề xuất. Không có đồng bộ dữ liệu từ xa.

<a id="vi-29"></a>
## 29. Tệp hỗ trợ, giới hạn đã biết và xử lý sự cố

### Tệp hỗ trợ

| Mục đích | Định dạng hiện có |
| --- | --- |
| Hồ sơ/tài liệu và phiên bản | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, PNG, JPG, JPEG, WebP, ZIP. |
| Xem trực tiếp | Ảnh, PDF và văn bản; Office/ZIP tải xuống để mở ngoài. Văn bản xem trước tối đa 200.000 ký tự. |
| Logo trường | PNG, JPEG, WebP; tối đa 2 MB. |
| Phục hồi | JSON, TDT mã hóa, TPTBACKUP. |
| Nhập lớp | CSV hoặc bảng dán từ Excel gồm mã lớp, tên lớp, khối, mã cơ sở, giáo viên chủ nhiệm. |
| Nhập điểm | Vùng bảng dán từ Excel cho tiêu chí trực tiếp. |
| Xuất | CSV, JSON, TPTBACKUP; PDF qua hộp thoại In/Lưu PDF của trình duyệt. |

Giới hạn tệp tài liệu mặc định là 25 MB/tệp và có thể đổi từ 1 đến 250 MB trong Thiết lập.

### Giới hạn đã biết

1. Ngoại tuyến chỉ có phần vỏ; API và CRUD không hoạt động đầy đủ khi mất máy chủ/mạng.
2. Các lựa chọn năm học/ngày và tiêu chí trong onboarding chưa được áp dụng đầy đủ.
3. Tùy chọn sao chép mẫu công việc khi tạo năm học không được xử lý.
4. Bộ lọc loại tệp ở Hồ sơ chưa hoạt động.
5. Chế độ gọn được lưu nhưng chưa áp dụng thay đổi hiển thị rõ ràng.
6. Màn hình điểm không có chức năng tải minh chứng dù tiêu chí có cờ bắt buộc minh chứng.
7. CSV của báo cáo không phải thi đua hiện xuất dữ liệu công việc, không phải nội dung xem trước tương ứng.
8. **Xóa vĩnh viễn** tài liệu tạo yêu cầu purge/xóa mềm, không bảo đảm xóa vật lý ngay.
9. Handle/quyền thư mục không được lưu bền qua API và có thể phải cấp lại sau khi tải lại, đổi trình duyệt hoặc thiết bị.
10. Manifest không có icons.
11. Thẻ thứ hai là chỉ đọc; chỉ một thẻ có quyền ghi.
12. Bảo trì theo lịch, sinh công việc lặp, snapshot và sao lưu thư mục chỉ chạy khi ứng dụng đang mở và tài khoản quản trị đã vào ứng dụng.

### Xử lý sự cố

1. **Không mở được ứng dụng:** xác nhận Node.js 20+, chạy `npm start`, mở đúng URL HTTP và xem terminal máy chủ.
2. **401/phiên hết hạn:** đăng nhập lại; máy chủ vừa khởi động lại cũng làm mất phiên bộ nhớ.
3. **403/không có quyền:** nhờ `Admin`/`Superadmin` kiểm tra cả khóa trang lẫn quyền `store:*:read/write` hoặc `data:import/export`.
4. **Không thấy dữ liệu:** kiểm tra trường, năm, học kỳ, tuần, cơ sở và quyền User.
5. **Không lưu được:** kiểm tra banner thẻ chỉ đọc, năm đã đóng, bảng điểm đã duyệt/khóa, kết nối API và thông báo revision conflict.
6. **PWA cũ:** đóng bản nháp, chọn banner cập nhật hoặc tải lại; nếu máy chủ đổi phiên bản, giữ kết nối để tải shell mới.
7. **Không chọn được thư mục:** trình duyệt không hỗ trợ `showDirectoryPicker` hoặc quyền đã mất; dùng tải tệp xuống hoặc cấp lại thư mục.
8. **Khôi phục bị từ chối:** kiểm tra mật khẩu TDT, schema không mới hơn ứng dụng, APP_ID/hồ sơ trường và checksum; không bỏ qua cảnh báo định danh.
9. **Tệp không tải lên:** kiểm tra phần mở rộng, giới hạn MB và xác nhận khi SHA-256 trùng.
10. **Xếp hạng trống:** chọn đúng tuần/bộ tiêu chí, khởi tạo bảng, nhập dữ liệu; xếp hạng chính thức cần trạng thái approved/locked.

<a id="vi-30"></a>
## 30. Checklist vận hành ngày, tuần và cuối năm

### Hằng ngày

1. Khởi động máy chủ và đăng nhập đúng trường.
2. Kiểm tra năm, học kỳ, tuần và cơ sở.
3. Mở **Hôm nay**; xử lý việc đến hạn/quá hạn và lịch.
4. Cập nhật checklist bắt buộc, trở ngại và tiến độ trong từng công việc.
5. Nhập điểm/nghiệp vụ thứ Hai-thứ Sáu; dùng `0`, `KAD`, `MIỄN` đúng nghĩa.
6. Lưu ghi nhận nhanh nhưng nhớ rằng ghi nhận không tự đổi điểm.
7. Kiểm tra trạng thái **Đã lưu trên máy chủ** và tránh mở nhiều thẻ ghi.
8. Nếu dùng sao lưu thư mục tự động, kiểm tra quyền thư mục khi mở ứng dụng.

### Hằng tuần

1. Rà soát lớp chưa đủ điểm và tab bất thường.
2. Hoàn tất quy trình `draft > complete > review > approved > locked`.
3. Kiểm tra xếp hạng riêng từng nhóm và nhóm Chưa phân nhóm.
4. Đối chiếu công việc, hoạt động, lịch, hồ sơ và thiết bị.
5. Tạo báo cáo tuần, kiểm tra nơi nhận/trạng thái gửi, rồi chốt phiên bản phù hợp.
6. In/Lưu PDF; chỉ dùng CSV thi đua khi cần bảng xếp hạng, do giới hạn CSV ngoài thi đua.
7. Tạo ít nhất sao lưu nhanh; định kỳ tạo sao lưu đầy đủ và lưu ngoài máy chủ.
8. Xác nhận snapshot/sao lưu thực sự đã chạy khi ứng dụng mở.

### Cuối năm học

1. Kiểm tra mọi bảng thi đua đã khóa.
2. Hoàn thành mọi công việc còn mở.
3. Chốt hoặc xử lý mọi báo cáo nháp.
4. Kiểm tra lớp, nhóm lớp, hồ sơ, phiên bản tệp và báo cáo chốt.
5. Tạo sao lưu đầy đủ độc lập trước khi đóng năm.
6. Chọn **Đóng năm**, lưu gói `.tptbackup` và ghi lại checksum.
7. Thử đọc tệp sao lưu trên thiết bị/vị trí khác trước khi bàn giao.
8. Tạo năm mới; kiểm tra 40 tuần, học kỳ, lớp/nhóm và bộ tiêu chí sao chép.
9. Không dựa vào tùy chọn sao chép mẫu công việc; thêm lại mẫu từ Thư viện mẫu khi cần.
10. Giữ năm cũ chỉ đọc; chỉ mở sửa có lý do và đóng quyền ngay sau hiệu chỉnh.

### Xóa dữ liệu thi đua

Chỉ Admin/Superadmin có thể xóa dữ liệu thi đua. **Xóa bảng tuần** yêu cầu nhập `XÓA BẢNG TUẦN`, sau đó xóa toàn bộ điểm và snapshot xếp hạng của tuần đang chọn cho mọi lớp. **Xóa bộ tiêu chí** có hai lần xác nhận: `XÓA BỘ TIÊU CHÍ` và `XÓA TOÀN BỘ DỮ LIỆU LIÊN QUAN`; thao tác này xóa cả lịch sử bảng tuần dùng bộ đó. Nhật ký kiểm toán vẫn được giữ.

Tài khoản **Teacher** chỉ mở trang **Lớp chủ nhiệm** và **Tài khoản của tôi**. Teacher xem xếp hạng chính thức và các ghi nhận có tên của lớp được giao theo tuần, rồi chọn **In/Lưu PDF** để tạo bản in dễ đọc.

---
## English

<a id="en-01"></a>
## 1. Introduction and scope

The website manages youth-team work, tasks, class competition, documents, and reports for one or more schools. Each login session is tied to a selected school; the academic year, semester, week, and campus selectors further narrow the displayed data.

Important principles:

1. Primary CRUD data is read and written through the authenticated API, not a browser database.
2. The server stores business data and accounts in `data/database.sqlite` by default.
3. The API checks permissions, revisions, school scope, and business locks. Hiding a UI page is not a substitute for server authorization.
4. The PWA caches only the application shell. There is no remote synchronization provider.
5. Backup files, backup directories, restore points, and finalized reports serve different purposes; see [section 23](#en-23).

<a id="en-02"></a>
## 2. Requirements and startup

Node.js 20 or newer is required.

1. Open a terminal in the project directory.
2. Run `npm start`.
3. Open `http://127.0.0.1:3000` in a current Chrome, Edge, or Safari browser.
4. Keep the terminal and server process running while the site is in use.

Do not open `frontend/index.html` directly. Doing so bypasses the authenticated API, so login and business data will not work correctly.

The server listens on `127.0.0.1:3000` by default. A deployment administrator can override this with `HOST` and `PORT`, and can move SQLite with `SQLITE_FILE`. `DATA_FILE` and `AUTH_FILE` are legacy JSON import sources used only when initializing an empty SQLite database.

<a id="en-03"></a>
## 3. First run and the root account

When SQLite contains no existing or imported account, the first screen requires root setup.

1. Enter the first school name if the system has no school.
2. Enter the root display name.
3. Choose a valid username and enter a password.
4. Confirm the password and select **Create root account**.
5. Complete the onboarding wizard or skip steps and configure them later in **Settings**.

Root is the protected global `superadmin` account. There is no default or source-defined password. The server hashes passwords with `scrypt`.

Onboarding actually applies the school name/code/address and campus names. Its academic-year/date choices and keep-criteria option are not fully applied; verify and configure them under **Settings > Campus - academic year - semester - week** and **Competition configuration**.

<a id="en-04"></a>
## 4. Login, session lock, and logout

1. Select a school on the login screen.
2. Enter the username and password.
3. Select **Login**.
4. Check the display name and role in the status area.

After three failed logins, the application starts delaying subsequent attempts exponentially, up to 30 seconds. The application does not ask the browser to remember the password.

Server sessions are held in memory. The session cookie is `HttpOnly`, `SameSite=Strict`, and restricted to `/api`; it is marked `Secure` when HTTPS is recognized. Restarting the server removes in-memory sessions.

Automatic lock occurs after 5, 10, 15, or 30 inactive minutes as configured under **Settings > Session lock and security**; the default is 10 minutes. Time spent in the background counts. To lock immediately or log out:

1. Open **My account** and select **Logout**; or
2. Open **Settings > Session lock and security** and select **Lock now**.

Changing a password ends all sessions for that account and requires a new login.

<a id="en-05"></a>
## 5. Roles and permissions

| Role | Implemented scope |
| --- | --- |
| `Superadmin` | Full access; root has this role; can create schools, switch schools from the top bar, and manage `Superadmin`, `Admin`, and `User` accounts subject to protection rules. |
| `Admin` | Full access within the current school; can manage `Admin` and `User` accounts but cannot create or manage a `Superadmin`. |
| `User` | Limited to granted pages and stores. A new `User` defaults to dashboard permission. A `User` can be assigned specific classes to score for an academic year. |

`User` access has two layers:

1. Page keys such as `dashboard`, `tasks`, or `page:tasks` determine whether a page appears in navigation.
2. API keys such as `store:tasks:read` and `store:tasks:write` determine whether the store can be read or written.

A page permission alone does not guarantee API read/write permission. Data import/export uses `data:import` and `data:export`. `Admin` and `Superadmin` have full role-based access. **My account** is always available after login. An assigned `User` can open **Class competition** and score only assigned classes; `Admin`/`Superadmin` manage all classes.

<a id="en-06"></a>
## 6. Data scope and navigation

The sidebar contains 19 pages for Admin/Superadmin; a User sees only granted pages. Use the menu icon to collapse or expand it. On small screens, the context button opens the scope selectors.

The **Private API** page is visible only to Admin and Superadmin. It is a read-only reference with endpoint filters and a Vietnamese/English toggle; it intentionally has no request executor, preventing accidental writes or deletion. The complete reference is available in the source repository as [`api.md`](api.md).

Set scope before entering data:

1. A `Superadmin` selects the **School** when switching schools is needed.
2. Select the **Academic year**.
3. Select a **Semester** or all semesters.
4. Select a **Week**.
5. Select a **Campus** or the whole school.

The current page is stored in the URL hash, so browser Back/Forward can change pages. Switching schools resets the year, semester, week, campus, criteria set, and score selection before loading the new context.

Data carrying `school_year_id`, `semester_id`, or `campus_id` is filtered by that scope. A record with `campus_id: all` appears for every campus. Always check the selectors before assuming data is missing.

<a id="en-07"></a>
## 7. Search, quick add, and shortcuts

**Global search** begins at two characters. It returns up to five results from each of tasks, classes, activities, plans, and documents in the current scope. A result opens the relevant page, not the record form directly.

1. Press `Ctrl+K` to focus search.
2. Enter at least two characters; Vietnamese accent marks are ignored.
3. Use `ArrowDown`/`ArrowUp` and press `Enter` to open a suggestion.

**Quick add** is shown only to `Admin`/`Superadmin`:

1. Select **+ Quick add** or press `Ctrl+Enter` when no dialog is open.
2. Choose a task, calendar event, activity, incident note, plan, or class.

Other keys: `Escape` closes a dialog; `Tab` and `Shift+Tab` remain trapped inside an open dialog; in the score grid, `Enter` moves down the same column and `Shift+Enter` moves up.

<a id="en-08"></a>
## 8. Shared CRUD, drafts, revisions, and read-only behavior

Plans, Activities, Organization, Programs, Commendations, and Equipment use a shared CRUD workflow:

1. Select **Add new**, complete required fields, and select **Save**.
2. Use in-page search and the campus filter.
3. Select **Edit** to update or **Delete** to soft-delete.
4. Select **Export CSV** to download the columns defined for that page.

Dialog forms auto-save a draft after changes. When the same form type is reopened within 30 days, choose **Restore draft** or **Discard draft**. Restoring only fills the form and does not write primary data. A successful save clears the corresponding draft.

The API owns metadata, operation/audit journals, and revisions. If a record changed elsewhere, the write may report a **Data conflict - review required** rather than overwrite it. Reload, compare, and re-enter the intended change.

Only one browser tab receives write access. A second tab is read-only and displays a banner; it can view data and export a backup but cannot write. Close the writer tab and reload the read-only tab to acquire write access. An archived academic year is also read-only unless an administrator enables a reasoned edit override for the current session/tab.

<a id="en-09"></a>
## 9. Dashboard

The **Dashboard** shows the current scope:

1. Tasks due today, due within three days, and overdue.
2. Upcoming activities.
3. Classes missing daily scores and classes in an approved sheet.
4. Task progress, weekly-sheet status, classes with data, and latest backup time.
5. The top three positions from each class group's temporary ranking.

Select a KPI to open the related page. `Admin`/`Superadmin` also see report, task, and backup actions. Dashboard rankings are internal-only when the sheet is not approved.

<a id="en-10"></a>
## 10. Today

**Today** combines incomplete tasks due by today or starting today, today's calendar, a duty checklist, waiting-task count, and quick notes.

1. Check a task to mark it done at 100%; uncheck it to return to doing while retaining its previous progress.
2. Select **Quick incident** to save a note, proposed score adjustment, or coordination item. It is saved as a draft document and does not automatically change competition scores.
3. Enter a quick note and select **Save note**; it is stored in Documents.
4. Select **Finish day** to view completed and outstanding counts. The system does not automatically change unfinished task dates or statuses.

The three duty-checklist boxes on this page are temporary UI controls and are not persisted as business records. For a persistent checklist, add checklist items to a task.

<a id="en-11"></a>
## 11. Plans

**Plans** manages year, semester, month, and week plans. Records include code, name, level, dates, objectives, measurable targets, basis, coordination, resources, risks, status, and progress.

1. Select **+ Add new**.
2. Enter code, name, level, start/end dates, objectives, and status.
3. Add targets, basis, coordination, resources, and risks as needed.
4. Select the applicable campus and save.
5. Search, filter by campus, edit, soft-delete, or **Export CSV**.

Available statuses are draft, active, and finished. The page does not automatically create tasks from a plan.

<a id="en-12"></a>
## 12. Tasks and checklist

This page has list and Kanban views, search, status/priority filters, 100-task list pages, and a maximum of 50 visible cards per Kanban column.

Create a task:

1. Select **+ Task**.
2. Enter title, group, campus, start date, due date, priority, status, progress, and coordinating unit.
3. Optionally select daily, weekly, monthly, or yearly recurrence and an end date.
4. Enter one checklist item per line; prefix mandatory items with `!`.
5. Record obstacles/results and save.

A task cannot be completed while a mandatory checklist item remains unfinished. Tasks can be edited, cloned, or soft-deleted. **Template library** creates reference tasks due in seven days; edit them before use.

Recurring tasks are generated when an `Admin`/`Superadmin` opens the application, not by a background scheduler. Template checklist items are copied as incomplete. The **Shared task templates** option in the new-year dialog is currently not processed and does not copy templates.

<a id="en-13"></a>
## 13. Calendar

The calendar shows a Monday-to-Sunday month grid.

1. Use arrows to change month or select **Today**.
2. Select **+ Event** and enter title, date, time, location, leader, campus, reminder hours, and safety checklist.
3. Select an event to edit or soft-delete it.
4. Select **Print calendar** to use the browser print dialog.

If location, leader, or safety checklist is missing, the event is saved with a warning. Reminder hours are stored, but no background notification is currently scheduled from that field.

<a id="en-14"></a>
## 14. Scoring and independent group rankings

### Preparation

1. Create classes and class groups in **Settings**; a class can belong to at most one group in an academic year.
2. `Admin`/`Superadmin` opens **Criteria set**, creates a ruleset, categories, and positive/negative rules, then activates the set.
3. A set used by a weekly sheet becomes structurally locked. Clone it as a new version to make changes.
4. When using `User` graders, select **Assign graders** and assign each class to at most one `User`.

### Data entry

1. Select the correct year, semester, week, campus, and criteria set.
2. `Admin`/`Superadmin` selects **Initialize weekly sheet**.
3. Select a Monday-through-Friday date.
4. For direct criteria, enter a number, `PASS`/`FAIL` equivalents shown by the Vietnamese UI, `KAD`/`N/A`, or `MIỄN`; `0` means recorded zero while blank means missing.
5. For incident categories, select **Add incident**, enter the recognized person and configured rule; the score is calculated automatically.
6. An Excel range can be pasted into direct criteria; incident-category cells are skipped.
7. **Undo** affects only the latest score change in the current session and is unavailable after approval/locking.

With the `base` formula, weekly score is the base score once plus Monday-Friday adjustments. `sum` adds components, and legacy data may use `weighted`. `KAD` and `MIỄN` count as entered but add no points.

### Approval, locking, and ranking

1. Move `draft` to `complete` only when every class/date/criterion contains a value, `KAD`, or `MIỄN`.
2. Submit review: `complete` to `review`.
3. Approve: `review` to `approved`; a ranking snapshot is saved.
4. Lock: `approved` to `locked`; a protected restore point, criteria snapshot, and ranking snapshot are created.
5. To edit a locked sheet, enter a reason of at least five characters to move to `unlocked`, then submit it for review again.

Each class group has an independent ranking. Ungrouped classes compete only in **Ungrouped**. Equal totals share a rank within the group. Rankings are temporary before approval; approved/locked reports use the official snapshot. **Anomaly check** only warns about missing data, out-of-range values, or missing evidence references; it does not determine misconduct. **Adjustment history** lists score and sheet-status changes.

Limitation: criteria can be marked **Evidence required**, and anomaly checking can warn, but the score entry screen has no score-evidence upload action. Store files in **Documents and evidence** and manage links outside the score screen; do not treat a file as attached to a score cell.

<a id="en-15"></a>
## 15. Activities

This page manages activity name, category, theme, date, location, leader, participants/scale, objectives, safety/backup plans, result, and status.

1. Create an activity and provide the required name, category, date, location, leader, safety plan, and status.
2. Select a campus, save, and update the result after the activity.
3. Search, filter by campus, edit, soft-delete, or export CSV.

Activities and Calendar events are separate stores; creating an activity does not automatically create a calendar event.

<a id="en-16"></a>
## 16. Organization

This page stores members of youth-team command boards, ceremonial teams, school radio, self-management teams, and clubs.

1. Enter name, internal code, class, unit/team, position, term, and training result.
2. Select the applicable campus and save.
3. Search, filter, edit, soft-delete, and export CSV.

Unit/team categories can be managed under **Settings > Organization and programs**. Disabling a category does not rename historical data.

<a id="en-17"></a>
## 17. Programs

This page tracks programs, specialties, projects, and good deeds.

1. Enter the program/specialty name and target/class.
2. Add recognition result/date, participating activity, and evidence/notes.
3. Select tracking or approved status and save.
4. Search, filter, edit, soft-delete, or export CSV.

The evidence field here is text/notes; it does not upload a file to Documents automatically.

<a id="en-18"></a>
## 18. Commendations

This page stores collective or individual commendation records: award type, level, recipient, achievement, date, related item, approval status, decision, and notes.

1. Create a record as draft, review, or approved.
2. Add the decision reference and notes when available.
3. Search, filter by campus, edit, soft-delete, and export CSV.

Award type/level categories are configured under **Settings > Commendations**. A status change does not generate a decision file automatically.

<a id="en-19"></a>
## 19. Documents and evidence

This is a server-backed document library containing metadata and file data through the API. It provides folders, grid/list views, search, pinning, module links, versions, and Trash.

Upload and manage files:

1. Select or create a folder.
2. Select **+ Upload files**, drag multiple files, or paste an image from the clipboard.
3. The application sanitizes the name and checks extension, size, and SHA-256; duplicate content requires confirmation.
4. Select **Open** to preview images, PDF, or text; Office/ZIP files must be downloaded and opened in a suitable application.
5. Select **Edit** to change name, folder, date, document number, issuer, tags, description, pinning, and links to plans, tasks, calendar, activities, scores, commendations, programs, equipment, or reports.
6. Select **Replace version** to store a new version; older versions remain archived and downloadable.

Deleting moves the document and related files to Trash. **Restore** returns them. **Permanently delete** currently records `purge_requested_at` with soft-delete state; a purge request does not mean the binary data was immediately physically removed from SQLite.

The **File type** selector (PDF/Image/Office) has no active handler, so document type filtering is not currently functional. Name, number, tag, and description search works. **Protect storage** only requests the browser's persistence policy; primary file data remains on the server.

<a id="en-20"></a>
## 20. Equipment

This page inventories name, code, group, quantity, unit, condition, location, inventory date, current activity, and damage/restocking notes.

1. Create equipment with required name, code, quantity, unit, and condition.
2. Update condition such as Good, Needs repair, Broken, or Borrowed.
3. Record the using activity and storage location.
4. Search, filter, edit, soft-delete, or export CSV.

The page stores inventory status; it does not implement a separate loan transaction ledger or automatically decrement quantity.

<a id="en-21"></a>
## 21. Reports

Preview types are weekly work, class competition, task progress, activities, and equipment.

1. Select report type, A4 landscape/portrait, recipient, and submission status.
2. Review the preview; source data cannot be edited in the report.
3. Select **Print/Save PDF** to use browser printing.
4. Select **Save draft** to store a regenerable version.
5. Select **Finalize report** and confirm review; the finalized version stores static HTML/text, filters, checksum, configuration, and is immutable.
6. If source data changes later, create a new version rather than editing the finalized one.
7. **Finalized report package** creates a `.tptbackup` containing finalized reports and available attachments for the year.

Official rankings appear only when the weekly sheet is approved or locked. **Export CSV** produces ranking-specific data only for the score report; every non-score report currently exports the task table rather than its corresponding preview. For activity, equipment, or weekly output, use Print/Save PDF or the source page's CSV.

<a id="en-22"></a>
## 22. Assistant

The assistant is a local rules-based query layer over saved data, not a remote AI service. It does not modify or invent data.

1. Select a quick question or enter a query and press `Enter`/select **Query**.
2. Ask about today's work, overdue tasks, missing scores, anomalies, reports, progress, activities, or backup.
3. Check the timestamp and scope shown in the answer.
4. Select **Open source data** to verify it.

Queries outside recognized keywords may return an unrecognized-question response. “Create weekly report draft” only displays a summary and report link; it does not save a report record automatically.

<a id="en-23"></a>
## 23. Backup and restore

### Protection types

| Type | Content |
| --- | --- |
| Auto-save | Writes current changes to SQLite through the API. |
| Internal restore point | Structural-data snapshot without duplicated file blobs. Defaults retain 7 daily, 4 weekly, and 12 monthly points; protected points are not automatically deleted. |
| Quick backup | JSON data/configuration and file metadata without file binary content. |
| Full backup | `.tptbackup` with all file data and SHA-256. |
| Academic-year package | `.tptbackup` filtered to the selected year with shared data/related files. |
| Finalized report | Immutable business record, not a backup replacement. |

Create a backup:

1. Open **Backup and restore** and select **Create backup**.
2. Select Quick, Full, or Academic-year package.
3. Select browser download or an authorized directory.
4. Select plain or AES-GCM encryption; the encryption password must be at least eight characters and cannot be recovered if forgotten.
5. Wait for completion; only a complete package is recorded.
6. Move the download to a safe independent location and check name, size, and journal checksum.

Restore a file:

1. Select **Choose restore file** and open `.json`, `.tdt`, or `.tptbackup`.
2. Enter the password for an encrypted file.
3. Review format, schema, APP_ID, school profile, checksum, file count, and conflict validation.
4. Select **Merge** to compare IDs/revisions/timestamps and keep current records when not older, or **Replace** to replace business data in one transaction.
5. Confirm; a protected snapshot is created before writing.

Restoring an internal snapshot preserves current attachments because the snapshot has no blobs. Directory backup requires a browser with `showDirectoryPicker`; the directory handle/permission cannot be persisted through the API because `FileSystemHandle` is stripped during serialization. It may need to be selected/authorized again after reload or on another browser/device. Scheduled directory backup and periodic snapshots are checked only while the app is open and an administrator has entered the application; they do not run reliably in the background after the PWA closes.

<a id="en-24"></a>
## 24. My account

Every role can access this page.

1. Edit **Display name** and save.
2. Username, role, permissions, and school can only be managed by `Admin`/`Superadmin`.
3. To change password, enter the current password, a new password of at least 10 characters, and confirmation.
4. Log in again after changing it because all account sessions are ended.
5. Select **Logout** to end the current session.

<a id="en-25"></a>
## 25. User management

This page is for `Admin` and `Superadmin`.

1. A `Superadmin` can select **+ Add school**, then switch school with the top selector.
2. Select **+ Add user**; usernames are 3-32 characters using lowercase ASCII letters, digits, `.`, `_`, `-`; passwords are at least 10 characters.
3. Select a role and enter comma-separated permission keys for a `User`.
4. Edit name, password, role, permissions, or account lock status.
5. Delete an account when needed; the currently logged-in account cannot be deleted.

Root cannot change role or be deleted; the UI only permits name/password changes. An `Admin` cannot manage a `Superadmin`. Password changes or account disabling revoke sessions; changing a user away from `User` or disabling them also clears score assignments.

<a id="en-26"></a>
## 26. Settings

The **Configuration center** has 14 tabs:

1. **School information:** name, code, address, report author/title, and PNG/JPEG/WebP logo up to 2 MB.
2. **Campus - academic year - semester - week:** add/edit/delete unused campuses and manage the year lifecycle.
3. **Classes and homeroom teachers:** classes, class groups, and five-column CSV/Excel paste with preview validation. Classes with score/ranking history cannot be deleted and should be deactivated.
4. **Competition configuration:** opens versioned ruleset management.
5. **Activity categories:** activity and calendar types.
6. **Tasks and checklist:** groups, statuses, and priorities.
7. **Documents:** document types and statuses.
8. **Organization and programs:** groups, positions, programs, and specialties.
9. **Commendations:** award types and levels.
10. **Equipment:** groups, conditions, and units.
11. **Reports and print templates:** report types and templates.
12. **Appearance:** A4 landscape/portrait and compact-mode option. Paper orientation is applied; compact mode is currently stored without a visible layout effect.
13. **Data and backup:** opens Backup; sets per-file limit from 1-250 MB and three increasing storage thresholds.
14. **Session lock and security:** selects 5/10/15/30 minutes, locks now, and displays APP_ID/school profile/device identity.

Configuration categories support search, add, edit, clone, reorder, disable/enable, and restore defaults. Disabled items disappear from new forms while historical names remain. Configuration can be exported/imported as JSON; back up before importing.

<a id="en-27"></a>
## 27. Academic-year lifecycle

Create a new academic year:

1. Open **Settings > Campus - academic year - semester - week** and select **Create new academic year**.
2. Enter name, start date, and end date.
3. Select class/teacher and criteria copying as needed.
4. Confirm; the app creates a protected snapshot, two semesters, 40 weeks, marks the new year current, gives copied classes/groups new IDs, and resets copied criteria sets to draft.
5. Verify week dates, classes, groups, and criteria before data entry.

Scores, rankings, generated tasks, activities, and old reports are not copied. The visible **Shared task templates** option is not currently processed.

Close an academic year:

1. Complete and lock every competition sheet.
2. Complete every task and finalize/resolve every draft report.
3. Select **Close selected year** and confirm reconciliation.
4. The app creates a protected snapshot, immutable year-end report, archives the year as read-only, downloads a year package, and creates a post-close snapshot.
5. Store the downloaded `.tptbackup` independently.

To correct an archived year, select **Enable reasoned editing** and enter at least 10 characters. The override exists only in the current tab/session and is journaled; disable it after correction.

<a id="en-28"></a>
## 28. PWA and offline use

The service worker caches the shell: HTML, CSS, JavaScript, logo, and manifest. For non-`/api/` resources it tries the network first, then cache on network failure. `/api/` requests are never cached.

1. Open the website over HTTP/HTTPS so the service worker can register.
2. Use the browser's install command if offered.
3. When an update banner appears, select **Update when safe** after saving/closing drafts; the app refuses update while saving or while a draft is pending.

Offline support is **shell-only offline**: the shell may open from cache, but login, CRUD reads/writes, files, and most content require the API/server. The Offline indicator says reconnection is needed to read/write. The manifest currently has no `icons` declaration, so installation may use a generic icon or may not be promoted by some platforms. There is no remote data synchronization.

<a id="en-29"></a>
## 29. Supported files, known limitations, and troubleshooting

### Supported files

| Purpose | Implemented formats |
| --- | --- |
| Documents and versions | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, PNG, JPG, JPEG, WebP, ZIP. |
| Direct preview | Images, PDF, and text; Office/ZIP downloads for external opening. Text preview is capped at 200,000 characters. |
| School logo | PNG, JPEG, WebP; maximum 2 MB. |
| Restore | JSON, encrypted TDT, TPTBACKUP. |
| Class import | CSV or Excel paste containing class code, class name, grade, campus code, and homeroom teacher. |
| Score import | Excel range paste for direct criteria. |
| Export | CSV, JSON, TPTBACKUP; PDF through the browser Print/Save PDF dialog. |

The default document limit is 25 MB per file and can be configured from 1 to 250 MB.

### Known limitations

1. Offline mode provides only the shell; API and CRUD do not fully work without the server/network.
2. Onboarding academic-year/date and criteria choices are not fully applied.
3. The copy-task-templates option during year creation is not processed.
4. The document type filter is not active.
5. Compact mode is stored but not visibly applied.
6. The score screen has no evidence upload despite the evidence-required criterion flag.
7. A non-score CSV report exports task data rather than its corresponding preview.
8. **Permanently delete** records a purge request/soft deletion and does not ensure immediate physical deletion.
9. Directory handles/permissions are not persisted through the API and may require reauthorization after reload or on another browser/device.
10. The manifest has no icons.
11. A second tab is read-only; only one tab can write.
12. Scheduled maintenance, recurring-task generation, snapshots, and directory backup run only while the app is open and an administrator has entered it.

### Troubleshooting

1. **Application will not open:** verify Node.js 20+, run `npm start`, use the HTTP URL, and inspect the server terminal.
2. **401/session expired:** log in again; a server restart also removes in-memory sessions.
3. **403/no permission:** ask `Admin`/`Superadmin` to verify both page keys and `store:*:read/write` or `data:import/export`.
4. **Data appears missing:** check school, year, semester, week, campus, and User permissions.
5. **Cannot save:** check the read-only-tab banner, archived year, approved/locked score sheet, API connectivity, and revision-conflict message.
6. **Old PWA:** close drafts and use the update banner or reload; keep network access so the new shell can load.
7. **Cannot select a directory:** the browser may not support `showDirectoryPicker` or permission expired; use download or authorize it again.
8. **Restore rejected:** verify TDT password, schema not newer than the app, APP_ID/school profile, and checksum; do not ignore identity warnings.
9. **File upload rejected:** check extension, MB limit, and duplicate SHA-256 confirmation.
10. **Ranking empty:** select the correct week/set, initialize the sheet, and enter data; official rankings require approved/locked status.

<a id="en-30"></a>
## 30. Daily, weekly, and year-end operating checklists

### Daily

1. Start the server and log in to the correct school.
2. Check year, semester, week, and campus.
3. Open **Today** and process due/overdue tasks and calendar items.
4. Update mandatory checklist items, obstacles, and progress in each task.
5. Enter Monday-Friday score/business data; use `0`, `KAD`, and `MIỄN` correctly.
6. Save quick incidents, remembering that they do not automatically change scores.
7. Check **Saved on server** status and avoid multiple writer tabs.
8. If directory auto-backup is used, verify directory permission when opening the app.

### Weekly

1. Review classes with missing scores and the anomaly tab.
2. Complete `draft > complete > review > approved > locked`.
3. Verify independent rankings for every group and Ungrouped.
4. Reconcile tasks, activities, calendar, documents, and equipment.
5. Generate the weekly report, verify recipient/submission status, and finalize the appropriate version.
6. Print/Save PDF; use score CSV for rankings only because of the non-score CSV limitation.
7. Create at least a quick backup; regularly create a full backup stored away from the server.
8. Confirm snapshots/backups actually ran while the app was open.

### Academic year end

1. Verify every competition sheet is locked.
2. Complete every open task.
3. Finalize or resolve every draft report.
4. Check classes, groups, documents, file versions, and finalized reports.
5. Create an independent full backup before closing the year.
6. Select **Close year**, store the downloaded `.tptbackup`, and record its checksum.
7. Test reading the backup from another device/location before handover.
8. Create the new year and verify 40 weeks, semesters, copied classes/groups, and criteria.
9. Do not rely on copy task templates; add templates again from the Template library when needed.
10. Keep the old year read-only; enable reasoned edits only when necessary and disable the override immediately afterward.

### Competition-data deletion

Only Admin/Superadmin can delete competition data. **Delete weekly sheet** requires `XÓA BẢNG TUẦN` and removes every class score and ranking snapshot for the selected week. **Delete criteria set** requires two confirmations: `XÓA BỘ TIÊU CHÍ` and `XÓA TOÀN BỘ DỮ LIỆU LIÊN QUAN`; it also removes the history of every weekly sheet using that set. Audit history remains.

A **Teacher** account can open only **Homeroom class** and **My account**. It shows the official ranking and named incidents for the assigned class and selected week; choose **Print/Save PDF** for a readable report.
