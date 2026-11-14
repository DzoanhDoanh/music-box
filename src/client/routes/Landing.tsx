import {
  ArrowRight,
  ArrowUpRight,
  Radio,
  Smartphone,
  ListMusic,
  Heart,
  Check,
  AudioLines,
  Users,
  Plus,
  Play,
  Headphones,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Brand, Button, Eyebrow } from '../components/ui';
const ReturnToRoom = lazy(() => import('../components/ReturnToRoom'));
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav aria-label="Điều hướng chính">
          <a href="#how">Cách hoạt động</a>
          <a href="#features">Khám phá</a>
          <Link to="/login">
            Dành cho chủ phòng <ArrowUpRight size={15} />
          </Link>
        </nav>
        <Button asChild>
          <Link to="/rooms">
            Phòng của bạn <ArrowRight size={16} />
          </Link>
        </Button>
      </header>
      <main>
        <Suspense fallback={null}>
          <ReturnToRoom />
        </Suspense>
        <section className="hero">
          <div className="hero-copy">
            <Eyebrow>ÂM NHẠC KẾT NỐI CHÚNG TA</Eyebrow>
            <h1>
              Khác gu nhạc.
              <br />
              Chung <span>một nhịp.</span>
            </h1>
            <p>
              Một căn phòng. Một hàng chờ. Những bài hát của tất cả mọi người. Biến mỗi khoảnh khắc
              bên nhau thành một playlist đáng nhớ.
            </p>
            <div className="hero-actions">
              <Button asChild variant="primary">
                <Link to="/join">
                  Tham gia phòng <ArrowUpRight size={19} />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/rooms">
                  <Plus size={18} /> Tạo không gian của bạn
                </Link>
              </Button>
            </div>
            <div className="hero-note">
              <span>
                <Check size={14} /> Không cần tài khoản
              </span>
              <span>
                <Check size={14} /> Nghe cùng nhau, thật dễ
              </span>
            </div>
          </div>
          <div className="hero-art" aria-label="Minh họa không gian âm nhạc ROOMTUNE">
            <div className="art-top">
              <span>
                <Radio size={14} /> YOUR ROOM. YOUR RHYTHM.
              </span>
              <span>VOL. 01</span>
            </div>
            <div className="orbital orbital-one" />
            <div className="orbital orbital-two" />
            <div className="record">
              <div className="record-label">
                <AudioLines size={44} />
                <span>
                  ROOM
                  <br />
                  TUNE
                </span>
                <i />
              </div>
            </div>
            <div className="floating-note note-one">
              <span className="note-avatar">
                <Headphones size={19} />
              </span>
              <div>
                <strong>Mỗi người một gu</strong>
                <small>Cùng nhau chọn bài tiếp theo</small>
              </div>
              <Heart size={18} />
            </div>
            <div className="floating-note note-two">
              <span className="note-avatar lime">
                <Users size={19} />
              </span>
              <div>
                <strong>Chung một không gian</strong>
                <small>Âm nhạc hay hơn khi có nhau</small>
              </div>
            </div>
            <div className="art-bottom">
              <span>
                MADE FOR
                <br />
                <b>GOOD COMPANY.</b>
              </span>
              <div className="waveform">
                {Array.from({ length: 25 }, (_, i) => (
                  <i key={i} style={{ height: `${12 + ((i * 17) % 35)}px` }} />
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="occasion-strip" aria-label="Không gian phù hợp">
          <span>NHẠC HAY, Ở BẤT CỨ ĐÂU</span>
          <p>
            <span>01</span> Góc làm việc
          </p>
          <p>
            <span>02</span> Tụ họp bạn bè
          </p>
          <p>
            <span>03</span> Một tối thảnh thơi
          </p>
          <AudioLines size={27} />
        </section>
        <section className="how-section" id="how">
          <div className="section-heading">
            <div>
              <Eyebrow>ÍT THAO TÁC. NHIỀU KẾT NỐI.</Eyebrow>
              <h2>
                Vào phòng. Chọn bài.
                <br />
                Để âm nhạc lo phần còn lại.
              </h2>
            </div>
            <p>
              Không chuyền tay điện thoại. <br />
              Không tranh nhau chiếc loa. <br />
              Mọi người đều có tiếng nói.
            </p>
          </div>
          <div className="steps">
            {[
              {
                icon: Smartphone,
                n: '01',
                title: 'Vào chung một phòng',
                text: 'Quét mã QR hoặc nhập mã phòng. Chọn tên của bạn và sẵn sàng hòa nhịp.',
              },
              {
                icon: ListMusic,
                n: '02',
                title: 'Thêm một chút gu riêng',
                text: 'Tìm bài hát trên YouTube, dán liên kết và bình chọn cho bài bạn muốn nghe.',
              },
              {
                icon: Radio,
                n: '03',
                title: 'Bật loa, tận hưởng thôi',
                text: 'Máy host phát nhạc cho cả phòng. Hàng chờ cập nhật trên điện thoại của mọi người.',
              },
            ].map(({ icon: Icon, n, title, text }) => (
              <article className="step" key={n}>
                <div>
                  <Icon size={25} />
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="feature-banner" id="features">
          <div className="feature-symbol">
            <Play fill="currentColor" size={38} />
          </div>
          <div>
            <Eyebrow>KHÔNG GIAN CỦA BẠN</Eyebrow>
            <h2>
              Bạn chọn không khí.
              <br />
              ROOMTUNE giữ nhịp.
            </h2>
            <p>
              Bình chọn công bằng, playlist riêng, hàng chờ đồng bộ.
              <br />
              Tất cả trong một không gian gọn gàng.
            </p>
          </div>
          <Button asChild variant="primary">
            <Link to="/join">
              Tìm nhịp của bạn <ArrowUpRight size={18} />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <p>Những bài hát hay xứng đáng được nghe cùng nhau.</p>
        <div>
          <Link to="/privacy">Quyền riêng tư</Link>
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">
            Điều khoản YouTube
          </a>
        </div>
        <span>© {new Date().getFullYear()} ROOMTUNE</span>
      </footer>
    </div>
  );
}
