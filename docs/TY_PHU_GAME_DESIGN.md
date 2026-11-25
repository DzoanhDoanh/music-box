# Tỷ Phú Phố Nhạc — thiết kế v3 (chờ duyệt)

Game cờ tỷ phú của ROOMTUNE, theo lối chơi các game cờ tỷ phú online quen thuộc:

- bàn 4 chặng, giá đất tăng dần theo chặng;
- bốn góc có chức năng riêng: Xuất phát, Nhà tù, lễ hội nhân đôi tiền thuê, Sân bay;
- 5 bãi biển rải trên 4 chặng (chặng 4 có 2 bãi);
- ô Cơ hội có 15 phiếu với 15 cơ chế khác nhau: tấn công, xui, có lợi và lễ hội;
- ngoài phá sản đối thủ còn ba cách **thắng ngay**: 3 monopoly, 1 dãy nhà, 4 bãi biển.

Cơ chế giữ theo thể loại. Bàn cờ, tên ô, nội dung thẻ, hình ảnh và tên gọi là thiết kế
riêng của ROOMTUNE, không sao chép game nào. Góc "World Cup" đổi tên thành
**Đại nhạc hội**: chức năng giữ nguyên, tên hợp chủ đề âm nhạc và tránh dùng nhãn hiệu
của người khác.

## 1. Tóm tắt

- 2–4 người trong phòng nhạc, nhạc vẫn phát khi chơi.
- Tiền ảo riêng của ván (đơn vị **K**), không đụng ví coin Bầu Cua.
- Kết thúc khi có người **thắng ngay** (mục 4), khi chỉ còn một người chưa phá sản, hoặc
  khi hết giờ (mặc định 45 phút; khi đó ai có tổng tài sản cao nhất thắng).
- Mỗi lượt tối đa 45 giây. Hết giờ, hệ thống tự làm thao tác an toàn (không mua, kết thúc
  lượt). Ba lượt vắng liên tiếp → hệ thống tự chơi thay.

## 2. Bàn cờ: 32 ô = 4 góc + 4 chặng × 7 ô

Hành trình đi từ **cực Bắc vào Nam**: chặng 1 là miền núi phía Bắc, chặng 2 là đồng bằng
Bắc Bộ và Bắc Trung Bộ, chặng 3 là miền Trung và Tây Nguyên, chặng 4 là miền Nam. Giá
đất tăng dần theo chặng.

Toàn bàn có 19 thành phố (7 nhóm màu), 5 bãi biển, 3 ô Cơ hội, 1 ô Thuế nhà và 4 góc.

| Ô            | Tên                                            | Loại     | Giá đất         |
| ------------ | ---------------------------------------------- | -------- | --------------- |
| 0            | **Xuất phát**                                  | Góc 1    |                 |
|              | **Chặng 1 — Miền núi phía Bắc**                |          |                 |
| 1 · 2 · 3    | Hà Giang · Cao Bằng · Lạng Sơn                 | Nhóm 1   | 60 · 60 · 70    |
| 4            | Biển Trà Cổ (Quảng Ninh)                       | Bãi biển | 200             |
| 5 · 6 · 7    | Sa Pa · Điện Biên · Mộc Châu                   | Nhóm 2   | 80 · 80 · 100   |
| 8            | **Nhà tù**                                     | Góc 2    |                 |
|              | **Chặng 2 — Đồng bằng Bắc Bộ và Bắc Trung Bộ** |          |                 |
| 9 · 10 · 11  | Hải Phòng · Hà Nội · Ninh Bình                 | Nhóm 3   | 120 · 140 · 120 |
| 12           | Cơ hội                                         | Thẻ      |                 |
| 13           | Biển Sầm Sơn (Thanh Hóa)                       | Bãi biển | 200             |
| 14 · 15      | Vinh · Đồng Hới                                | Nhóm 4   | 160 · 160       |
| 16           | **Đại nhạc hội**                               | Góc 3    |                 |
|              | **Chặng 3 — Miền Trung và Tây Nguyên**         |          |                 |
| 17 · 18      | Huế · Đà Nẵng                                  | Nhóm 5   | 180 · 200       |
| 19           | Cơ hội                                         | Thẻ      |                 |
| 20           | Biển Quy Nhơn                                  | Bãi biển | 200             |
| 21 · 22 · 23 | Nha Trang · Đà Lạt · Buôn Ma Thuột             | Nhóm 6   | 200 · 220 · 220 |
| 24           | **Sân bay**                                    | Góc 4    |                 |
|              | **Chặng 4 — Miền Nam**                         |          |                 |
| 25           | Biển Mũi Né                                    | Bãi biển | 200             |
| 26 · 27      | Vũng Tàu · Cần Thơ                             | Nhóm 7   | 260 · 260       |
| 28           | Cơ hội                                         | Thẻ      |                 |
| 29           | Biển Phú Quốc                                  | Bãi biển | 200             |
| 30           | **Thuế nhà**                                   | Thuế     |                 |
| 31           | TP. Hồ Chí Minh                                | Nhóm 7   | 400             |

