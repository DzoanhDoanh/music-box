import Captcha, { captchaRequired } from '../components/Captcha';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Headphones, LockKeyhole } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { joinSchema, type Room } from '../../shared/contracts';
import { api, supabase, ensureSession } from '../lib/api';
import { Brand, Button, Eyebrow, ErrorState, Loading, Empty, Modal } from '../components/ui';
import ReturnToRoom from '../components/ReturnToRoom';
import { useJoinedRooms } from '../lib/joined-rooms';
export function Join() {
  const client = useQueryClient();
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const form = useForm<z.input<typeof joinSchema>, unknown, z.output<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      code: params.get('code') ?? '',
      name: localStorage.getItem('roomtune:name') ?? '',
      pin: '',
    },
  });
  const [error, setError] = useState('');
  return (
    <AccessFrame>
      <Eyebrow>CHÀO MỪNG ĐẾN VỚI ROOMTUNE</Eyebrow>
      <h1>Nhịp vui đang chờ bạn.</h1>
      <p>Nhập mã phòng và một cái tên. Chỉ vậy thôi.</p>
      <ReturnToRoom code={params.get('code')} />
      <form
        onSubmit={form.handleSubmit(async (data) => {
          setError('');
          try {
            await ensureSession(captcha || undefined);
            const room = await api<{
              id: string;
            }>('/rooms/join', data);
            localStorage.setItem('roomtune:name', data.name);
            void client.invalidateQueries({ queryKey: ['rooms'] });
            navigate(`/room/${room.id}`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            if (captchaRequired) {
              setCaptcha('');
              setCaptchaReset((value) => value + 1);
            }
          }
        })}
      >
        <label>
          Mã phòng
          <input
            autoComplete="off"
            placeholder="VD: A1B2C3D4"
            className="room-code-input"
            {...form.register('code')}
          />
        </label>
        <FieldError
          message={form.formState.errors.code && 'Mã phòng gồm 6–10 chữ cái hoặc chữ số.'}
        />
        <label>
          Tên của bạn
          <input
            autoComplete="nickname"
            placeholder="Mọi người gọi bạn là…"
            {...form.register('name')}
          />
        </label>
        <FieldError
          message={form.formState.errors.name && 'Vui lòng nhập tên từ 2 đến 40 ký tự.'}
        />
        <label>
          PIN <span className="muted">(nếu phòng yêu cầu)</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="Nhập mã PIN"
            {...form.register('pin')}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Captcha onToken={setCaptcha} resetKey={captchaReset} />
        <Button
          variant="primary"
          loading={form.formState.isSubmitting}
          disabled={form.formState.isSubmitting || (captchaRequired && !captcha)}
          type="submit"
        >
          {form.formState.isSubmitting ? 'Đang vào phòng…' : 'Cùng nghe nhạc'}
          <ArrowUpRight size={18} />
        </Button>
      </form>
      <div className="access-note">
        <LockKeyhole size={15} /> Phiên ẩn danh được lưu trên thiết bị này.
      </div>
      <p className="access-note">
        Đã từng tham gia? <Link to="/rooms">Mở phòng của bạn</Link>
      </p>
    </AccessFrame>
  );
}
function FieldError({ message }: { message?: string }) {
  return message ? (
    <small className="form-error" role="alert">
      {message}
    </small>
  ) : null;
}
function AccessFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="access-page">
      <header>
        <Brand />
        <Link to="/">
          <ArrowLeft size={16} /> Về trang chủ
        </Link>
      </header>
      <main>
        <div className="access-art">
          <Headphones size={64} />
          <h2>
            Mỗi bài hát,
            <br />
            một kết nối.
          </h2>
          <p>
            Chọn bài bạn thích.
            <br />
            Nghe cùng người bạn quý.
          </p>
          <div className="waveform">
            {Array.from({ length: 20 }, (_, i) => (
              <i key={i} style={{ height: `${20 + ((i * 13) % 60)}px` }} />
            ))}
          </div>
        </div>
        <div className="access-form">{children}</div>
      </main>
    </div>
  );
}
export function Login() {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const navigate = useNavigate(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <AccessFrame>
      <Eyebrow>DÀNH CHO CHỦ PHÒNG</Eyebrow>
      <h1>Chào mừng trở lại.</h1>
      <p>Đăng nhập tài khoản được người quản trị cấp.</p>
      <ReturnToRoom />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError('');
          const f = new FormData(e.currentTarget);
          try {
            if (!supabase)
              throw new Error('Dịch vụ chưa được cấu hình. Vui lòng liên hệ người quản trị.');
            const r = await supabase.auth.signInWithPassword({
              email: String(f.get('email')),
              password: String(f.get('password')),
              options: { captchaToken: captcha || undefined },
            });
            if (r.error) throw new Error('Email hoặc mật khẩu chưa đúng.');
            client.clear();
            const room = params.get('room');
            navigate(room && /^[\da-f-]{36}$/i.test(room) ? `/room/${room}` : '/rooms');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
            if (captchaRequired) {
              setCaptcha('');
              setCaptchaReset((value) => value + 1);
            }
          }
        }}
      >
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="ban@example.com"
          />
        </label>
        <label>
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="Mật khẩu của bạn"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Captcha onToken={setCaptcha} resetKey={captchaReset} />
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          disabled={pending || (captchaRequired && !captcha)}
        >
          {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          <ArrowUpRight size={17} />
        </Button>
      </form>
      <p className="access-note">
        Bạn chỉ muốn nghe nhạc? <Link to="/join">Tham gia phòng</Link>
      </p>
    </AccessFrame>
  );
}
export function Rooms() {
  const client = useQueryClient();
  const navigate = useNavigate(),
    [open, setOpen] = useState(false),
    [pending, setPending] = useState(false);
  const query = useJoinedRooms();
  return (
    <div className="page-shell">
      <header className="page-top">
        <Brand />
        <div>
          <Button asChild>
            <Link to="/join">Vào phòng mới</Link>
          </Button>
          {query.session?.user.is_anonymous !== false && (
            <Button asChild variant="ghost">
              <Link to="/login">Đăng nhập chủ phòng</Link>
            </Button>
          )}
        </div>
      </header>
      <main className="page-content">
        <Eyebrow>KHÔNG GIAN CỦA BẠN</Eyebrow>
        <div className="section-heading">
          <div>
            <h1>Phòng của bạn</h1>
            <p>Chọn một phòng để nghe tiếp. Không cần nhập lại mã phòng.</p>
          </div>
          {query.data?.canCreate && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              Tạo phòng mới
            </Button>
          )}
        </div>
        {query.restoring || (query.session && query.isPending) ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : query.rooms.length ? (
          <div className="room-cards">
            {query.rooms.map(({ room, role }) => (
              <Link
                className={`room-card${room.id === query.recentId ? ' room-card-recent' : ''}`}
                to={`/room/${room.id}`}
                key={room.id}
                aria-label={`Vào lại phòng ${room.name}`}
              >
                <Headphones size={28} />
                {room.id === query.recentId && <span className="room-recent-badge">VỪA NGHE</span>}
                <span>{role === 'owner' ? 'CHỦ PHÒNG' : 'THÀNH VIÊN'}</span>
                <h2>{room.name}</h2>
                <p>{room.description || 'Một không gian để cùng nghe nhạc.'}</p>
                <div>
                  Vào lại phòng
                  <ArrowUpRight size={20} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="Một căn phòng đang chờ bạn"
            action={
              <Button asChild variant="primary">
                <Link to="/join">Tham gia bằng mã phòng</Link>
              </Button>
            }
          >
            Sau lần tham gia đầu tiên, phòng sẽ được giữ tại đây để bạn vào lại bằng một chạm.
          </Empty>
        )}
      </main>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Tạo không gian mới"
        description="Đặt tên cho phòng và mời mọi người cùng nghe."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const f = new FormData(e.currentTarget);
            try {
              const room = await api<Room>('/rooms', {
                name: f.get('name'),
                description: f.get('description'),
                pin: f.get('pin'),
              });
              void client.invalidateQueries({ queryKey: ['rooms'] });
              navigate(`/room/${room.id}`);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Tên phòng
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Góc nhạc của chúng mình"
            />
          </label>
          <label>
            Mô tả
            <input name="description" maxLength={240} />
          </label>
          <label>
            PIN tùy chọn
            <input name="pin" type="password" maxLength={32} />
          </label>
          <Button variant="primary" loading={pending} type="submit">
            {pending ? 'Đang tạo…' : 'Tạo phòng'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
