'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Hotel } from '@/lib/types';

/**
 * Searchable "select a saved hotel" combobox. Not bound to a single
 * react-hook-form field — selecting a hotel needs to populate several
 * booking-form fields at once, so the caller owns that via onSelect.
 */
export function HotelPicker({
  hotels,
  value,
  onSelect,
  isLoading,
}: {
  hotels: Hotel[];
  value?: string;
  onSelect: (hotel: Hotel) => void;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = hotels.find((h) => h.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn('w-full justify-between', !selected && 'text-muted-foreground')}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              {selected.name}
              {(selected.city || selected.country) && (
                <span className="text-xs text-muted-foreground truncate">
                  ({[selected.city, selected.country].filter(Boolean).join(', ')})
                </span>
              )}
            </span>
          ) : isLoading ? (
            'Loading hotels...'
          ) : (
            'Select a saved hotel...'
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[--radix-popover-trigger-width] p-0"
        side="bottom"
        align="start"
        avoidCollisions={false}
      >
        <Command>
          <CommandInput placeholder="Search hotels..." className="h-9" />
          <CommandList className="max-h-60 overflow-y-auto overscroll-contain">
            <CommandEmpty>No hotels found.</CommandEmpty>
            <CommandGroup>
              {hotels.map((h) => (
                <CommandItem
                  key={h.id}
                  value={`${h.name} ${h.city || ''} ${h.country || ''}`}
                  onSelect={() => {
                    onSelect(h);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', h.id === value ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex flex-col">
                    <span>{h.name}</span>
                    {(h.city || h.country) && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[h.city, h.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