**Nhóm màu = các thành phố liền kề cùng màu** (2 hoặc 3 ô nằm sát nhau):

| Nhóm | Thành phố liền kề                                | Số ô |
| ---- | ------------------------------------------------ | ---- |
| 1    | Hà Giang · Cao Bằng · Lạng Sơn                   | 3    |
| 2    | Sa Pa · Điện Biên · Mộc Châu                     | 3    |
| 3    | Hải Phòng · Hà Nội · Ninh Bình                   | 3    |
| 4    | Vinh · Đồng Hới                                  | 2    |
| 5    | Huế · Đà Nẵng                                    | 2    |
| 6    | Nha Trang · Đà Lạt · Buôn Ma Thuột               | 3    |
| 7    | Vũng Tàu · Cần Thơ                               | 2    |
| —    | TP. Hồ Chí Minh đứng riêng, không thuộc nhóm nào | 1    |

TP. Hồ Chí Minh không nằm sát thành phố nào khác, nên không tạo được monopoly. Bù lại,
đây là ô có giá đất cao nhất bàn.

**Thuế nhà (ô 30):** dừng tại đây thì trả 10% tổng giá trị tài sản đang sở hữu (đất +
nhà + khách sạn). Chưa có tài sản thì không mất gì.

**Cấp giá theo chặng:**

| Chặng | Đoạn                   | Giá đất  | Chi phí xây mỗi nhà |
| ----- | ---------------------- | -------- | ------------------- |
| 1     | Xuất phát → Nhà tù     | rẻ nhất  | 50                  |
| 2     | Nhà tù → Đại nhạc hội  |          | 100                 |
| 3     | Đại nhạc hội → Sân bay |          | 150                 |
| 4     | Sân bay → Xuất phát    | đắt nhất | 200                 |

## 3. Luật

### Lượt chơi

1. **Tung 2 xúc xắc** (server tung). Ra đôi thì tung thêm; ba lần đôi liên tiếp → vào tù.
2. **Đi quân.** Đi qua Xuất phát nhận lương **200**.
3. **Xử lý ô:**
   - **Thành phố trống:** mua đất, và có thể xây luôn nhà trong cùng lần dừng, theo giới
     hạn của vòng đang đi (mục "Xây nhà theo vòng").
   - **Thành phố của mình:** xây thêm theo giới hạn của vòng.
   - **Thành phố của người khác:** tự động trả tiền thuê. Sau đó được quyền **mua lại**
     thành phố đó với giá 1,5 × giá hiện tại, trừ khi ô đã là Khách sạn. Người bị mua lại
     buộc phải bán.
   - **Bãi biển:** mua hoặc trả tiền thuê. Bãi biển không xây được và không bị mua lại.
   - **Cơ hội:** rút 1 thẻ (mục 3.4).
   - **Thuế nhà:** trả 10% tổng giá trị tài sản.
4. **Kết thúc lượt.**

### Cấp công trình

