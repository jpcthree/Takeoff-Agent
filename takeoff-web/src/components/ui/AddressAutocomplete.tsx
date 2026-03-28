'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface Suggestion {
  place_id: string;
  description: string;
}

interface AddressAutocompleteProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called when user selects a suggestion (full formatted address) */
  onSelect?: (address: string) => void;
}

/**
 * Address input with Google Places Autocomplete suggestions.
 * Uses the Places Autocomplete API via a Next.js proxy to keep the key server-side.
 */
function AddressAutocomplete({
  label,
  placeholder = 'e.g. 123 Main St, Austin, TX',
  value,
  onChange,
  onSelect,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(input)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.predictions || []);
        setShowDropdown(data.predictions?.length > 0);
        setHighlightIndex(-1);
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    // Debounce API calls
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = (suggestion: Suggestion) => {
    onChange(suggestion.description);
    onSelect?.(suggestion.description);
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <MapPin className="h-4 w-4" />
        </div>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={[
            'w-full rounded-lg border bg-white pl-10 pr-8 py-2 text-sm text-gray-900',
            'placeholder:text-gray-400',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary',
            'border-gray-300',
          ].join(' ')}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
          </div>
        )}

        {/* Suggestions dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-[240px] overflow-y-auto">
            {suggestions.map((s, i) => (
              <li
                key={s.place_id}
                onClick={() => handleSelect(s)}
                onMouseEnter={() => setHighlightIndex(i)}
                className={[
                  'flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors',
                  i === highlightIndex ? 'bg-primary/5 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="truncate">{s.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export { AddressAutocomplete };
