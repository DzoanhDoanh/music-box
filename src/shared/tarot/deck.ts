// 78-card tarot deck in Rider–Waite–Smith order: 22 Major Arcana (ids 0–21), then
// Wands, Cups, Swords, Pentacles (14 each: Ace…10, Page, Knight, Queen, King).
// Card ids are stored in saved readings, so the order must never change.

export type TarotSuit = 'WANDS' | 'CUPS' | 'SWORDS' | 'PENTACLES';
export interface TarotCard {
  id: number;
  name: string;
  arcana: 'MAJOR' | 'MINOR';
  suit: TarotSuit | null;
  /** Major: 0–21. Minor: 1 (Ace) … 10, 11 Page, 12 Knight, 13 Queen, 14 King. */
  rank: number;
  keywords: { upright: string; reversed: string };
  upright: string;
  reversed: string;
}

export const suits: Record<TarotSuit, { name: string; element: string }> = {
  WANDS: { name: 'Gậy', element: 'Lửa · đam mê, hành động' },
  CUPS: { name: 'Cốc', element: 'Nước · cảm xúc, tình cảm' },
  SWORDS: { name: 'Kiếm', element: 'Khí · suy nghĩ, mâu thuẫn' },
  PENTACLES: { name: 'Tiền', element: 'Đất · tiền bạc, công việc' },
};
const suitOrder: TarotSuit[] = ['WANDS', 'CUPS', 'SWORDS', 'PENTACLES'];
const rankNames = [
  '',
  'Át',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'Tiểu Đồng',
  'Hiệp Sĩ',
  'Hoàng Hậu',
  'Vua',
];
const roman = [
  '0',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
  'XVI',
  'XVII',
  'XVIII',
  'XIX',
  'XX',
  'XXI',
];

