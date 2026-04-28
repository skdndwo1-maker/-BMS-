import * as React from "react";
import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm transition-[color,box-shadow] outline-none placeholder:text-gray-400 focus-visible:border-[#FF7F66] focus-visible:ring-[3px] focus-visible:ring-[#FF7F66]/25 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
