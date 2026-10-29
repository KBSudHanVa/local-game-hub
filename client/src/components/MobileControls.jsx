export function MobileControls({ title, children }) {
  return (
    <details className="mobile-controls-accordion">
      <summary>{title}<span aria-hidden="true">⌄</span></summary>
      <div className="mobile-controls-content">{children}</div>
    </details>
  );
}

export function TouchDpad({
  className,
  dpadClassName = className,
  active,
  onDirection,
  includeFire = false,
  stopPropagation = false,
}) {
  const directions = [
    { direction: 'up', label: 'Move up', icon: '↑' },
    { direction: 'left', label: 'Move left', icon: '←' },
    { direction: 'down', label: 'Move down', icon: '↓' },
    { direction: 'right', label: 'Move right', icon: '→' },
  ];
  const startPress = (event, direction) => {
    event.preventDefault();
    if (stopPropagation) event.stopPropagation();
    onDirection(direction, true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endPress = (direction) => onDirection(direction, false);

  return (
    <div
      className={className}
      role="group"
      aria-label={includeFire ? 'Touch movement and firing controls' : 'Touch movement controls'}
    >
      <div className={dpadClassName}>
        {directions.map(({ direction, label, icon }) => (
          <button
            key={direction}
            type="button"
            aria-label={label}
            disabled={!active}
            onPointerDown={(event) => startPress(event, direction)}
            onPointerUp={() => endPress(direction)}
            onPointerCancel={() => endPress(direction)}
            onLostPointerCapture={() => endPress(direction)}
          >
            {icon}
          </button>
        ))}
      </div>
      {includeFire && (
        <button
          type="button"
          className="blaster-fire-button"
          aria-label="Fire"
          disabled={!active}
          onPointerDown={(event) => startPress(event, 'shoot')}
          onPointerUp={() => endPress('shoot')}
          onPointerCancel={() => endPress('shoot')}
          onLostPointerCapture={() => endPress('shoot')}
        >
          FIRE
        </button>
      )}
    </div>
  );
}