/** [name, upright keywords, reversed keywords, upright meaning, reversed meaning] */
type MajorRow = [string, string, string, string, string];
const majors: MajorRow[] = [
  [
    'Kẻ Khờ',
    'Khởi đầu, tự do, liều lĩnh',
    'Bốc đồng, thiếu chuẩn bị',
    'Một hành trình mới đang mở ra. Hãy dám bước đi với tâm thế cởi mở, đừng để nỗi sợ giữ chân.',
    'Bạn có thể đang lao vào một việc quá vội. Dừng lại kiểm tra kỹ trước khi nhảy.',
  ],
  [
    'Nhà Ảo Thuật',
    'Ý chí, kỹ năng, hiện thực hóa',
    'Thao túng, phân tán',
    'Bạn đã có đủ công cụ trong tay. Đây là lúc biến ý tưởng thành việc làm cụ thể.',
    'Năng lực đang bị dùng sai chỗ hoặc dàn trải. Coi chừng lời hứa hẹn quá đẹp.',
  ],
  [
    'Nữ Tư Tế',
    'Trực giác, bí ẩn, tĩnh lặng',
    'Bỏ qua linh cảm, bí mật',
    'Câu trả lời nằm ở bên trong. Lắng nghe trực giác và quan sát thêm trước khi lên tiếng.',
    'Bạn đang phớt lờ cảm giác của chính mình, hoặc có điều gì đó chưa được nói ra.',
  ],
  [
    'Hoàng Hậu',
    'Sung túc, nuôi dưỡng, sáng tạo',
    'Phụ thuộc, bỏ bê bản thân',
    'Giai đoạn đơm hoa kết trái. Chăm chút cho những gì bạn yêu thương, chúng sẽ lớn lên.',
    'Bạn đang cho đi quá nhiều mà quên chăm sóc chính mình. Cân bằng lại nhé.',
  ],
  [
    'Hoàng Đế',
    'Kỷ luật, quyền lực, ổn định',
    'Cứng nhắc, áp đặt',
    'Cần cấu trúc và kỷ luật. Đặt ra nguyên tắc rõ ràng và giữ vững lập trường.',
    'Sự kiểm soát đang quá tay, hoặc thiếu hẳn nền tảng. Mềm mỏng hơn sẽ đi xa hơn.',
  ],
  [
    'Giáo Hoàng',
    'Truyền thống, người dẫn đường, học hỏi',
    'Phá lệ, nghi ngờ khuôn mẫu',
    'Tìm đến người có kinh nghiệm hoặc con đường đã được kiểm chứng. Học hỏi sẽ giúp bạn.',
    'Bạn muốn đi con đường riêng. Đúng lúc để đặt câu hỏi với những lề lối cũ.',
  ],
  [
    'Tình Nhân',
    'Tình yêu, hòa hợp, lựa chọn',
    'Lệch nhịp, lựa chọn sai',
    'Một mối gắn kết đẹp hoặc một lựa chọn quan trọng từ trái tim. Hãy chọn điều đúng với giá trị của bạn.',
    'Có sự lệch nhịp trong một mối quan hệ, hoặc bạn đang chọn vì sợ chứ không vì muốn.',
  ],
  [
    'Cỗ Xe',
    'Quyết tâm, chiến thắng, tiến lên',
    'Mất phương hướng, giằng co',
    'Giữ vững tay lái, tập trung vào mục tiêu và bạn sẽ vượt qua trở ngại.',
    'Các lực kéo ngược chiều nhau khiến bạn đứng yên. Chọn một hướng rồi đi.',
  ],
  [
    'Sức Mạnh',
    'Can đảm, kiên nhẫn, dịu dàng',
    'Tự ti, mất bình tĩnh',
    'Sức mạnh thật sự đến từ sự kiên nhẫn và lòng tử tế, không phải từ cơn nóng giận.',
    'Bạn đang nghi ngờ bản thân hoặc để cảm xúc lấn át. Hít thở và tin vào mình hơn.',
  ],
  [
    'Ẩn Sĩ',
    'Chiêm nghiệm, một mình, tìm kiếm',
    'Cô lập, trốn tránh',
    'Lùi lại một bước để suy ngẫm. Khoảng lặng lúc này sẽ cho bạn câu trả lời.',
    'Ở một mình quá lâu đang khiến bạn xa rời mọi người. Đã đến lúc kết nối lại.',
  ],
  [
    'Bánh Xe Số Phận',
    'Vận may, chu kỳ, bước ngoặt',
    'Xui rủi, kháng cự thay đổi',
    'Bánh xe đang quay theo hướng có lợi. Nắm lấy cơ hội khi nó tới.',
    'Một giai đoạn trầm hơn. Đừng cố níu kéo, mọi chu kỳ đều sẽ qua.',
  ],
  [
    'Công Lý',
    'Công bằng, sự thật, nhân quả',
    'Thiên vị, né tránh trách nhiệm',
    'Điều gì đến sẽ tương xứng với điều bạn đã làm. Hãy trung thực và quyết định sáng suốt.',
    'Có điều chưa công bằng hoặc ai đó đang né trách nhiệm. Nhìn thẳng vào sự thật.',
  ],
  [
    'Người Treo Ngược',
    'Tạm dừng, buông bỏ, góc nhìn mới',
    'Trì hoãn, hy sinh vô ích',
    'Tạm dừng không phải là thua. Nhìn sự việc từ một góc khác, bạn sẽ thấy lối ra.',
    'Bạn đang chờ đợi quá lâu hoặc hy sinh mà không được gì. Đến lúc chuyển động.',
  ],
  [
    'Cái Chết',
    'Kết thúc, chuyển hóa, khởi đầu mới',
    'Níu kéo, sợ thay đổi',
    'Một chương khép lại để chương mới mở ra. Buông bỏ cái cũ sẽ giải phóng bạn.',
    'Bạn đang cố giữ thứ đã hết thời. Càng níu kéo, chuyển giao càng khó khăn.',
  ],
  [
    'Tiết Độ',
    'Cân bằng, điều độ, hòa hợp',
    'Thái quá, mất cân bằng',
    'Kiên nhẫn pha trộn mọi thứ vừa đủ. Con đường trung dung sẽ mang lại bình yên.',
    'Có thứ gì đó đang bị đẩy quá đà. Giảm bớt và tìm lại nhịp của mình.',
  ],
  [
    'Ác Quỷ',
    'Ràng buộc, cám dỗ, ham muốn',
    'Thoát ra, tỉnh ngộ',
    'Hãy nhận diện điều đang trói buộc bạn: thói quen, nỗi sợ hay một mối quan hệ không lành mạnh.',
    'Bạn đang bắt đầu nhìn rõ và tháo gỡ những sợi xích của mình. Tiếp tục nhé.',
  ],
  [
    'Tòa Tháp',
    'Biến động, sụp đổ, thức tỉnh',
    'Tránh được cú sốc, thay đổi âm ỉ',
    'Một biến cố bất ngờ phá vỡ thứ không còn vững. Đau nhưng cần thiết để xây lại chắc hơn.',
    'Thay đổi đang đến từ từ thay vì ập xuống. Đừng chờ nó tự sụp, hãy chủ động sửa.',
  ],
  [
    'Ngôi Sao',
    'Hy vọng, chữa lành, cảm hứng',
    'Nản lòng, mất niềm tin',
    'Sau giông bão là bầu trời sao. Hãy tin vào điều tốt đẹp, bạn đang được chữa lành.',
    'Bạn đang mất niềm tin tạm thời. Bắt đầu lại từ những niềm vui nhỏ.',
  ],
  [
    'Mặt Trăng',
    'Mơ hồ, ảo ảnh, tiềm thức',
    'Sáng tỏ dần, vượt nỗi sợ',
    'Mọi thứ chưa rõ ràng như vẻ ngoài. Đừng vội kết luận, hãy để mọi việc tự sáng tỏ.',
    'Sương mù đang tan. Sự thật dần lộ ra và nỗi lo của bạn nhẹ đi.',
  ],
  [
    'Mặt Trời',
    'Niềm vui, thành công, rạng rỡ',
    'Niềm vui bị che khuất',
    'Năng lượng tích cực ngập tràn. Thành công và niềm vui đang ở rất gần.',
    'Niềm vui vẫn ở đó nhưng bị che bởi kỳ vọng quá cao. Hạ bớt áp lực xuống.',
  ],
  [
    'Phán Xét',
    'Thức tỉnh, tái sinh, tiếng gọi',
    'Tự trách, chần chừ',
    'Đã đến lúc nhìn lại, tha thứ và đáp lại tiếng gọi bên trong để bước sang trang mới.',
    'Bạn đang quá khắt khe với chính mình hoặc ngập ngừng trước một quyết định lớn.',
  ],
  [
    'Thế Giới',
    'Hoàn thành, viên mãn, trọn vẹn',
    'Dang dở, thiếu một bước',
    'Một chặng đường khép lại trọn vẹn. Ăn mừng thành quả rồi sẵn sàng cho vòng mới.',
    'Bạn đã gần tới đích nhưng còn một mảnh ghép chưa xong. Đừng bỏ cuộc lúc này.',
  ],
];

