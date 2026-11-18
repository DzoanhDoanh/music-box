import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Check, Play, RotateCcw, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { PieceSkin } from '../../../shared/game/piece-skins';
import type { CaptureEffectId } from '../../lib/capture-effect';
import { Modal, Button } from '../ui';
import { boardEffects, EffectCallout } from './board-effects';
import MovingPiece, { pieceColors } from './MovingPiece';

class PreviewBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? (
      <p>Không thể dựng bản xem thử 3D trên thiết bị này.</p>
    ) : (
      this.props.children
    );
  }
}

function PreviewCamera() {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    camera.lookAt(0, 0.6, 0);
    camera.zoom = Math.min(size.width / 12, size.height / 9);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);
  return null;
}

type PreviewProps = {
  skin?: PieceSkin;
  color: number;
  light: boolean;
  activeEffect: CaptureEffectId;
  onApply: (effect: CaptureEffectId) => boolean;
};
function EffectLab({ skin, color, light, activeEffect, onApply }: PreviewProps) {
  const [selected, setSelected] = useState(activeEffect);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const effect = boardEffects.find((e) => e.id === selected) ?? boardEffects[0];
  const Attacker = effect.Attacker ?? MovingPiece;
  const complete = useCallback(() => setPlaying(false), []);
  const fail = useCallback(() => {
    setFailed(true);
    setPlaying(false);
  }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const canAnimate = !preference.matches && !document.hidden;
      setAllowed(canAnimate);
      if (!canAnimate) setPlaying(false);
    };
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return (
    <>
      <label className="effect-picker">
        Hiệu ứng
        <select
          value={selected}
          onChange={(e) => {
            setPlaying(false);
            setRun(0);
            const choice = boardEffects.find((entry) => entry.id === e.target.value);
            if (choice) setSelected(choice.id);
          }}
        >
          {boardEffects.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <p className="effect-description">{effect.description}</p>
      <div
        className="effect-preview-stage"
        aria-label="Sân khấu xem thử hiệu ứng"
        data-playing={playing}
      >
        <span className="effect-preview-badge">QUÂN MẪU</span>
        {failed ? (
          <p className="effect-preview-error" role="status">
            Không thể dựng bản xem thử 3D. Bạn vẫn có thể đóng cửa sổ và tiếp tục chơi.
          </p>
        ) : (
          <PreviewBoundary onError={fail}>
            <Canvas
              orthographic
              camera={{ position: [5, 9, 11], zoom: 25 }}
              frameloop="demand"
              dpr={light ? 1 : 2}
              gl={{ antialias: true, alpha: true }}
              onCreated={({ gl }) => {
                setReady(true);
                gl.domElement.addEventListener('webglcontextlost', fail, { once: true });
              }}
            >
              <PreviewCamera />
              <ambientLight intensity={1.2} />
              <directionalLight position={[-5, 10, 5]} intensity={2.7} />
              <directionalLight position={[5, 6, -3]} intensity={1.6} color="#9ccfff" />
              <mesh position={[0, -0.18, 0]}>
                <cylinderGeometry args={[5.5, 5.6, 0.3, 80]} />
                <meshStandardMaterial color="#23394b" metalness={0.3} roughness={0.5} />
              </mesh>
              {[2, 4, 5.45].map((radius) => (
                <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
                  <torusGeometry args={[radius, 0.015, 6, 80]} />
                  <meshBasicMaterial color="#69818d" />
                </mesh>
              ))}
              <Attacker
                key={`attacker:${selected}:${run}:${playing}`}
                color={color}
                skin={skin}
                position={playing ? effect.demo.cue.points.at(-1)! : effect.demo.cue.points[0]}
                plan={playing ? effect.demo.cue : undefined}
                animate={playing && allowed}
                effectStatus={overlay}
                light={light}
              />
              <MovingPiece
                key={`victim:${selected}:${run}:${playing}`}
                color={(color + 1) % 4}
                skin="HORSE"
                position={
                  playing ? effect.demo.victim.points.at(-1)! : effect.demo.victim.points[0]
                }
                plan={playing ? effect.demo.victim : undefined}
                animate={playing && allowed}
              />
              {playing && (
                <effect.Renderer
                  key={`${selected}:${run}`}
                  plan={effect.demo.cue}
                  color={pieceColors[color]}
                  enabled={allowed}
                  light={light}
                  overlay={overlay}
                  onComplete={complete}
                />
              )}
            </Canvas>
          </PreviewBoundary>
        )}
        <EffectCallout
          overlay={overlay}
          effect={effect}
          color={color}
          detail="Xem thử · Quân mẫu"
        />
      </div>
      <div className="effect-preview-actions">
        <Button
          variant="primary"
          disabled={!ready || failed || !allowed}
          onClick={() => {
            setRun((n) => n + 1);
            setPlaying(true);
          }}
        >
          {run ? <RotateCcw size={16} /> : <Play size={16} />}{' '}
          {run ? 'Phát lại' : 'Xem thử ' + effect.name}
        </Button>
        <Button disabled={!playing} onClick={complete}>
          <Square size={14} /> Dừng
        </Button>
        <span role="status">
          {failed
            ? 'Không thể xem thử'
            : !allowed
              ? 'Đang bật giảm chuyển động hoặc trang đang ẩn.'
              : !ready
                ? 'Đang dựng sân khấu…'
                : playing
                  ? 'Đang xem thử…'
                  : 'Sẵn sàng'}
        </span>
      </div>
      <div className="effect-apply">
        <span>Hiệu ứng trên thiết bị này</span>
        <Button
          disabled={selected === activeEffect}
          onClick={() => {
            const saved = onApply(selected);
            toast.success(
              saved
                ? `Đã dùng hiệu ứng ${effect.name}.`
                : `Đã dùng ${effect.name} cho phiên này; trình duyệt chưa lưu được lựa chọn.`,
            );
          }}
        >
          {selected === activeEffect && <Check size={16} />}
          {selected === activeEffect ? 'Đang dùng' : 'Dùng ' + effect.name}
        </Button>
      </div>
    </>
  );
}

export default function EffectPreview(props: PreviewProps) {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      title="Thử hiệu ứng"
      description="Chọn hiệu ứng để xem với quân mẫu. Chỉ bạn nhìn thấy; ván đang chơi vẫn giữ nguyên."
      open={open}
      onOpenChange={setOpen}
      className="effect-preview-dialog"
      trigger={
        <Button className="ludo-effects-trigger" variant="secondary">
          <Sparkles size={15} /> Thử hiệu ứng
        </Button>
      }
    >
      {open && <EffectLab {...props} />}
    </Modal>
  );
}
