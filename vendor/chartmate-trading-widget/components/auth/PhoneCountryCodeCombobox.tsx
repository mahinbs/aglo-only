import { useMemo, useState } from "react";
import type { CountryCode } from "libphonenumber-js";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DEFAULT_SIGNUP_PHONE_ISO,
  getCountryDialOptions,
} from "@/lib/countryDialCodes";
import { cn } from "@/lib/utils";

type PhoneCountryCodeComboboxProps = {
  value: CountryCode;
  onValueChange: (iso: CountryCode) => void;
  id?: string;
  className?: string;
};

export function PhoneCountryCodeCombobox({
  value,
  onValueChange,
  id,
  className,
}: PhoneCountryCodeComboboxProps) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => getCountryDialOptions(), []);

  const selected = useMemo(
    () => options.find((o) => o.iso === value) ?? options.find((o) => o.iso === DEFAULT_SIGNUP_PHONE_ISO),
    [options, value],
  );

  const displayDial = selected?.dial ?? "+91";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-10 w-[5.25rem] sm:w-24 shrink-0 justify-between gap-0.5 px-2 font-mono text-sm tabular-nums",
            className,
          )}
        >
          <span className="truncate">{displayDial}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,380px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search +91, India…" className="h-10" />
          <CommandList>
            <CommandEmpty>No calling code found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.iso}
                  value={o.searchValue}
                  onSelect={() => {
                    onValueChange(o.iso);
                    setOpen(false);
                  }}
                  className="items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === o.iso ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <span className="truncate text-sm text-foreground">{o.countryName}</span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                      {o.dial}
                    </span>
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