Mỗi thành phố có 5 mức: **Đất → Cấp 1 → Cấp 2 → Cấp 3 → Khách sạn**. Khách sạn là cấp
cuối cùng. Chi phí tính theo giá đất `G` của chính ô đó:

| Mức           | Chi phí để lên mức này | Tổng giá trị ô `V` | Hệ số tiền thuê `M` |
| ------------- | ---------------------- | ------------------ | ------------------- |
| Đất           | `G` (mua đất)          | `G`                | ×1                  |
| Cấp 1         | `0,5 × G`              | `1,5 × G`          | ×4                  |
| Cấp 2         | `0,5 × G`              | `2 × G`            | ×10                 |
| Cấp 3         | `0,5 × G`              | `2,5 × G`          | ×25                 |
| **Khách sạn** | `1 × G`                | `3,5 × G`          | ×40                 |

### Xây nhà theo vòng

"Vòng" tính riêng cho từng người, bằng số lần người đó đã đi qua (hoặc dừng ở) Xuất phát.
Ai cũng bắt đầu ở **vòng 1**.

| Giai đoạn                           | Được xây tối đa |
| ----------------------------------- | --------------- |
| **Vòng 1** (chưa qua Xuất phát)     | **Cấp 2**       |
| **Vòng 2** (đã qua Xuất phát 1 lần) | **Cấp 3**       |
| **Từ vòng 3**                       | **Khách sạn**   |

Quy tắc xây:

- **Khi nào được xây:**
  - dừng đúng ô thành phố của mình;
  - ngay lúc vừa mua đất hoặc vừa mua lại ô đó;
  - hai dịp đặc biệt: dừng ở Xuất phát, và phiếu "Về nhà ăn Tết". Hai dịp này được xây
    thêm 1 cấp cho một thành phố bất kỳ của mình.
- **Lên Cấp 1 → 3:** được xây nhiều cấp liền trong một lần dừng, đến giới hạn của vòng.
  Ví dụ: vòng 1 dừng vào đất trống thì mua đất rồi xây thẳng lên Cấp 2.
- **Lên Khách sạn:** ô phải **đã ở Cấp 3 từ trước lần dừng này**, và người chơi phải ở
  vòng 3 trở lên. Không được đi thẳng từ Cấp 1 hoặc Cấp 2 lên Khách sạn trong cùng một
  lần dừng.
- **Khách sạn miễn nhiễm với mọi phiếu Cơ hội** (Hạ cấp, Xóa nhà, Ép bán, Cúp điện, Tặng
  thành phố) và **không bị mua lại**.
- Bãi biển không xây được.
- Mua lại ô có mức cao hơn giới hạn vòng của người mua thì vẫn giữ nguyên mức đó, chỉ là
  chưa xây thêm được.

### Monopoly (trọn nhóm liền kề)

- Một người sở hữu **đủ các thành phố liền kề cùng nhóm** (2 hoặc 3 ô, xem bảng nhóm ở
  mục 2) thì nhóm đó thành **monopoly**.
- Mọi ô trong monopoly được **×1,5 một lần nữa**, áp vào cả **tiền thuê** lẫn **giá ô**
  (giá mua lại và giá bán ngân hàng).
- Mất một ô trong nhóm (bị mua lại, ép bán, bán ngân hàng, tặng) thì monopoly mất ngay.
  Người vừa mua lại có thể tạo monopoly của chính mình.

### Bảng công thức tính tiền

**Ký hiệu:**

| Ký hiệu | Ý nghĩa                        | Giá trị                                                                        |
| ------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `G`     | Giá đất niêm yết của ô         | theo bảng bàn cờ                                                               |
| `V`     | Tổng giá trị ô theo mức        | `G` · `1,5G` · `2G` · `2,5G` · `3,5G` (Đất → Khách sạn)                        |
| `M`     | Hệ số mức                      | ×1 · ×4 · ×10 · ×25 · ×40 (Đất → Khách sạn)                                    |
| `K`     | Hệ số monopoly                 | ×1,5 nếu ô thuộc monopoly của chủ, không thì ×1                                |
| `H`     | Hệ số Đại nhạc hội             | ×2 nếu ô đang tổ chức, không thì ×1                                            |
| `C`     | Hệ số phiếu của người phải trả | ×2 (Bị phạt gấp đôi) · ×0,5 (Giảm giá nửa vé) · ×1 nếu không có hoặc có cả hai |
| `P`     | **Giá hiện tại của ô**         | `V × K`                                                                        |

