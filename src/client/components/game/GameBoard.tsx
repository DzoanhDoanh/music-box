import { Component, lazy, Suspense, type ReactNode, type ComponentProps } from 'react';
import LudoBoard from './LudoBoard';

const LudoScene = lazy(() => import('./LudoScene'));
export type BoardProps = ComponentProps<typeof LudoBoard>;

class BoardBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function GameBoard({ depth, ...props }: BoardProps & { depth: boolean }) {
  const flat = <LudoBoard {...props} />;
  if (!depth) return flat;
  const fallback = (
    <div className="ludo-render-fallback">
      {flat}
      <span role="status">Thiết bị chưa hỗ trợ 3D. Bạn vẫn chơi được trên bàn phẳng.</span>
    </div>
  );
  return (
    <BoardBoundary fallback={fallback}>
      <Suspense
        fallback={
          <div className="ludo-render-fallback">
            {flat}
            <span role="status">Đang dựng bàn 3D…</span>
          </div>
        }
      >
        <LudoScene {...props} fallback={fallback} />
      </Suspense>
    </BoardBoundary>
  );
}
