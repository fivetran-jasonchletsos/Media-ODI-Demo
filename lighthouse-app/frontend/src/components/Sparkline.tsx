// Pure-SVG sparkline. No deps. Min→max scaling over values[] with a slight
// vertical pad so the stroke never grazes the edges. Optional faint fill area
// and a marker dot on the last point in the stroke color.

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  strokeWidth?: number;
}

export default function Sparkline({
  values,
  width = 80,
  height = 24,
  stroke = 'currentColor',
  fill = 'none',
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }

  const padX = 1;
  const padY = 2;
  const w = Math.max(1, width - padX * 2);
  const h = Math.max(1, height - padY * 2);

  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = padY + h - ((v - min) / range) * h;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const last = points[points.length - 1];

  const hasFill = fill && fill !== 'none';
  const areaPath = hasFill
    ? `${linePath} ${(padX + w).toFixed(2)},${(padY + h).toFixed(2)} ${padX.toFixed(2)},${(padY + h).toFixed(2)}`
    : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      {areaPath && (
        <polygon points={areaPath} fill={fill} opacity={0.15} stroke="none" />
      )}
      <polyline
        points={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={Math.max(1.4, strokeWidth)} fill={stroke} />
    </svg>
  );
}