**Các công thức:**

| Trường hợp                           | Công thức                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| 1. Mua đất chưa có chủ               | `G` (giá thẳng)                                                                   |
| 2. Tiền thuê khi người khác dừng vào | `10% × G × M × K × H × C`                                                         |
| 3. Mua lại ô của người khác          | `1,5 × P`. Chủ cũ nhận đủ và không được từ chối. Khách sạn không mua lại được.    |
| 4. Bán cho ngân hàng                 | `0,5 × P`. Chỉ khi thiếu tiền trả nợ; ô trở về ngân hàng.                         |
| 5. Bãi biển: mua                     | `200`                                                                             |
| 6. Bãi biển: tiền thuê               | `50 × số bãi chủ đang có × C` (1 bãi 50, 2 bãi 100, 3 bãi 150; có 4 bãi là thắng) |
| 7. Thuế nhà                          | `10% × tổng V của mọi ô đang sở hữu × C`                                          |

Mọi kết quả làm tròn đến số nguyên gần nhất. Không thu tiền thuê khi ô đang bị Mất
điện. Chủ đang ở tù vẫn thu tiền thuê.

**Ví dụ: Đà Lạt** (`G = 220`, thuộc nhóm 6 cùng Nha Trang và Buôn Ma Thuột), ô ở Cấp 3:
`V = 2,5 × 220 = 550`.

| Tình huống                                         | Phép tính            | Kết quả                    |
| -------------------------------------------------- | -------------------- | -------------------------- |
| Tiền thuê thường                                   | 10% × 220 × 25       | 550                        |
| Chủ có monopoly nhóm 6                             | 550 × 1,5            | 825                        |
| + đang tổ chức Đại nhạc hội                        | 825 × 2              | 1.650                      |
| + người dừng dính phiếu Phạt ×2                    | 1.650 × 2            | 3.300                      |
| Mua lại, không monopoly                            | 1,5 × 550            | 825                        |
| Mua lại, có monopoly                               | 1,5 × (550 × 1,5)    | 1.238                      |
| Bán ngân hàng, không monopoly                      | 0,5 × 550            | 275                        |
| Bán ngân hàng, có monopoly                         | 0,5 × 825            | 413                        |
| Nếu là Khách sạn (`V = 770`) + monopoly: tiền thuê | 10% × 220 × 40 × 1,5 | 1.320 (không mua lại được) |

### Đại nhạc hội

- Dừng ở góc Đại nhạc hội, hoặc rút phiếu "Được chọn đăng cai", thì chọn một thành phố
  của mình làm nơi tổ chức. Tiền thuê ô đó **×2 cố định** (hệ số `H`).
- Mỗi lúc chỉ có **một nơi tổ chức**. Tổ chức lần mới thì lễ hội chuyển sang thành phố
  mới; nơi cũ trở về ×1.
- Đại nhạc hội chỉ nhân tiền thuê, không làm đổi giá mua lại hay giá bán.
- Lễ hội **đi theo thành phố**:
  - bị mua lại thì lễ hội ở lại, người mua hưởng;
  - bị Hạ cấp hoặc Xóa nhà thì lễ hội vẫn giữ;
  - bị Ép bán, bán cho ngân hàng, hoặc chủ phá sản thì lễ hội bị hủy.

### Bốn góc