/** [upright keywords, reversed keywords, upright meaning, reversed meaning] per rank 1–14. */
type MinorRow = [string, string, string, string];
const minors: Record<TarotSuit, MinorRow[]> = {
  WANDS: [
    [
      'Cảm hứng, khởi đầu, nhiệt huyết',
      'Chậm trễ, thiếu động lực',
      'Một tia lửa mới: ý tưởng, dự án hay đam mê đang chờ bạn bắt tay vào.',
      'Ngọn lửa còn đó nhưng chưa bén. Tìm lại lý do khiến bạn muốn bắt đầu.',
    ],
    [
      'Lên kế hoạch, tầm nhìn',
      'Sợ bước ra, kế hoạch mơ hồ',
      'Bạn đứng trước nhiều lựa chọn tương lai. Vạch kế hoạch rồi mạnh dạn mở rộng.',
      'Bạn đang ngại rời vùng an toàn. Kế hoạch cần cụ thể hơn để dám đi.',
    ],
    [
      'Mở rộng, chờ đợi kết quả',
      'Trở ngại, thất vọng nhỏ',
      'Những gì bạn gieo đã bắt đầu nảy mầm. Nhìn xa hơn, cơ hội đang tới.',
      'Kết quả đến chậm hơn mong đợi. Kiên nhẫn và điều chỉnh hướng đi.',
    ],
    [
      'Ăn mừng, ổn định, mái ấm',
      'Bất ổn, lỡ hẹn vui',
      'Một dịp vui, một cột mốc đáng ăn mừng cùng những người thân thiết.',
      'Không khí vui vẻ bị xáo trộn. Dành thời gian hàn gắn với người quanh mình.',
    ],
    [
      'Cạnh tranh, va chạm',
      'Tránh xung đột, hòa giải',
      'Có sự cạnh tranh hoặc bất đồng. Coi đó là cơ hội rèn luyện, đừng biến thành thù hằn.',
      'Căng thẳng đang dịu xuống. Tìm điểm chung thay vì cố thắng.',
    ],
    [
      'Chiến thắng, được công nhận',
      'Tự mãn, chưa được ghi nhận',
      'Nỗ lực của bạn được nhìn thấy. Tận hưởng thành công và lời khen xứng đáng.',
      'Bạn chưa nhận được sự ghi nhận mong muốn, hoặc đang ngủ quên trên chiến thắng.',
    ],
    [
      'Giữ vững lập trường, phòng thủ',
      'Kiệt sức, bị áp đảo',
      'Bạn đang ở thế cao. Giữ vững quan điểm dù có người phản đối.',
      'Bạn mệt vì phải chống đỡ quá nhiều. Chọn trận nào đáng để giữ.',
    ],
    [
      'Tốc độ, tin tức, chuyển động',
      'Chậm lại, vội vàng sai chỗ',
      'Mọi việc chuyển động nhanh. Tin tức hoặc cơ hội sẽ đến dồn dập.',
      'Mọi thứ bị chững lại, hoặc bạn đang vội ở chỗ cần chậm.',
    ],
    [
      'Kiên trì, chặng cuối',
      'Mệt mỏi, phòng thủ quá mức',
      'Bạn đã đi gần hết đường. Thêm một chút kiên trì nữa thôi.',
      'Bạn đang cảnh giác đến mức kiệt sức. Cho phép mình nghỉ ngơi.',
    ],
    [
      'Gánh nặng, trách nhiệm',
      'Buông bớt, chia sẻ việc',
      'Bạn đang ôm quá nhiều việc. Thành công đã gần nhưng cái giá là sự mệt mỏi.',
      'Đã đến lúc đặt bớt gánh xuống hoặc nhờ người khác cùng làm.',
    ],
    [
      'Tò mò, tin vui, khám phá',
      'Thiếu định hướng, tin trễ',
      'Một tin vui hoặc một ý tưởng mới mẻ. Hãy tò mò và thử nghiệm.',
      'Nhiệt huyết có nhưng chưa có hướng. Chọn một việc và theo đến cùng.',
    ],
    [
      'Phiêu lưu, hành động, bốc lửa',
      'Nóng vội, bỏ dở',
      'Năng lượng mạnh mẽ thúc bạn lao về phía trước. Hành động ngay.',
      'Bạn đang lao đi mà chưa nghĩ kỹ, hoặc bắt đầu nhiều thứ rồi bỏ dở.',
    ],
    [
      'Tự tin, cuốn hút, quyết đoán',
      'Ghen tị, thiếu tự tin',
      'Bạn tỏa sáng bằng sự tự tin và ấm áp. Người khác bị cuốn theo năng lượng của bạn.',
      'Sự tự tin đang lung lay, hoặc bạn đang so sánh mình với người khác.',
    ],
    [
      'Lãnh đạo, tầm nhìn, dám làm',
      'Độc đoán, kỳ vọng quá cao',
      'Bạn có tầm nhìn và khả năng dẫn dắt. Hãy là người mở đường.',
      'Cách dẫn dắt đang quá áp đặt. Lắng nghe đội của mình nhiều hơn.',
    ],
  ],
  CUPS: [
    [
      'Tình yêu mới, cảm xúc dâng tràn',
      'Kìm nén cảm xúc, trống rỗng',
      'Trái tim đang mở ra. Một tình cảm mới hoặc niềm vui sâu sắc đang đến.',
      'Bạn đang khép lòng hoặc cảm thấy trống rỗng. Cho phép mình cảm nhận.',
    ],
    [
      'Kết nối, đôi lứa, hòa hợp',
      'Rạn nứt, mất cân bằng',
      'Một mối gắn kết hai chiều, tôn trọng và đồng điệu.',
      'Có sự lệch nhịp trong một mối quan hệ. Nói chuyện thẳng thắn sẽ giúp.',
    ],
    [
      'Bạn bè, ăn mừng, cộng đồng',
      'Tiệc tùng quá đà, chuyện thị phi',
      'Niềm vui khi ở bên bạn bè. Một buổi gặp gỡ, một dịp ăn mừng.',
      'Cẩn thận chuyện người thứ ba hoặc những cuộc vui khiến bạn xao nhãng.',
    ],
    [
      'Chán chường, thờ ơ',
      'Thức tỉnh, đón nhận cơ hội',
      'Bạn đang không hài lòng và bỏ qua những gì được trao. Nhìn lại xem.',
      'Bạn bắt đầu thoát khỏi sự trì trệ và sẵn sàng đón cơ hội mới.',
    ],
    [
      'Mất mát, tiếc nuối',
      'Chấp nhận, bước tiếp',
      'Bạn đang buồn vì điều đã mất. Nhưng vẫn còn những chiếc cốc đứng sau lưng.',
      'Nỗi buồn dần lắng xuống. Bạn sẵn sàng tha thứ và đi tiếp.',
    ],
    [
      'Hoài niệm, ký ức đẹp, ngây thơ',
      'Mắc kẹt trong quá khứ',
      'Một kỷ niệm hoặc người cũ quay lại mang theo sự ấm áp.',
      'Bạn đang sống trong quá khứ quá nhiều. Hiện tại cũng cần bạn.',
    ],
    [
      'Nhiều lựa chọn, mộng tưởng',
      'Rõ ràng, chọn thực tế',
      'Nhiều lựa chọn hấp dẫn nhưng không phải cái nào cũng thật. Đừng mơ mộng quá.',
      'Bạn bắt đầu nhìn rõ đâu là điều thực sự quan trọng.',
    ],
    [
      'Rời đi, tìm ý nghĩa sâu hơn',
      'Sợ rời đi, níu giữ',
      'Bạn sẵn sàng bỏ lại điều không còn nuôi dưỡng tâm hồn mình.',
      'Bạn biết nên đi nhưng vẫn ngập ngừng. Hỏi lòng mình thật sự muốn gì.',
    ],
    [
      'Mãn nguyện, điều ước thành',
      'Tham lam, chưa thỏa',
      'Lá bài của điều ước. Những gì bạn mong có thể sắp thành hiện thực.',
      'Bạn có nhiều nhưng vẫn thấy thiếu. Niềm vui thật nằm ở bên trong.',
    ],
    [
      'Hạnh phúc gia đình, viên mãn',
      'Bất hòa trong nhà',
      'Hạnh phúc trọn vẹn với người thân yêu. Mái ấm bình yên.',
      'Có chút bất hòa trong gia đình hoặc nhóm thân. Cần lắng nghe nhau hơn.',
    ],
    [
      'Lời nhắn tình cảm, sáng tạo',
      'Cảm xúc non nớt, mơ mộng',
      'Một lời tỏ bày, một tin nhắn dễ thương hoặc ý tưởng sáng tạo bất ngờ.',
      'Cảm xúc đang hơi trẻ con hoặc thiếu thực tế. Bình tĩnh lại một chút.',
    ],
    [
      'Lãng mạn, lời mời, theo đuổi',
      'Hứa suông, thất thường',
      'Một lời mời lãng mạn hoặc người đang theo đuổi bạn bằng cả trái tim.',
      'Coi chừng lời hứa ngọt ngào nhưng thiếu hành động.',
    ],
    [
      'Thấu cảm, dịu dàng, trực giác',
      'Quá nhạy cảm, phụ thuộc',
      'Bạn thấu hiểu và nâng đỡ người khác bằng sự dịu dàng.',
      'Bạn đang ôm cảm xúc của người khác quá nhiều. Giữ ranh giới cho mình.',
    ],
    [
      'Điềm tĩnh, bao dung, cân bằng',
      'Lạnh lùng, kìm nén',
      'Bạn làm chủ được cảm xúc và giữ được sự bình tĩnh trước sóng gió.',
      'Bạn đang kìm nén cảm xúc thay vì đối diện chúng.',
    ],
  ],
  SWORDS: [
    [
      'Sáng suốt, sự thật, đột phá',
      'Rối trí, hiểu lầm',
      'Một ý tưởng rõ ràng cắt qua mọi rối rắm. Sự thật lên tiếng.',
      'Suy nghĩ đang rối hoặc có hiểu lầm. Hỏi lại cho rõ trước khi phán xét.',
    ],
    [
      'Phân vân, bế tắc',
      'Quyết định được đưa ra',
      'Bạn đang né một lựa chọn khó. Bịt mắt không làm vấn đề biến mất.',
      'Bạn bắt đầu dám nhìn thẳng và đưa ra quyết định.',
    ],
    [
      'Tổn thương, đau lòng',
      'Chữa lành, nguôi ngoai',
      'Một nỗi đau trong lòng. Cho phép mình buồn để có thể vượt qua.',
      'Vết thương đang lành dần. Bạn bắt đầu buông bỏ nỗi đau.',
    ],
    [
      'Nghỉ ngơi, hồi phục',
      'Kiệt sức, cần dừng lại',
      'Đã đến lúc nghỉ ngơi và nạp lại năng lượng trước chặng tiếp theo.',
      'Bạn đang ép mình quá sức. Cơ thể và đầu óc cần được nghỉ.',
    ],
    [
      'Thắng bằng mọi giá, tranh cãi',
      'Làm lành, hối tiếc',
      'Một cuộc tranh cãi mà thắng cũng không vui. Cân nhắc cái giá phải trả.',
      'Bạn muốn làm lành sau xung đột. Một lời xin lỗi sẽ có ích.',
    ],
    [
      'Chuyển tiếp, rời xa sóng gió',
      'Mắc kẹt, khó rời đi',
      'Bạn đang dần rời khỏi giai đoạn khó khăn để đến vùng nước lặng hơn.',
      'Bạn muốn đi nhưng vẫn vướng víu. Gánh bớt hành lý cảm xúc.',
    ],
    [
      'Mưu mẹo, lén lút',
      'Lộ ra, thú nhận',
      'Có điều gì đó không minh bạch. Cẩn thận với người, hoặc với chính mình.',
      'Sự thật sắp được phơi bày. Trung thực là lựa chọn tốt nhất.',
    ],
    [
      'Tự giới hạn, bị trói buộc',
      'Giải thoát, thấy lối ra',
      'Bạn thấy mình bị mắc kẹt, nhưng phần lớn dây trói nằm trong suy nghĩ.',
      'Bạn đang tìm ra lối thoát và lấy lại quyền tự quyết.',
    ],
    [
      'Lo âu, mất ngủ',
      'Vơi bớt lo, hy vọng',
      'Nỗi lo đang làm bạn trằn trọc. Chia sẻ với ai đó sẽ nhẹ lòng hơn.',
      'Nỗi sợ lớn nhất đã qua. Mọi thứ không tệ như bạn nghĩ.',
    ],
    [
      'Kết thúc đau đớn, chạm đáy',
      'Hồi phục, vực dậy',
      'Một kết thúc khó khăn. Chạm đáy rồi thì chỉ còn đường đi lên.',
      'Bạn đang đứng dậy sau giai đoạn tồi tệ nhất.',
    ],
    [
      'Tò mò, ham học, cảnh giác',
      'Nói nhiều, thiếu suy xét',
      'Một tin tức hoặc ý tưởng mới. Quan sát kỹ và đặt câu hỏi.',
      'Coi chừng lời nói thiếu suy nghĩ hoặc chuyện ngồi lê đôi mách.',
    ],
    [
      'Quyết liệt, tham vọng, nhanh',
      'Hấp tấp, gây sát thương',
      'Bạn lao thẳng tới mục tiêu với quyết tâm cao.',
      'Bạn đang hành động quá nhanh và có thể làm tổn thương người khác.',
    ],
    [
      'Thẳng thắn, độc lập, sắc sảo',
      'Lạnh lùng, cay nghiệt',
      'Bạn nhìn mọi việc rõ ràng và nói thẳng điều cần nói.',
      'Sự thẳng thắn đang trở nên gay gắt. Thêm một chút mềm mỏng.',
    ],
    [
      'Lý trí, công tâm, uy tín',
      'Lạm quyền, cố chấp',
      'Dùng lý trí và sự công bằng để đưa ra quyết định.',
      'Lý lẽ đang bị dùng để áp đặt. Hãy cởi mở với góc nhìn khác.',
    ],
  ],
  PENTACLES: [
    [
      'Cơ hội tài chính, khởi đầu vững',
      'Lỡ cơ hội, chi tiêu kém',
      'Một cơ hội về tiền bạc hoặc công việc đang đến. Gieo hạt cẩn thận.',
      'Bạn có thể bỏ lỡ cơ hội vì thiếu kế hoạch. Xem lại chi tiêu.',
    ],
    [
      'Xoay xở, cân bằng nhiều việc',
      'Quá tải, rối ngân sách',
      'Bạn đang tung hứng nhiều việc. Linh hoạt sẽ giúp bạn giữ được nhịp.',
      'Bạn ôm quá nhiều việc hoặc khoản chi. Ưu tiên lại.',
    ],
    [
      'Hợp tác, tay nghề, làm nhóm',
      'Thiếu phối hợp',
      'Làm việc nhóm hiệu quả. Kỹ năng của bạn được trân trọng.',
      'Nhóm đang thiếu phối hợp. Phân vai rõ ràng hơn.',
    ],
    [
      'Tiết kiệm, an toàn, giữ chặt',
      'Keo kiệt, sợ mất',
      'Bạn đang giữ gìn những gì mình có. An toàn là tốt, nhưng đừng khép kín.',
      'Bạn bám chặt quá mức vì sợ mất. Cho đi một chút sẽ nhẹ lòng.',
    ],
    [
      'Khó khăn, thiếu thốn',
      'Vượt khó, được giúp đỡ',
      'Một giai đoạn chật vật. Đừng ngại tìm sự giúp đỡ, nó ở gần hơn bạn nghĩ.',
      'Khó khăn đang qua dần. Bạn nhận được sự hỗ trợ cần thiết.',
    ],
    [
      'Cho và nhận, hào phóng',
      'Nợ nần, cho vay sai',
      'Sự cân bằng giữa cho và nhận. Bạn có thể giúp người hoặc được giúp.',
      'Cẩn thận chuyện vay mượn hoặc sự giúp đỡ có điều kiện.',
    ],
    [
      'Kiên nhẫn, đầu tư dài hạn',
      'Nóng ruột, đầu tư kém',
      'Thành quả cần thời gian. Tiếp tục chăm sóc, mùa gặt sẽ tới.',
      'Bạn nóng ruột vì kết quả chậm, hoặc đang đầu tư sai chỗ.',
    ],
    [
      'Chăm chỉ, rèn nghề',
      'Làm qua loa, cầu toàn',
      'Tập trung trau dồi kỹ năng. Sự tỉ mỉ của bạn sẽ được đền đáp.',
      'Bạn làm cho xong, hoặc ngược lại cầu toàn quá mức.',
    ],
    [
      'Tự chủ, sung túc, tận hưởng',
      'Phụ thuộc, sống quá mức',
      'Bạn tự lập và tận hưởng thành quả của mình.',
      'Bạn đang phụ thuộc tài chính hoặc chi tiêu vượt khả năng.',
    ],
    [
      'Gia sản, ổn định lâu dài',
      'Tranh chấp tài sản',
      'Sự ổn định lâu dài về tài chính và gia đình.',
      'Có chuyện lục đục về tiền bạc trong gia đình hoặc nhóm.',
    ],
    [
      'Học hỏi, cơ hội mới, chăm chỉ',
      'Lười học, thiếu kế hoạch',
      'Một cơ hội học hỏi hoặc công việc mới. Bắt đầu từ những bước nhỏ.',
      'Bạn có mục tiêu nhưng chưa bắt tay vào làm.',
    ],
    [
      'Bền bỉ, đáng tin, đều đặn',
      'Trì trệ, nhàm chán',
      'Chậm mà chắc. Sự bền bỉ và đáng tin cậy là sức mạnh của bạn.',
      'Mọi việc đang dậm chân tại chỗ. Thêm chút đổi mới.',
    ],
    [
      'Thực tế, chu đáo, vun vén',
      'Lo toan quá mức, bỏ bê mình',
      'Bạn chăm lo chu toàn cho cả công việc lẫn tổ ấm.',
      'Bạn lo cho mọi người mà quên mất bản thân.',
    ],
    [
      'Thịnh vượng, thành đạt, vững vàng',
      'Ham vật chất, cứng nhắc',
      'Thành công vật chất và sự vững vàng. Bạn là chỗ dựa cho người khác.',
      'Coi chừng đặt tiền bạc lên trên mọi thứ.',
    ],
  ],
};

export const deck: TarotCard[] = [
  ...majors.map(
    ([name, up, rev, upright, reversed], rank): TarotCard => ({
      id: rank,
      name,
      arcana: 'MAJOR',
      suit: null,
      rank,
      keywords: { upright: up, reversed: rev },
      upright,
      reversed,
    }),
  ),
  ...suitOrder.flatMap((suit, s) =>
    minors[suit].map(
      ([up, rev, upright, reversed], i): TarotCard => ({
        id: 22 + s * 14 + i,
        name: `${rankNames[i + 1]} ${suits[suit].name}`,
        arcana: 'MINOR',
        suit,
        rank: i + 1,
        keywords: { upright: up, reversed: rev },
        upright,
        reversed,
      }),
    ),
  ),
];
export const DECK_SIZE = 78;

/** Short label for the card corner: Roman numeral for majors, A/2…10/P/Kn/Q/K for minors. */
export function cardNumeral(card: TarotCard) {
  if (card.arcana === 'MAJOR') return roman[card.rank];
  return ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'P', 'Kn', 'Q', 'K'][card.rank];
}
