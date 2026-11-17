# Cờ cá ngựa ROOMTUNE — bộ luật v2

Ngày 17/11/2026: đã triển khai engine, bàn cờ và giao diện chọn nước cho v2 trong source.
Bản public vẫn chạy bản đã phát hành trước đó; migration v2 chưa áp dụng lên Supabase hosted.

Đây là biến thể ROOMTUNE, không khẳng định là bộ luật duy nhất của cờ cá ngựa. Theo xác nhận
của người dùng: ra 1 có thể nhảy cửa chuồng khi đường trống; không vượt quân cản; đối thủ cách
3 ô thì ra 2 được đi, ra 3 đá, ra 4–6 bị chặn. Ô cuối vòng chính là cửa lên chuồng; ô tiếp theo
trên đường chung là ô xuất quân. Các mặc định còn lại được ghi rõ bên dưới.
Xem [kết quả rà soát và kiểm thử](GAME_RULES_AUDIT.md).

## 1. Bàn cờ, quân và mục tiêu

- Từ 2 đến 4 người, mỗi người chọn một màu và có 4 ngựa. Dùng 1 xúc xắc sáu mặt.
- Bàn cờ v2 có 56 ô đường chung, bốn cửa chuồng cách đều nhau; mỗi màu có dãy
  chuồng riêng gồm bậc 1 đến 6. Mọi quân đi cùng chiều mũi tên được vẽ trên bàn.
- **Nhà chờ** là nơi để ngựa chưa xuất hoặc vừa bị đá.
- **Ô xuất phát** là ô đường chung ngựa được đặt vào khi ra quân.
- **Cửa chuồng** là ô đường chung tại lối vào dãy chuồng của một màu, ngay trước ô xuất phát
  theo chiều đi. Cửa chuồng khác ô xuất phát và khác bậc 1 trong chuồng.
- Ngựa đi quanh đường chung từ ô xuất phát tới cửa chuồng của chính mình, rồi vào chuồng.
  Chỉ được đi một vòng; không đi vòng thứ hai hoặc vào chuồng của màu khác.
- Mục tiêu là đưa bốn ngựa vào bốn ô khác nhau: **6, 5, 4, 3** trong chuồng cùng màu.