| Góc              | Chức năng                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Xuất phát**    | Đi qua nhận 200 và lên vòng mới. Dừng đúng ô này: được xây thêm 1 cấp cho một thành phố bất kỳ của mình (trả phí xây thường, theo giới hạn vòng).                                                   |
| **Nhà tù**       | Bị giữ tối đa 3 lượt. Ra tù khi tung được đôi, trả 100, hoặc dùng _Vé ra tù_. Hết 3 lượt thì bắt buộc trả 100 rồi đi. Trong tù vẫn thu tiền thuê. Dừng ở ô này do tung xúc xắc thì chỉ là ghé thăm. |
| **Đại nhạc hội** | Chọn một thành phố của mình để tổ chức: tiền thuê ô đó ×2. Trên bàn chỉ có một nơi tổ chức. Chưa có thành phố nào thì không có hiệu ứng.                                                            |
| **Sân bay**      | Lượt sau không tung xúc xắc mà chọn bay tới bất kỳ ô nào (phí 50). Bay qua Xuất phát vẫn nhận lương.                                                                                                |

### Thẻ Cơ hội

Bộ 15 phiếu dùng chung cho cả 3 ô Cơ hội. **Mỗi phiếu có một cơ chế riêng, không phiếu
nào trùng cơ chế với phiếu khác.** Server xáo bộ phiếu và giữ kín thứ tự; rút hết thì xáo
lại. Phiếu loại "giữ lại" nằm trong tay người rút và chỉ trả về bộ sau khi dùng.

**Tấn công đối thủ** (Khách sạn miễn nhiễm với cả bốn phiếu; Bảo hiểm sân khấu chặn được cả bốn):

| #   | Phiếu                       | Cơ chế   | Hiệu ứng                                                                                         |
| --- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| 1   | Bão quét qua sân khấu       | Hạ cấp   | Chọn một thành phố của đối thủ: **hạ 1 cấp** (3 nhà → 2 nhà; 1 nhà → đất trống).                 |
| 2   | Phá dỡ công trình trái phép | Xóa nhà  | Chọn một thành phố của đối thủ: **xóa sạch toàn bộ nhà**, chỉ còn đất. Chủ vẫn giữ đất.          |
| 3   | Thu hồi mặt bằng            | Ép bán   | Chọn một thành phố của đối thủ: ô **trả về ngân hàng**, chủ nhận lại 50% giá trị.                |
| 4   | Mất điện toàn khu           | Cúp điện | Chọn một thành phố của đối thủ: ô đó **không thu tiền thuê** cho đến hết 2 lượt kế tiếp của chủ. |

**Xui cho người rút:**

| #   | Phiếu               | Cơ chế         | Hiệu ứng                                                                                                              |
| --- | ------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| 5   | Quà tri ân khán giả | Tặng thành phố | Tặng một thành phố của mình (giữ nguyên nhà) cho người chơi bạn chọn.                                                 |
| 6   | Gây ồn sau 22 giờ   | Đi tù          | Vào Nhà tù ngay, không nhận lương.                                                                                    |
| 7   | Bị phạt gấp đôi     | Phạt ×2 (treo) | Lần **trả tiền thuê hoặc Thuế nhà kế tiếp** của bạn bị **nhân đôi**. Phiếu có hiệu lực ngay, áp dụng một lần rồi hết. |

**Có lợi cho người rút:**

| #   | Phiếu                    | Cơ chế               | Hiệu ứng                                                                                                                                                      |
| --- | ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Sinh nhật của bạn        | Sinh nhật            | Mỗi người chơi khác tặng bạn 50.                                                                                                                              |
| 9   | Phiếu giảm giá nửa vé    | Giảm 50% (giữ lại)   | Lần **trả tiền thuê hoặc Thuế nhà kế tiếp** của bạn chỉ phải trả **50%**. Tự động dùng.                                                                       |
| 10  | Thẻ VIP hậu trường       | Vé ra tù (giữ lại)   | Dùng khi đang ở tù để ra ngay, không mất lượt.                                                                                                                |
| 11  | Bảo hiểm sân khấu        | Lá chắn (giữ lại)    | Tự động chặn phiếu tấn công đầu tiên (1–4) nhắm vào bạn.                                                                                                      |
| 12  | Mua được vé Đại nhạc hội | Đến nơi tổ chức      | Đi tới thành phố đang tổ chức Đại nhạc hội (đi qua Xuất phát vẫn nhận lương; trả tiền thuê nếu ô của người khác). Chưa có nơi tổ chức → tới góc Đại nhạc hội. |
| 13  | Được chọn đăng cai       | Tổ chức Đại nhạc hội | Chọn ngay một thành phố của mình làm nơi tổ chức (tiền thuê ×2).                                                                                              |
| 14  | Vé máy bay giá rẻ        | Ra sân bay           | Đi thẳng tới góc Sân bay; lượt sau được bay tới ô bất kỳ, miễn phí bay.                                                                                       |
| 15  | Về nhà ăn Tết            | Về Xuất phát         | Đi thẳng về Xuất phát, nhận lương 200 và được xây thêm 1 cấp như khi dừng ở Xuất phát.                                                                        |

