import { useEffect, useRef, useState } from 'react';
import type { GeocodingProvider, GeocodingSuggestion } from '@kavriqo/maps';

/**
 * Address autocomplete (07-C04) over the geocoding adapter — rendered
 * only when the provider reports `enabled`; otherwise the plain city
 * input is used. Degrades cleanly when the capability is unconfigured
 * (docs/07).
 */

export interface AutocompleteInputProps {
  geocoding: GeocodingProvider;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: GeocodingSuggestion) => void;
  placeholder: string;
  label: string;
}

const DEBOUNCE_MS = 250;

export function AutocompleteInput({
  geocoding,
  value,
  onChange,
  onSelect,
  placeholder,
  label,
}: AutocompleteInputProps): React.JSX.Element {
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (!geocoding.enabled || query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      geocoding
        .suggest(query, { limit: 6 })
        .then((next) => {
          if (requestId === requestIdRef.current) {
            setSuggestions(next);
            setActiveIndex(0);
            setOpen(true);
          }
        })
        .catch(() => {
          if (requestId === requestIdRef.current) {
            setSuggestions([]);
            setOpen(false);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, geocoding]);

  function choose(suggestion: GeocodingSuggestion): void {
    onChange(suggestion.label);
    onSelect(suggestion);
    setOpen(false);
    setSuggestions([]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (!open || suggestions.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) {
        choose(suggestion);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="kv-autocomplete">
      <label className="kv-field__label" htmlFor="kv-pickup-input">
        {label}
      </label>
      <input
        id="kv-pickup-input"
        className="kv-input"
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) {
            setOpen(true);
          }
        }}
        onBlur={() => {
          // Delay so a click on a suggestion registers before closing.
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 ? (
        <ul className="kv-autocomplete__list" role="listbox">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.latitude}-${suggestion.longitude}-${index}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'kv-autocomplete__option kv-autocomplete__option--active' : 'kv-autocomplete__option'}
                onMouseDown={(event) => {
                  // Keep focus in the input; onClick on the button would
                  // fire after blur already closed the list.
                  event.preventDefault();
                  choose(suggestion);
                }}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
