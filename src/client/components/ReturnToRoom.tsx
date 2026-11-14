import { ArrowRight, Headphones } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useJoinedRooms } from '../lib/joined-rooms';
import { Button } from './ui';

export default function ReturnToRoom({ code }: { code?: string | null }) {
  const { rooms, isSuccess } = useJoinedRooms();
  const requested = code?.trim().toUpperCase();
  const entry = requested ? rooms.find(({ room }) => room.code === requested) : rooms[0];
  if (!isSuccess || !entry) return null;
  return (
    <section className="return-room" aria-label="Quay lại phòng đã tham gia">
      <span className="return-room-icon" aria-hidden="true">
        <Headphones size={25} />
      </span>
      <div className="return-room-copy">
        <span className="return-room-caption">CHÀO MỪNG TRỞ LẠI</span>
        <h2>{entry.room.name}</h2>
        <p>Phòng của bạn vẫn ở đây. Vào nghe tiếp thôi.</p>
      </div>
      <div className="return-room-actions">
        <Button asChild variant="primary">
          <Link to={`/room/${entry.room.id}`}>
            Vào lại phòng <ArrowRight size={17} />
          </Link>
        </Button>
        <Link className="return-room-all" to="/rooms">
          Tất cả phòng của bạn
        </Link>
      </div>
    </section>
  );
}