**Quy tắc chung:**

- Không có mục tiêu hợp lệ thì phiếu không có tác dụng. Ví dụ: rút phiếu tấn công khi
  đối thủ chưa có thành phố, hoặc rút Tặng thành phố khi bạn chưa có thành phố.
- Mỗi người giữ tối đa 1 phiếu mỗi loại "giữ lại".
- Phạt ×2 và Giảm 50% cùng chờ trên một người thì triệt tiêu nhau: lần trả kế tiếp
  tính đúng 100%. Bảo hiểm sân khấu không chặn Phạt ×2 vì đó không phải phiếu tấn công.
- Người rút có 20 giây để chọn mục tiêu. Hết giờ thì hệ thống tự chọn: phiếu tấn công
  nhắm vào ô có tiền thuê cao nhất của đối thủ; phiếu xui chọn ô rẻ nhất của mình và
  người chơi nghèo nhất.

## 4. Điều kiện thắng

Kiểm tra ngay sau mỗi giao dịch. Ai đạt **một trong các điều kiện** sau trước thì thắng,
ván kết thúc tại đó.

1. **3 monopoly:** sở hữu cùng lúc 3 monopoly (3 nhóm liền kề trọn vẹn) bất kỳ.
2. **1 dãy nhà:** sở hữu toàn bộ thành phố trên một chặng. Chặng 1 cần 6 thành phố, chặng
   2 và 3 cần 5 thành phố, chặng 4 cần 3 thành phố (Vũng Tàu, Cần Thơ, TP. Hồ Chí Minh).
   Bãi biển không bắt buộc.
3. **4 bãi biển:** sở hữu 4 trong 5 bãi biển.

Điều kiện dự phòng, để ván không kéo dài vô hạn:

4. **Người trụ lại cuối cùng:** mọi đối thủ đã phá sản hoặc đầu hàng.
5. **Hết giờ:** người có tổng tài sản cao nhất thắng. Tổng tài sản = tiền mặt + tổng
   `P` các ô đang sở hữu.

**Nợ và phá sản:** không đủ tiền trả thì bán ô cho ngân hàng (`0,5 × P`) cho tới khi
đủ. Bán hết vẫn thiếu → phá sản: tiền còn lại về chủ nợ, quân rời bàn và toàn bộ ô của
người đó trả về ngân hàng.

**Tiền khởi đầu:** 2.000 (chủ bàn chỉnh trong khoảng 1.500–3.000).

Các con số (lương, giá, bội số) sẽ được cân lại bằng mô phỏng 1.000 ván, để ván 2–4
người thường kết thúc trong 20–40 phút.

## 5. Kiến trúc (theo khuôn Cờ cá ngựa / Đua Vịt)