Cách bố trí cửa, đường 56 ô và mục tiêu 3–6 có trong một biến thể do
[BGVN mô tả](https://boardgamevui.com/cangua/huong-dan/). Đây là lựa chọn bàn cho v2;
không dùng con số 52 của bàn Ludo hiện tại làm quy ước chung cho mọi bộ cờ cá ngựa.

## 2. Lượt chơi và ra quân

- Hệ thống chọn ngẫu nhiên người đi đầu khi bắt đầu ván. Những người còn lại đi
  lần lượt theo vị trí màu trên bàn; thứ tự này cố định trong ván.
- Mỗi lần tung, chọn đúng **một hành động với một quân**: xuất quân, đi thường, nhảy cửa
  chuồng, vào chuồng hoặc lên một bậc chuồng. Không dùng cùng kết quả cho hai hành động.
- Mặc định **ra 6 được xuất một quân** từ nhà chờ tới ô xuất phát; không đi tiếp sáu ô
  bằng cùng kết quả đó. Người chơi có thể chọn đi quân đang ở ngoài thay vì xuất thêm quân.
- Ô xuất phát phải trống mới xuất được: có ngựa mình hoặc đối thủ đều chặn xuất.
  Không có ngoại lệ tự đá đối thủ khi xuất quân; không đứng chồng quân.
- Ra 6 được tung thêm sau khi xử lý nước đi; nếu ra 6 mà không có nước hợp lệ vẫn được tung thêm.
  Ra 1 không tự thưởng thêm lượt. Đá quân, nhảy cửa chuồng hoặc đưa quân vào chuồng không tự
  thưởng lượt. Mặc định không phạt ba lần 6 liên tiếp.
- Không có nước đi hợp lệ và không có lượt thưởng thì chuyển sang người kế tiếp. Có nước
  hợp lệ phải chọn một nước; không có quy tắc buộc phải đá hoặc ưu tiên một quân cụ thể.

## 3. Đi thường, chặn đường và đá quân

- Đi đúng số ô của xúc xắc, chỉ đi về phía trước. Không đi thiếu bước để dừng trước vật cản.
- Không vượt qua quân nào ở giữa đường, kể cả quân của mình. Nếu gặp quân trước khi đủ
  số bước thì nước đó không hợp lệ; chọn quân hoặc hành động khác.
- Ô đích trống: được đứng vào. Ô đích có quân mình: không được đi. Ô đích có quân đối thủ:
  được đá quân đó về nhà chờ, miễn đoạn đường trước ô đích không bị cản.
- Đếm khoảng cách bằng **số bước dọc đường đi**, không tính ô đang đứng, không dùng số ghi
  trên quân hoặc khoảng cách hình học trên màn hình. Nếu đối thủ đầu tiên phía trước cách
  `k` bước và xúc xắc là `d`: `d < k` được tiến `d` bước; `d = k` được đá; `d > k` không được đi
  quân đó. Nếu trước đối thủ còn một quân khác thì phải xử lý quân cản gần hơn trước.
- Không được tự rút bước để đá, không nhảy qua đối thủ rồi đứng phía sau và không làm đối thủ
  biến mất khi số tung chưa tới. Chặn một quân không đồng nghĩa cả lượt bị chặn: xét các quân còn lại.
- Mặc định không có ô sao hoặc ô xuất phát được miễn đá. Quân đứng ở cửa chuồng vẫn có thể
  bị đá. Ngựa đã vào dãy chuồng riêng không bị đối thủ đá.
- Quân bị đá mất tiến độ vòng chạy; phải xuất lại từ đầu khi có kết quả cho phép.

Ví dụ: đối thủ cách 3 bước thì ra 3 được đá, ra 4 không được vượt qua, ra 2 được tiến hai ô
nếu đoạn đó trống. Nếu quân cách 3 bước là quân mình thì ra 3 cũng không được đứng chồng lên.

## 4. Ra 1 được nhảy tới cửa chuồng kế tiếp

Đây là yêu cầu người dùng đã nêu. Hiểu **cửa chuồng** theo định nghĩa ở mục 1, không đồng nhất
với ô xuất phát như câu hỏi làm rõ trước đó.

- Áp dụng cho ngựa đang trên đường chung, chưa đến cửa chuồng của chính mình ở cuối vòng.
- Khi ra **1**, ngoài nước đi thường một ô, có thể chọn **nhảy tới cửa chuồng gần nhất ở
  phía trước theo chiều đi**. Không cần đang đứng tại một cửa chuồng mới được nhảy.
- Chỉ nhảy đến cửa kế tiếp; không bỏ qua một cửa để đến cửa xa hơn.
- Kiểm tra toàn bộ đoạn sau ô đang đứng đến hết ô đích: **tất cả phải trống**.
  Có quân mình hoặc đối thủ ở giữa hay ngay cửa đích đều không nhảy được.
- Nếu không nhảy được, nước đi thường một ô vẫn được xét độc lập: có thể tiến vào ô trống
  hoặc đá đối thủ ở ngay ô kế bên. Không có nước hợp lệ cho quân này thì chọn quân khác.
- Một lần ra 1 chỉ nhảy một chặng. Phải có lần tung tiếp theo mới được đi hoặc nhảy nữa.
- Đến cửa chuồng của chính mình sau khi đi vòng thì dừng tại cửa. Muốn vào chuồng phải dùng
  một lần tung khác; không nhảy qua cửa của mình để chạy vòng thứ hai.
- Ngựa trong nhà chờ hoặc đã vào dãy chuồng không dùng hành động nhảy này.
- Nếu đi thường một ô và nhảy đều dẫn tới cùng một ô thì giao diện chỉ cần hiện một lựa chọn.

Ví dụ: cửa kế tiếp cách 8 ô, cả 8 ô đều trống, ra 1 có thể chọn đi một ô hoặc nhảy đủ 8 ô.
Nếu ô thứ 5 có quân thì không được nhảy, nhưng vẫn có thể đi một ô nếu ô đó hợp lệ.

Luật ra 1 đi thẳng đến cửa gần nhất trên đoạn không bị cản cũng được mô tả trong
[hướng dẫn Thủ Thuật Chơi](https://thuthuatchoi.com/cach-choi-co-ca-ngua-cho-nguoi-moi-bat-dau.html).
Điều kiện ô đích phải trống, không đá bằng nước nhảy và không tự cộng thêm lượt là các chi tiết
được áp dụng ở đây để tránh cách hiểu khác nhau khi triển khai.

## 5. Đến cửa, vào chuồng và lên bậc

- Phải dừng đúng tại cửa chuồng của mình trước khi vào. Nước đi thường vượt quá cửa không hợp
  lệ; không dùng phần bước dư để đi xuyên vào chuồng trong cùng lần tung.
- Ở cửa, tung số **n** thì được vào bậc **n**, nếu bậc đó và các bậc thấp hơn trên đường vào
  đều trống. Ví dụ ra 4 vào thẳng bậc 4; không được vào bậc 4 nếu đã có ngựa ở bậc 2.
- Đã ở bậc **n**, chỉ được lên bậc **n + 1** khi tung đúng **n + 1**, với điều kiện bậc ấy trống.
  Ví dụ ở bậc 4, phải ra 5 để lên bậc 5; sau đó ra 6 mới lên bậc 6. Ra 1 không làm ngựa ở
  bậc 4 tiến lên bậc 5; ra 6 cũng không đưa ngựa đó nhảy từ 4 lên 6.
- Không vượt ngựa mình, không đứng chồng, không đi lùi và không quay lại đường chung.
- Ngựa ở bậc 6 không đi nữa. Khi bậc 6 đã có ngựa, con sau cần dừng ở bậc 5; tiếp tục xếp
  các con còn lại vào bậc 4 và 3. Không gán cố định Ngựa 1 phải về bậc 6: quân nào đến trước
  cũng có thể đảm nhiệm vị trí đó.
- Có thể chọn một nước hợp lệ của ngựa khác thay vì đưa ngựa đang ở cửa vào một bậc thấp.

Cách dừng tại cửa, vào bậc theo mặt xúc xắc và lên từng bậc được trình bày trong
[hướng dẫn Ziga](https://zigavn.com/giai-tri/luat-choi-co-ca-ngua). Quy tắc không vượt quân trong
chuồng được quy định tường minh cho bộ ROOMTUNE này.

## 6. Thắng và xếp hạng

- Người đầu tiên có bốn ngựa chiếm đủ bốn bậc **3, 4, 5, 6**, mỗi bậc một quân, về nhất.
- Những người còn lại tiếp tục phân hạng. Khi chỉ còn một người chưa hoàn thành, người đó
  nhận hạng còn lại; không phải tự đi hết ván một mình.
- Người đầu hàng đứng sau người còn chơi; đầu hàng sớm hơn xếp thấp hơn.

## 7. Quy tắc cho phòng online

- Luật được chọn trước khi bắt đầu và cố định trong suốt ván. Đổi luật ở phòng chờ hủy trạng
  thái sẵn sàng để mọi người đọc lại.
- Giữ thời gian mặc định 45 giây cho một lần tung và chọn nước; hết giờ mất lượt.
  Ba lượt vắng liên tiếp thì xử lý đầu hàng như hiện tại. Không cho tung lại để thay xúc xắc
  đã có khi tải lại trang hoặc nối mạng lại.
- Chuyển qua nghe nhạc, chat hoặc rời màn hình bàn cờ không tự đầu hàng. Ván tiếp tục tính giờ
  trừ khi quản trò tạm dừng.
- Nếu một quân có nhiều nước hợp lệ, hiển thị riêng **Đi 1 ô** và **Nhảy tới cửa chuồng**
  kèm ô đích. Không tự nhảy khi người chơi chỉ mới chọn quân.

## 8. Các tùy chọn trước ván

| Tùy chọn                         | Mặc định                        | Lựa chọn khác     |
| -------------------------------- | ------------------------------- | ----------------- |
| Ra quân                          | Chỉ bằng 6                      | Bằng 1 hoặc 6     |
| Nhảy khi ra 1                    | Bật, đoạn đường và ô đích trống | Tắt               |
| Thời gian một lần tung/chọn nước | 45 giây                         | 30 / 60 / 90 giây |
| Số lượt vắng trước đầu hàng      | 3                               | 2–5               |

Bật xuất quân bằng 1 không tự thay đổi luật thưởng lượt: trong bộ này vẫn chỉ ra 6 được tung thêm.
Các luật chồng quân, ô sao an toàn và cả bốn quân cùng về một ô đích thuộc bộ cũ; không đưa vào
những tùy chọn của bộ v2 này.

## 9. Phiên bản dữ liệu và triển khai

| Phần           | Bản đang chạy                      | V2 trong source                                   |
| -------------- | ---------------------------------- | ------------------------------------------------- |
| Bàn và đường   | 52 ô; chưa tách mốc cửa cho nhảy   | 56 ô, có cửa/ô xuất phát riêng                    |
| Chặn đường     | Cho đi xuyên, cho chồng            | Chặn bởi mọi quân; mỗi ô đường chung một quân     |
| An toàn        | Xuất phát/sao theo cấu hình        | Chỉ an toàn sau khi vào chuồng riêng              |
| Ra 1           | Đi một bước                        | Chọn đi thường hoặc nhảy hợp lệ                   |
| Lệnh di chuyển | Chỉ nhận quân vì mỗi quân một đích | Nhận quân và loại nước; server tự tính đích       |
| Về chuồng      | Cộng số bước, cả bốn cùng tới 57   | Dừng cửa; vào bậc theo số; leo từng bậc           |
| Chiến thắng    | Cả bốn quân cùng giá trị 57        | Bốn quân ở bốn bậc 3–6                            |
| Ván đang chơi  | Schema/luật v1                     | Tiếp tục dùng v1 tới hết; không đổi luật giữa ván |

State v2 dùng schema 2, rules.variant = CANGUA_V2, tiến độ -1 (nhà), 0–55 (đường chung),
56–61 (bậc 1–6). Ván v1 giữ schema 1, kể cả khi chơi lại; muốn dùng luật mới cần tạo bàn mới.
Không tự đổi nghĩa vị trí trong ván cũ hoặc lịch sử. Khi ra 1, client gửi moveKind STEP hoặc
JUMP cùng số quân; server tự tính ô đích. Thiếu moveKind được hiểu là STEP, không tự nhảy.

Migration bổ sung là 202611170001_cangua_v2.sql; không sửa migration đã áp dụng. Nó kiểm tra
vị trí, không chồng quân ở v2, giữ nguyên validator v1 và chặn đổi phiên bản/luật giữa ván.
Cần backup/dry-run rồi áp dụng migration trước khi bật API/UI mới. Không để bản thử ghi v2
vào database dùng chung khi server public còn chỉ đọc được v1. Luật và bàn trong UI luôn
chọn theo schema của ván. Máy chủ sinh xúc xắc và chọn người đi đầu bằng random an toàn.

## 10. Tình huống kiểm thử

1. Chỉ xuất quân vào ô trống; ô có quân mình/đối thủ chặn xuất theo mặc định;
   không dùng kết quả đó để đi thêm.
2. Đối thủ ở cách đúng số bước thì đá; gần hơn thì chặn; cùng màu ở đích thì không đi.
3. Không đi thiếu bước, đi lùi hoặc đứng chồng.
4. Ra 1 có đồng thời lựa chọn đi thường và nhảy; chọn một nước chỉ di chuyển một lần.
5. Mọi quân giữa đường và quân ở cửa đích đều chặn nhảy; quân ngoài đoạn đó không chặn.
6. Nhảy đến cửa gần nhất từ từng vị trí, đủ bốn màu, kể cả qua điểm nối cuối/đầu đường chung.
7. Tại cửa của màu khác có thể nhảy tới cửa tiếp; tại cửa của mình cuối vòng chỉ vào chuồng.
8. Đến cửa bằng nhảy không vào chuồng bằng cùng lần tung, không bắt đầu vòng thứ hai.
9. Từ cửa ra n vào bậc n, chặn nếu các bậc đi qua có quân; không vào chuồng đối thủ.
10. Ở bậc 4, chỉ ra 5 mới lên bậc 5; ra 1 hoặc 6 không làm quân ấy tiến.
11. Không vượt/đè quân trong chuồng; chiến thắng chỉ khi đủ bốn bậc 3–6.
12. Ra 6, hết nước, timeout, đầu hàng và hoàn thành đều xử lý lượt đúng; không tự phạt ba lần 6.
13. Server từ chối loại nước/phiên bản không hợp lệ; retry cùng mã không đi hoặc tung hai lần.
14. Ván v1, lịch sử v1 và chức năng nghe nhạc giữ hành vi trước đó trong quá trình chuyển phiên bản.
15. Đếm ô trên đường vòng, tại các góc rẽ và qua chỉ số cuối/đầu vẫn cho cùng khoảng cách;
    bỏ qua quân ở nhà chờ hoặc trong chuồng riêng khi kiểm tra cản trên đường chung.
16. Bậc 6 của cả bốn màu phải hiện đầy đủ, cửa nối thẳng bậc 1; dấu xuất phát và chiều đi
    trên giao diện phải dùng cùng định nghĩa đường với máy chủ.
