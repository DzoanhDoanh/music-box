import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Notifications from './components/Notifications';
import FloatingChat from './components/FloatingChat';
import { Moon, Sun, WifiOff } from 'lucide-react';
import Landing from './routes/Landing';
const Join = lazy(() => import('./routes/Access').then((m) => ({ default: m.Join }))),
  Login = lazy(() => import('./routes/Access').then((m) => ({ default: m.Login }))),
  Rooms = lazy(() => import('./routes/Access').then((m) => ({ default: m.Rooms })));
import { Button, Brand, ErrorState, Loading } from './components/ui';
import './styles.css';
import './components/chat.css';
const Room = lazy(() => import('./routes/Room'));
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
class Boundary extends Component<
  {
    children: ReactNode;
  },
  {
    error: Error | null;
  }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <ErrorState
        error={new Error('Màn hình gặp lỗi. Hãy tải lại trang để khôi phục phiên.')}
        retry={() => location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [light, setLight] = useState(() => localStorage.getItem('roomtune:theme') === 'light'),
    [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    localStorage.setItem('roomtune:theme', light ? 'light' : 'dark');
  }, [light]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return (
    <>
      <a className="skip-link" href="#root-main">
        Bỏ qua đến nội dung
      </a>
      {offline && (
        <div className="offline" role="status">
          <WifiOff size={17} /> Mất kết nối. Các thay đổi chưa gửi sẽ không được lưu.
        </div>
      )}
      <div id="root-main">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/join" element={<Join />} />
            <Route path="/login" element={<Login />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/room/:id/*" element={<Room />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="*"
              element={
                <div className="not-found">
                  <Brand />
                  <h1>404</h1>
                  <h2>Có vẻ bạn đã lạc nhịp.</h2>
                  <p>Trang này không tồn tại hoặc đã được di chuyển.</p>
                  <Button asChild variant="primary">
                    <Link to="/">Về trang chủ</Link>
                  </Button>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </div>
      <FloatingChat>
        <Button
          variant="secondary"
          size="icon"
          className="theme-switch"
          aria-label={light ? 'Chuyển giao diện tối' : 'Chuyển giao diện sáng'}
          onClick={() => setLight((v) => !v)}
        >
          {light ? <Moon size={18} /> : <Sun size={18} />}
        </Button>
      </FloatingChat>
      <Notifications light={light} />
    </>
  );
}
function Privacy() {
  return (
    <div className="page-content prose">
      <Brand />
      <h1>Quyền riêng tư & dữ liệu</h1>
      <p>
        Tìm bằng giọng nói chỉ bật khi bạn nhấn micro. Trình duyệt có thể gửi âm thanh đến dịch vụ
        nhận dạng của nhà cung cấp; ROOMTUNE không lưu bản ghi âm. Văn bản nhận dạng được dùng để
        tìm bài hát giống như khi bạn gõ vào ô tìm kiếm.
      </p>
      <p>
        Khi dùng vòng quay, danh sách lựa chọn, kết quả và phần thưởng được lưu trong phòng để các
        thành viên xem chung. Danh sách tự nhập chưa quay được giữ trong phiên trình duyệt trên
        thiết bị của bạn.
      </p>
      <p>
        Chat chỉ dành cho thành viên trong phòng. Mỗi tin tối đa 1.000 ký tự; khung chat hiển thị
        100 tin gần nhất trong 30 ngày. Bạn có thể xóa tin của mình; chủ phòng và người điều hành có
        thể xóa tin trong phòng. Nội dung đã xóa không được giữ trong lịch sử chat hoặc bản xuất dữ
        liệu. Xóa tài khoản cũng xóa các tin do tài khoản đó gửi.
      </p>
      <p>
        ROOMTUNE lưu tên hiển thị, tư cách thành viên, bài yêu cầu, lượt bình chọn, lịch sử phát và
        thư viện cá nhân để cung cấp trải nghiệm nghe chung. Phiên đăng nhập ẩn danh được lưu trong
        trình duyệt; xóa dữ liệu trình duyệt có thể khiến bạn mất quyền truy cập hồ sơ đó.
      </p>
      <p>
        Ứng dụng sử dụng YouTube API Services và trình phát YouTube. Khi phát trên máy host hoặc bật
        nghe trên thiết bị của bạn trong chế độ tất cả thiết bị, YouTube có thể nhận địa chỉ IP,
        thông tin thiết bị và đặt cookie theo chính sách của Google. Trang giới thiệu không tải
        iframe YouTube.
      </p>
      <p>
        <a href="https://policies.google.com/privacy">Chính sách quyền riêng tư Google</a> ·{' '}
        <a href="https://www.youtube.com/t/terms">Điều khoản dịch vụ YouTube</a>
      </p>
      <p>
        Chủ phòng có thể quản lý thành viên và xem nhật ký trong phòng. Trong Thư viện, bạn có thể
        xuất dữ liệu JSON hoặc xóa tài khoản. Queue/history được bỏ liên kết với identity đã xóa;
        chủ phòng cần chuyển quyền trước khi xóa. Nhà vận hành cần công bố thông tin liên hệ và thời
        hạn lưu dữ liệu trước khi phát hành công khai.
      </p>
      <Button asChild>
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <QueryClientProvider client={client}>
      <Boundary>
        <App />
      </Boundary>
    </QueryClientProvider>
  </BrowserRouter>,
);
