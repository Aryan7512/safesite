import { Row } from '@/ui/Layout';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/Text';
import { space } from '@/theme/tokens';
import { useDash } from './store';

/** Shift A/B/C/All + time window 24h/7d/30d — filters every widget (PRD §6). */
export function FilterBar({ note }: { note?: string }) {
  const { shift, window, setShift, setWindow } = useDash();
  return (
    <Row wrap gap={space.md}>
      <Row gap={space.sm}>
        <T v="label" color="dim">
          Shift
        </T>
        <Segmented
          label="Shift"
          value={shift}
          onChange={setShift}
          options={[
            { value: 'All', label: 'All' },
            { value: 'A', label: 'A 06–14' },
            { value: 'B', label: 'B 14–22' },
            { value: 'C', label: 'C 22–06' },
          ]}
        />
      </Row>
      <Row gap={space.sm}>
        <T v="label" color="dim">
          Window
        </T>
        <Segmented
          label="Time window"
          value={window}
          onChange={setWindow}
          options={[
            { value: '24h', label: '24 h' },
            { value: '7d', label: '7 d' },
            { value: '30d', label: '30 d' },
          ]}
        />
      </Row>
      {note ? (
        <T v="small" color="faint">
          {note}
        </T>
      ) : null}
    </Row>
  );
}