| Phần                   | Vị trí                                                        | Ghi chú                                                                                                                        |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Luật thuần, dùng chung | `src/shared/ty-phu/{board,contracts,engine,cards}.ts`         | `transition(state, actor, command, rng)` không có tác dụng phụ; kiểm thử bằng Vitest                                           |
| Server                 | `src/server/services/ty-phu.ts`, `/api/v1/rooms/:id/ty-phu/*` | Xúc xắc và xáo bài bằng `crypto.getRandomValues`; kiểm tra lượt, phiên bản, quyền                                              |
| Database               | `supabase/migrations/2026112xxxxx_ty_phu.sql`                 | Ván (state jsonb + version), bộ bài kín ở schema private, receipts chống gửi trùng, sự kiện, kết quả; RLS chỉ thành viên phòng |
| Realtime               | kênh phòng hiện có                                            | Phát `ty-phu.updated`; client tự lấy lại snapshot                                                                              |
| Hết lượt / hết giờ     | cơ chế `*_due` như Ludo                                       | Tự xử lý khi có người đọc hoặc khi Worker chạy theo lịch                                                                       |
| Client                 | `src/client/components/ty-phu/*`, `src/client/lib/ty-phu.ts`  | Bàn 2D (CSS grid 9×9) trước, 3D để sau                                                                                         |
| Bật/tắt                | `ENABLE_TY_PHU`, `VITE_ENABLE_TY_PHU`                         | Mặc định tắt đến khi phát hành                                                                                                 |
| Đường dẫn              | `/room/:id/games/ty-phu/:match?`                              | Cập nhật regex ingress trong `cloudflared.roomtune.yml`                                                                        |
| Màn chọn game          | thẻ thứ 4 trong `GamePicker`                                  |                                                                                                                                |

## 6. Giao diện

- **Desktop:** bàn vuông ở giữa; bốn chặng có màu nền khác nhau để thấy cấp giá. Phần
  giữa bàn hiện xúc xắc, người tới lượt, đồng hồ, nút chính và nhật ký. Cột phải là
  người chơi kèm **tiến độ thắng** (ví dụ "2/4 bãi biển", "Nhóm: 2/3", "Dãy chặng 4: 2/3").
- **Điện thoại:** bàn co theo chiều ngang, chụm để phóng to. Thanh hành động cố định ở
  đáy. Thẻ đất và chọn mục tiêu thẻ mở dạng bottom sheet.
- Hiệu ứng nổi bật: thẻ Cơ hội lật ra; Phá nhà và Ép bán có hiệu ứng trên ô bị nhắm; ô
  đang tổ chức Đại nhạc hội có ánh đèn sân khấu; bay từ Sân bay; cảnh báo khi một người
  còn 1 bước là thắng.
- Âm thanh ngắn, mặc định tắt, không ảnh hưởng nhạc phòng. Tôn trọng chế độ giảm chuyển
  động.

## 7. Lộ trình

**Tiến độ:** bước 1 đã xong (25/11/2026). Engine nằm trong `src/shared/ty-phu/`, test
trong `tests/unit/ty-phu.test.ts` (27 ca).

Mô phỏng 1.000 ván do bot chơi ngẫu nhiên (2–4 người):

- Mọi ván đều kết thúc, tổng tiền luôn khớp.
- Trung vị 194 thao tác mỗi ván, 90% số ván dưới 355 thao tác.
- Phân bố cách thắng: người trụ lại cuối cùng 37%, 4 bãi biển 32%, 1 dãy nhà 21%,
  3 monopoly 9%, hết giờ 1%.

Bản đầu, khi thiếu tiền, hệ thống tự bán ô rẻ nhất cho ngân hàng.

1. **Engine + test:** bàn cờ, luật, 8 loại thẻ, mua lại, 5 điều kiện thắng, nợ/phá sản,
   hết giờ; mô phỏng 1.000 ván để chắc ván không kẹt và tổng tiền luôn khớp.
2. **Database + API:** migration, service, route; test database thật cục bộ.
3. **Giao diện 2D:** sảnh, bàn cờ, hành động, chọn mục tiêu thẻ, mobile; E2E.
4. **Hoàn thiện:** hiệu ứng, âm thanh, trợ năng, thẻ trong màn chọn game; phát hành.
5. **Để sau:** đổi/bán đất giữa người chơi, bàn 3D, thẻ gắn với nhạc phòng.

## 8. Còn cần chốt

- Mua lại (1,5 × giá hiện tại): bật mặc định như thiết kế, hay để chủ bàn tự bật?
- Thời lượng mặc định 45 phút có hợp không?
