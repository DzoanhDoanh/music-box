import { Check } from 'lucide-react';
import {
  pieceSkins,
  pieceSkinGroups,
  pieceSkinName,
  type PieceSkin,
} from '../../../shared/game/piece-skins';
import { PiecePreview } from './PieceFigure';

export default function PieceSkinPicker({
  value,
  onChange,
  color = 0,
  disabled = false,
}: {
  value: PieceSkin;
  onChange: (skin: PieceSkin) => void;
  color?: number;
  disabled?: boolean;
}) {
  return (
    <div className="piece-picker">
      <div className={'piece-picker-preview ludo-color-' + color}>
        <div aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <PiecePreview key={n} number={n} skin={value} color={color} />
          ))}
        </div>
        <strong>{pieceSkinName(value)}</strong>
        <span>Cả 4 quân dùng hình này, giữ màu đội và số thứ tự.</span>
      </div>
      {pieceSkinGroups.map((group) => (
        <fieldset disabled={disabled} key={group} className="piece-picker-group">
          <legend>{group}</legend>
          <div className="piece-picker-grid">
            {pieceSkins
              .filter((s) => s.group === group)
              .map((s) => (
                <label
                  key={s.id}
                  className={'piece-picker-option' + (value === s.id ? ' selected' : '')}
                >
                  <input
                    type="radio"
                    name="piece-skin"
                    value={s.id}
                    checked={value === s.id}
                    onChange={() => onChange(s.id)}
                  />
                  <PiecePreview skin={s.id} color={color} />
                  <span>{s.name}</span>
                  {value === s.id && (
                    <Check size={14} className="piece-picker-check" aria-hidden="true" />
                  )}
                </label>
              ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
