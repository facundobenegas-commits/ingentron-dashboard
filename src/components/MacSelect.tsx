import React, { useEffect, useRef, useState } from 'react';

export interface MacSelectOption {
  value: string;
  label: string;
}

interface MacSelectProps {
  /** id for the trigger button; also used to derive option ids for aria-activedescendant */
  id: string;
  /** label shown above the control (icon + text) */
  label: React.ReactNode;
  /** currently selected value */
  value: string;
  /** available options (include the "all"/default option explicitly) */
  options: MacSelectOption[];
  /** whether this dropdown is currently open (controlled by the parent, one-at-a-time) */
  isOpen: boolean;
  /** toggle open/closed (parent owns the shared activeDropdown state) */
  onToggle: () => void;
  /** called with the chosen value */
  onSelect: (value: string) => void;
}

/**
 * Accessible custom "macOS style" select. Keeps the original .mac-select-* markup/classes
 * (so the existing styles apply) but adds full keyboard support and ARIA roles:
 *  - Trigger: aria-haspopup/aria-expanded; ArrowDown/Enter/Space opens.
 *  - Listbox: role=listbox with aria-activedescendant; ArrowUp/Down/Home/End move,
 *    Enter/Space selects, Escape closes.
 */
export const MacSelect: React.FC<MacSelectProps> = ({ id, label, value, options, isOpen, onToggle, onSelect }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  const displayLabel = options.find(o => o.value === value)?.label ?? '';

  // When opened, highlight the selected option and move focus into the list.
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(selectedIndex);
      requestAnimationFrame(() => listRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const commit = (index: number) => {
    const opt = options[index];
    if (opt) onSelect(opt.value);
    onToggle(); // close after choosing
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) onToggle();
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        onToggle();
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="mac-select-wrapper"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <button
        type="button"
        id={id}
        className={`mac-select-trigger ${isOpen ? 'active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="mac-select-value">{displayLabel}</span>
        <i className="fas fa-chevron-down mac-select-arrow"></i>
      </button>
      {isOpen && (
        <div
          className="mac-select-dropdown show"
          role="listbox"
          aria-label={typeof label === 'string' ? label : id}
          tabIndex={-1}
          ref={listRef}
          aria-activedescendant={`${id}-opt-${activeIndex}`}
          onKeyDown={handleListKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt, idx) => (
            <div
              key={opt.value}
              id={`${id}-opt-${idx}`}
              role="option"
              aria-selected={opt.value === value}
              className={`mac-select-option ${opt.value === value ? 'selected' : ''} ${idx === activeIndex ? 'active-option' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => commit(idx)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
